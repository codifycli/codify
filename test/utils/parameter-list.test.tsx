import { Console } from 'node:console';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ParameterList, ParameterListResource } from '../../src/ui/components/parameter-list/parameter-list.js';
import { cleanup, render } from './helpers/ink-testing-library.js';

// Polyfill console.Console for the test environment (required by patch-console/Ink)
if (!console.Console) {
  // @ts-expect-error - Polyfilling console.Console for test environment
  console.Console = Console;
}

const KEYS = {
  up: '\u001B[A',
  down: '\u001B[B',
  enter: '\r',
  escape: '\u001B',
  backspace: '\u007F',
};

const resources: ParameterListResource[] = [
  {
    id: 'git-repositories.work',
    config: { type: 'git-repositories', name: 'work', parentDirectory: '~/work', repositories: ['<Replace me here!>'] },
    fields: [{ path: ['repositories'], type: 'array', itemsType: 'string', description: 'Remote repository URLs to clone.' }],
  },
  {
    id: 'ssh-config',
    config: { type: 'ssh-config', hosts: [{ Host: 'github.com' }] },
    fields: [{ path: ['hosts', 0, 'Port'], type: 'number' }],
  },
  {
    id: 'aws-profile',
    config: { type: 'aws-profile', awsAccessKeyId: 'AKIA-existing' },
    sensitiveKeys: ['awsAccessKeyId', 'awsSecretAccessKey'],
    fields: [{ path: ['awsSecretAccessKey'], type: 'string', sensitive: true }],
  },
];

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

async function type(stdin: { write: (data: string) => void }, ...inputs: string[]) {
  for (const input of inputs) {
    stdin.write(input);
    await tick();
  }
}

async function setup(overrides: Partial<React.ComponentProps<typeof ParameterList>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const instance = render(
    <ParameterList maxVisibleLines={100} onCancel={onCancel} onSubmit={onSubmit} resources={resources} title="Missing values" {...overrides} />
  );
  // Ink attaches its stdin listener in an effect after the first render
  await tick();
  return { ...instance, onSubmit, onCancel };
}

const lineContaining = (frame: string, text: string) => frame.split('\n').find((l) => l.includes(text));

describe('ParameterList', () => {
  afterEach(() => {
    cleanup();
  });

  it('Shows every resource in full with the missing values as fields', async () => {
    const { lastFrame } = await setup();
    const frame = lastFrame()!;

    expect(frame).toContain('Missing values');
    expect(frame).toContain('git-repositories.work · 1 value needed');
    expect(frame).toContain('"parentDirectory": "~/work",');
    expect(lineContaining(frame, '"repositories":')).toMatch(/❯/);

    // Missing nested values are shown where they belong
    expect(frame).toContain('"Host": "github.com",');
    expect(lineContaining(frame, '"Port":')).toContain('___');

    // Existing sensitive values are masked
    expect(frame).toContain('"awsAccessKeyId": "********",');
    expect(frame).not.toContain('AKIA-existing');
  });

  it('Shows the description and an example for the focused field only', async () => {
    const { stdin, lastFrame } = await setup();

    expect(lastFrame()).toContain('Remote repository URLs to clone.');
    expect(lastFrame()).toContain('Enter a comma-separated list, e.g. item1, item2, item3');
    expect(lastFrame()).not.toContain('Enter a number');

    await type(stdin, KEYS.down);
    expect(lastFrame()).not.toContain('Remote repository URLs to clone.');
    expect(lastFrame()).toContain('Enter a number');

    await type(stdin, KEYS.down);
    expect(lastFrame()).toContain('Enter text · hidden as you type');
  });

  it('Moves with up / down, types into the focused field and submits from the last field', async () => {
    const { stdin, lastFrame, onSubmit } = await setup();

    await type(stdin, 'a, b', KEYS.enter, '22', KEYS.enter, 'secret');
    expect(lineContaining(lastFrame()!, '"repositories":')).toContain('a, b');
    // Sensitive values are masked
    expect(lastFrame()).toContain('******');
    expect(lastFrame()).not.toContain('secret');

    await type(stdin, KEYS.up, KEYS.up, 'x', KEYS.backspace, KEYS.down, KEYS.down, KEYS.enter);

    expect(onSubmit).toHaveBeenCalledWith(['a, b', '22', 'secret']);
  });

  it('Requires a value before moving on with Enter', async () => {
    const { stdin, lastFrame, onSubmit } = await setup();

    await type(stdin, KEYS.enter);
    expect(lastFrame()).toContain('A value is required');
    // The description stays visible next to the error
    expect(lastFrame()).toContain('Remote repository URLs to clone.');

    // Up / down still move freely
    await type(stdin, KEYS.down, '1', KEYS.down, 's', KEYS.enter);
    expect(onSubmit).not.toHaveBeenCalled();
    // Jumped back to the first empty field
    expect(lineContaining(lastFrame()!, '"repositories":')).toMatch(/❯/);
  });

  it('Validates numbers', async () => {
    const { stdin, lastFrame } = await setup();

    await type(stdin, KEYS.down, 'abc', KEYS.enter);
    expect(lastFrame()).toContain('Must be a number');
  });

  it('Cancels with Esc', async () => {
    const { stdin, onCancel, onSubmit } = await setup();

    await type(stdin, KEYS.escape);
    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Scrolls long lists to keep the focused field visible', async () => {
    const manyResources: ParameterListResource[] = Array.from({ length: 8 }, (_, i) => ({
      id: `alias.alias${i}`,
      config: { type: 'alias', name: `alias${i}`, value: `value${i}` },
      fields: [{ path: ['alias'], type: 'string' }],
    }));
    const { stdin, lastFrame } = await setup({ resources: manyResources, maxVisibleLines: 8 });

    expect(lastFrame()).toMatch(/↓ \d+ more lines/);
    expect(lastFrame()).not.toContain('alias.alias5');

    await type(stdin, KEYS.down, KEYS.down, KEYS.down, KEYS.down, KEYS.down);
    expect(lastFrame()).toContain('alias.alias5');
    expect(lastFrame()).toMatch(/↑ \d+ more lines/);
  });
});
