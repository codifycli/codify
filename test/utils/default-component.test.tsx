import chalk from 'chalk';
import type * as Ink from 'ink';
import { Text } from 'ink';
import { cleanup, render } from './helpers/ink-testing-library.js';
import { EventEmitter } from 'node:events';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Console } from 'node:console';

import { DefaultComponent } from '../../src/ui/components/default-component.js';
import { DefaultReporter } from '../../src/ui/reporters/default-reporter.js';
import { RenderStatus, store } from '../../src/ui/store/index.js';
import { PromptType, RenderEvent } from '../../src/ui/reporters/reporter.js';
import { ResourceInfo } from '../../src/entities/resource-info.js';
import { ResourceConfig } from '../../src/entities/resource-config.js';

// Polyfill console.Console for the test environment (required by patch-console/Ink)
if (!console.Console) {
  // @ts-expect-error - Polyfilling console.Console for test environment
  console.Console = Console;
}

// Mock dependent components (paths are relative to this test file, not to default-component.tsx)
vi.mock('../../src/ui/components/progress/progress-display.js', () => ({
  ProgressDisplay: () => <Text>Mock Progress Display</Text>
}));
vi.mock('../../src/ui/components/plan/plan.js', () => ({
  PlanComponent: () => <Text>Mock Plan Component</Text>
}));

// DefaultReporter's constructor calls the real `ink.render()` internally and
// never unmounts the instance. Left alive, it keeps re-rendering off the
// shared `store` singleton against the real (interval-driven)
// ProgressDisplay/PlanComponent whenever a later test updates render state,
// which runs away and OOMs the worker. Wrap `ink.render` so every instance
// it creates gets tracked and unmounted in `afterEach`.
const inkInstances: ReturnType<typeof Ink.render>[] = [];
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof Ink>();
  return {
    ...actual,
    render: (...args: Parameters<typeof Ink.render>) => {
      const instance = actual.render(...args);
      inkInstances.push(instance);
      return instance;
    },
  };
});

