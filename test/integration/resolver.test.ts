import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

import { PluginResolver } from '../../src/plugins/resolver.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return fs
})

vi.mock('node:fs/promises', async () => {
  const { fs } = await import('memfs');
  return fs.promises;
})

describe('Plugin resolver integration test', () => {

  it('resolves the default plugin', async () => {
    await PluginResolver.resolve('default', '')
    expect(fs.existsSync(path.resolve(os.homedir(), '.codify/plugins/default.js'))).to.be.true;
  })

  afterEach(() => {
    vi.resetAllMocks();
  })
})
