import { Console } from 'node:console';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ParameterList, ParameterListRow } from '../../src/ui/components/parameter-list/parameter-list.js';
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

const rows: ParameterListRow[] = [
  { resource: 'git-repository.work', label: 'directory', type: 'string', description: 'Exact directory to clone into.' },
  { resource: 'ssh-config', label: 'hosts[0].Port', type: 'number' },
  { resource: 'aws-profile', label: 'awsSecretAccessKey', type: 'string', sensitive: true },
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
  const instance = render(<ParameterList onCancel={onCancel} onSubmit={onSubmit} rows={rows} title="Missing values" {...overrides} />);
  // Ink attaches its stdin listener in an effect after the first render
  await tick();
  return { ...instance, onSubmit, onCancel };
}

describe('ParameterList', () => {
  afterEach(() => {
    cleanup();
  });

  it('Shows every parameter in one list using the fully qualified name', async () => {
    const { lastFrame } = await setup();
    const frame = lastFrame()!;

    expect(frame).toContain('Missing values');
    expect(frame).toContain('git-repository.work.directory');
    expect(frame).toContain('ssh-config.hosts[0].Port');
    expect(frame).toContain('aws-profile.awsSecretAccessKey');
    // Only the focused row shows its description
    expect(frame).toContain('Exact directory to clone into.');
  });

  it('Moves with up / down, types into the focused row and submits from the last row', async () => {
    const { stdin, lastFrame, onSubmit } = await setup();

    await type(stdin, '~/work', KEYS.enter, '22', KEYS.enter, 'secret');
    // Sensitive values are masked
    expect(lastFrame()).toContain('******');
    expect(lastFrame()).not.toContain('secret');

    await type(stdin, KEYS.up, KEYS.up, 'x', KEYS.backspace, KEYS.down, KEYS.down, KEYS.enter);

    expect(onSubmit).toHaveBeenCalledWith(['~/work', '22', 'secret']);
  });

  it('Requires a value before moving on with Enter', async () => {
    const { stdin, lastFrame, onSubmit } = await setup();

    await type(stdin, KEYS.enter);
    expect(lastFrame()).toContain('A value is required');

    // Up / down still move freely
    await type(stdin, KEYS.down, '1', KEYS.down, 's', KEYS.enter);
    expect(onSubmit).not.toHaveBeenCalled();
    // Jumped back to the first empty row
    expect(lastFrame()).toMatch(/❯ git-repository\.work\.directory/);
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

  it('Scrolls long lists to keep the focused row visible', async () => {
    const manyRows = Array.from({ length: 8 }, (_, i) => ({ resource: 'alias', label: `alias${i}`, type: 'string' }));
    const { stdin, lastFrame } = await setup({ rows: manyRows, maxVisibleRows: 3 });

    expect(lastFrame()).toContain('↓ 5 more');
    expect(lastFrame()).not.toContain('alias.alias5');

    await type(stdin, KEYS.down, KEYS.down, KEYS.down, KEYS.down, KEYS.down);
    expect(lastFrame()).toContain('alias.alias5');
    expect(lastFrame()).toContain('↑');
  });
});
