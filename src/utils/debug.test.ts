import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDebug, enableDebug, isDebugEnabled } from './debug.js';

describe('debug', () => {
  const original = process.env.DEBUG;
  afterEach(() => {
    process.env.DEBUG = original;
    vi.restoreAllMocks();
  });

  it('matches DEBUG patterns', () => {
    process.env.DEBUG = 'codify,plugin:*,-plugin:noisy';
    expect(isDebugEnabled('codify')).toBe(true);
    expect(isDebugEnabled('plugin:brew')).toBe(true);
    expect(isDebugEnabled('plugin:noisy')).toBe(false);
    expect(isDebugEnabled('other')).toBe(false);

    process.env.DEBUG = '';
    expect(isDebugEnabled('codify')).toBe(false);
  });

  it('writes to stderr only when enabled', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const debug = createDebug('codify');

    process.env.DEBUG = '';
    debug('hidden');
    expect(write).not.toHaveBeenCalled();

    enableDebug('*');
    expect(process.env.DEBUG).toBe('*');
    expect(debug.enabled).toBe(true);
    debug('shown %d', 1);
    expect(String(write.mock.calls[0][0])).toContain('shown 1');
  });
});
