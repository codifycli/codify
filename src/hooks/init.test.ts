import { Config } from '@oclif/core';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import hook from './init.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('init hook (autoupdate)', () => {
  const env = { ...process.env };
  let tmp: string;
  let calls: string;

  beforeEach(() => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'codify-hook-'));
    calls = path.join(tmp, 'calls');
    const bin = path.join(tmp, 'codify');
    writeFileSync(bin, `#!/bin/sh\necho "$@" >> "${calls}"\n`, { mode: 0o755 });
    process.env = { ...env, CODIFY_BINPATH: bin, CODIFY_CACHE_DIR: path.join(tmp, 'cache'), CODIFY_DATA_DIR: path.join(tmp, 'data') };
    delete process.env.CODIFY_DISABLE_AUTOUPDATE;
  });

  afterAll(() => {
    process.env = env;
  });

  const run = async (id: string) => {
    const config = await Config.load(REPO_ROOT);
    await hook.call({ config } as never, { argv: [], config, context: {} as never, id });
  };

  it('starts `update --autoupdate` in the background once per interval', async () => {
    await run('plan');
    await vi.waitFor(() => expect(readFileSync(calls, 'utf8')).toBe('update --autoupdate\n'));
    expect(existsSync(path.join(tmp, 'cache', 'lastrun'))).toBe(true);
    expect(readFileSync(path.join(tmp, 'cache', 'autoupdate.log'), 'utf8')).toContain('starting');

    // Not again before the interval
    await run('apply');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(readFileSync(calls, 'utf8')).toBe('update --autoupdate\n');

    rmSync(tmp, { force: true, recursive: true });
  });

  it('does nothing for the update command or when disabled', async () => {
    await run('update');
    process.env.CODIFY_DISABLE_AUTOUPDATE = 'true';
    await run('plan');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(existsSync(calls)).toBe(false);

    rmSync(tmp, { force: true, recursive: true });
  });
});
