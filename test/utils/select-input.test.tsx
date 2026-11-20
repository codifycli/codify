import { Console } from 'node:console';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SelectInput from '../../src/ui/components/widgets/SelectInput.js';
import { cleanup, render } from './helpers/ink-testing-library.js';

// Polyfill console.Console for the test environment (required by patch-console/Ink)
if (!console.Console) {
  // @ts-expect-error - Polyfilling console.Console for test environment
  console.Console = Console;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 30));
const KEY = { up: '\u001B[A', down: '\u001B[B', enter: '\r' };
// eslint-disable-next-line no-control-regex
// The pointer is > in terminals without unicode
const plain = (frame: string | undefined) => (frame ?? '').replaceAll(/\u001B\[[\d;]*m/g, '').replaceAll('>', '❯');
const items = (...labels: string[]) => labels.map((label) => ({ label, value: label }));

describe('SelectInput', () => {
  afterEach(() => cleanup());

  it('moves with the arrows (wrapping around) and selects with enter', async () => {
    const onSelect = vi.fn();
    const onHighlight = vi.fn();
    const { lastFrame, stdin } = render(<SelectInput items={items('a', 'b', 'c')} onHighlight={onHighlight} onSelect={onSelect}/>);
    await tick();
    expect(plain(lastFrame())).toBe('❯ a\n  b\n  c');

    stdin.write(KEY.up);
    await tick();
    expect(plain(lastFrame())).toBe('  a\n  b\n❯ c');
    expect(onHighlight).toHaveBeenLastCalledWith({ label: 'c', value: 'c' });

    stdin.write(KEY.down);
    await tick();
    stdin.write('j');
    await tick();
    stdin.write(KEY.enter);
    await tick();
    expect(onSelect).toHaveBeenCalledWith({ label: 'b', value: 'b' });
  });

  it('starts at the initial index and selects with the number keys', async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin } = render(<SelectInput initialIndex={1} items={items('yes', 'no')} onSelect={onSelect}/>);
    await tick();
    expect(plain(lastFrame())).toBe('  yes\n❯ no');

    stdin.write('1');
    await tick();
    expect(onSelect).toHaveBeenCalledWith({ label: 'yes', value: 'yes' });
  });

  it('scrolls through the items when there are more than the limit', async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin } = render(<SelectInput items={items('a', 'b', 'c', 'd')} limit={2} onSelect={onSelect}/>);
    await tick();
    expect(plain(lastFrame())).toBe('❯ a\n  b');

    stdin.write(KEY.down);
    await tick();
    stdin.write(KEY.down);
    await tick();
    expect(plain(lastFrame())).toBe('  b\n❯ c');

    stdin.write(KEY.enter);
    await tick();
    expect(onSelect).toHaveBeenCalledWith({ label: 'c', value: 'c' });

    // An initial index past the limit scrolls to it
    cleanup();
    const second = render(<SelectInput initialIndex={3} items={items('a', 'b', 'c', 'd')} limit={2}/>);
    await tick();
    expect(plain(second.lastFrame())).toBe('  c\n❯ d');
  });
});
