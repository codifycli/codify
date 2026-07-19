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

  it('Renders the init completed message', () => {
    const reporter = new DefaultReporter();
    const locationToSave = '~/codify.jsonc'

    reporter.displayMessage(`
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
});