describe('DefaultComponent', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    emitter.removeAllListeners();
    for (const instance of inkInstances.splice(0)) {
      instance.unmount();
    }
  });

  it('Renders the init completed message', async () => {
    const reporter = new DefaultReporter();
    const locationToSave = '~/codify.jsonc'

    await reporter.displayMessage(`
🎉🎉 Codify successfully initialized. 🎉🎉
The imported configs were written to: ${locationToSave}

Use ${chalk.bgHex('#F0EAD6').bold(' codify plan ')} to futures compute changes and ${chalk.bgHex('#F0EAD6').bold(' codify apply ')} to apply them.
Visit the documentation for more info: https://codifycli.com/docs.
    `)
  })

  it('renders progress display when renderStatus is PROGRESS', () => {
    store.set(store.renderState, { status: RenderStatus.PROGRESS });
    const { lastFrame } = render(<DefaultComponent emitter={emitter} />);

    expect(lastFrame()).toContain('Mock Progress Display');
  });

  it('renders the plan when renderStatus is DISPLAY_PLAN', () => {
    store.set(store.renderState, { status: RenderStatus.DISPLAY_PLAN, data: {} });
    const { lastFrame } = render(<DefaultComponent emitter={emitter} />);

    expect(lastFrame()).toContain('Mock Plan Component');
  });

  it('handles SUDO_PROMPT event and submits password', () => {
    store.set(store.renderState, { status: RenderStatus.SUDO_PROMPT, data: 'message' });
    const { lastFrame } = render(<DefaultComponent emitter={emitter} />);

    expect(lastFrame()).toContain('Password:');
  });

  it('renders the missing parameters list and emits the values', async () => {
    store.set(store.renderState, {
      status: RenderStatus.PROMPT_PARAMETER_LIST,
      data: {
        title: 'Missing values',
        resources: [{
          id: 'git-repository',
          config: { type: 'git-repository', repository: 'git@github.com:org/repo.git' },
          fields: [{ path: ['directory'], type: 'string' }],
        }],
      },
    });

    const onResult = vi.fn();
    emitter.on(RenderEvent.PROMPT_PARAMETER_LIST_RESULT, onResult);

    const { lastFrame, stdin } = render(<DefaultComponent emitter={emitter} />);
    expect(lastFrame()).toContain('git-repository · 1 value needed');
    expect(lastFrame()).toContain('"directory":');

    const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
    await tick();
    stdin.write('~/work');
    await tick();
    stdin.write('\r');
    await tick();

    expect(onResult).toHaveBeenCalledWith(['~/work']);
  });

  it('prompts for import / destroy values with the parameter list', async () => {
    const reporter = new DefaultReporter();
    // Only the reporter logic is tested here. The reporter's own ink instance would try to use the real stdin.
    inkInstances.at(-1)?.unmount();
    const info = ResourceInfo.fromResponseData({
      plugin: 'default',
      type: 'git-repository',
      allowMultiple: true,
      sensitiveParameters: ['token'],
      schema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Where the repository is cloned' },
          depth: { type: 'number' },
          token: { type: 'string' },
        },
      },
      importAndDestroy: { requiredParameters: ['directory', 'depth', 'token'] },
    });
    // Values from the existing config are pre-filled
    info.attachDefaultValues(new ResourceConfig({ type: 'git-repository', directory: '~/work' }));

    const result = reporter.promptUserForValues([info], PromptType.DESTROY);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const { status, data } = store.get(store.renderState) as { status: RenderStatus; data: any };
    expect(status).to.eq(RenderStatus.PROMPT_PARAMETER_LIST);
    expect(data.title).to.contain('destroy');
    expect(data.resources[0].fields).toEqual([
      { path: ['directory'], type: 'string', description: 'Where the repository is cloned', sensitive: false, initialValue: '~/work' },
      { path: ['depth'], type: 'number', description: undefined, sensitive: false, initialValue: undefined },
      { path: ['token'], type: 'string', description: undefined, sensitive: true, initialValue: undefined },
    ]);

    // Submit as the component would. Values are converted to the schema types.
    (reporter as any).renderEmitter.emit(RenderEvent.PROMPT_PARAMETER_LIST_RESULT, ['~/work', '1', 'secret']);
    const configs = await result;

    expect(configs.map((c) => c.toJson())).toEqual([
      { core: { type: 'git-repository' }, parameters: { directory: '~/work', depth: 1, token: 'secret' } },
    ]);
  });

  it('throws when the parameter list is cancelled', async () => {
    const reporter = new DefaultReporter();
    // Only the reporter logic is tested here. The reporter's own ink instance would try to use the real stdin.
    inkInstances.at(-1)?.unmount();
    const info = ResourceInfo.fromResponseData({
      plugin: 'default',
      type: 'mock',
      allowMultiple: true,
      schema: { type: 'object', properties: { a: { type: 'string' } } },
      importAndDestroy: { requiredParameters: ['a'] },
    });

    const result = reporter.promptUserForValues([info], PromptType.IMPORT);
    await new Promise((resolve) => setTimeout(resolve, 100));
    (reporter as any).renderEmitter.emit(RenderEvent.PROMPT_PARAMETER_LIST_RESULT, null);

    await expect(result).rejects.toThrow('Cancelled');
  });

  it('emits RENDER_STATE_COMMITTED after each render state change is committed', async () => {
    store.set(store.renderState, { status: RenderStatus.DISPLAY_MESSAGE, data: 'first' });

    const onCommitted = vi.fn();
    emitter.on(RenderEvent.RENDER_STATE_COMMITTED, onCommitted);
    const { lastFrame } = render(<DefaultComponent emitter={emitter} />);
    expect(onCommitted).toHaveBeenCalledTimes(1);

    const committed = new Promise((resolve) => emitter.once(RenderEvent.RENDER_STATE_COMMITTED, resolve));
    store.set(store.renderState, { status: RenderStatus.DISPLAY_MESSAGE, data: 'second' });
    await committed;

    // By the time the event fires, the new state is part of the rendered output
    expect(lastFrame()).toContain('second');
    expect(onCommitted).toHaveBeenCalledTimes(2);
  });

  it('selects init results with the keyboard and emits the selection', async () => {
    store.set(store.renderState, {
      status: RenderStatus.PROMPT_INIT_RESULT_SELECTION,
      data: ['homebrew', 'git'],
    });

    const onResult = vi.fn();
    emitter.on(RenderEvent.PROMPT_RESULT, onResult);

    const { lastFrame, stdin } = render(<DefaultComponent emitter={emitter} />);
    expect(lastFrame()).toContain('Select resources to import:');

    const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
    await tick();
    // Everything starts selected. Items are sorted, so the first one is "git": unselect it, then submit.
    stdin.write(' ');
    await tick();
    stdin.write('\r');
    await tick();

    expect(onResult).toHaveBeenCalledWith(['homebrew']);
  });
});
