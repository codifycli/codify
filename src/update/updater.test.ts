import { Config } from '@oclif/core';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { Server, createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { Updater } from './updater.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** End to end: a fake S3 bucket with real tarballs, the same layout as the codify release bucket */
describe('Updater', () => {
  let tmp: string;
  let server: Server;
  let host: string;
  const files = new Map<string, Buffer>();
  const requests: string[] = [];
  let config: Config;
  let clientRoot: string;
  const env = { ...process.env };

  /** Builds the tarball of a fake codify release whose bin prints its version */
  function release(version: string, sha: string, { badSha = false } = {}) {
    const dir = path.join(tmp, 'build', `${version}-${sha}`);
    mkdirSync(path.join(dir, 'codify', 'bin'), { recursive: true });
    writeFileSync(path.join(dir, 'codify', 'bin', 'codify'), `#!/bin/sh\necho "codify ${version}"\n`, { mode: 0o755 });
    writeFileSync(path.join(dir, 'codify', 'package.json'), JSON.stringify({ name: 'codify', oclif: { bin: 'codify' }, version }));
    const tarball = execFileSync('tar', ['-cz', '-C', dir, 'codify']);

    const target = `${config.platform}-${config.arch}`;
    const key = `versions/${version}/${sha}/codify-v${version}-${sha}-${target}.tar.gz`;
    files.set(`/${key}`, tarball);

    const manifest = JSON.stringify({
      gz: `${host}/${key}`,
      sha,
      sha256gz: badSha ? '0'.repeat(64) : createHash('sha256').update(tarball).digest('hex'),
      version,
    });
    files.set(`/versions/${version}/${sha}/codify-v${version}-${sha}-${target}-buildmanifest`, Buffer.from(manifest));
    return { key, manifest };
  }

  beforeAll(async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'codify-update-'));
    server = createServer((req, res) => {
      requests.push(req.url!);
      const file = files.get(req.url!);
      res.statusCode = file ? 200 : 403; // S3 answers 403 for missing keys
      res.end(file ?? '');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
    rmSync(tmp, { force: true, recursive: true });
    process.env = env;
  });

  beforeEach(async () => {
    rmSync(path.join(tmp, 'home'), { force: true, recursive: true });
    files.clear();
    requests.length = 0;
    process.env.CODIFY_BINPATH = '/usr/local/bin/codify';
    process.env.CODIFY_DATA_DIR = path.join(tmp, 'home', 'data');
    process.env.CODIFY_CACHE_DIR = path.join(tmp, 'home', 'cache');

    config = await Config.load(REPO_ROOT);
    config.updateConfig.s3 = { ...config.updateConfig.s3, host };
    clientRoot = path.join(config.dataDir, 'client');
  });

  const runBin = () => execFileSync(path.join(clientRoot, 'bin', 'codify')).toString().trim();

  it('installs the latest version of the channel', async () => {
    const { manifest } = release('9.0.0', 'abc1234');
    files.set(`/channels/stable/codify-${config.platform}-${config.arch}-buildmanifest`, Buffer.from(manifest));

    await new Updater(config).runUpdate({});

    expect(readlinkSync(path.join(clientRoot, 'current'))).toBe('./9.0.0-abc1234');
    expect(readFileSync(path.join(clientRoot, 'bin', 'codify'), 'utf8')).toContain('"$DIR/../9.0.0-abc1234/bin/codify"');
    expect(runBin()).toBe('codify 9.0.0');
    expect(readFileSync(path.join(config.dataDir, 'channel'), 'utf8')).toBe('stable');
    expect(readdirSync(clientRoot).filter((f) => f.includes('partial'))).toEqual([]);

    // Already up to date: nothing is downloaded again
    requests.length = 0;
    await new Updater(config).runUpdate({});
    expect(requests.filter((r) => r.endsWith('.tar.gz'))).toEqual([]);
  });

  it('installs a specific version from the version index', async () => {
    const { key } = release('8.1.0', 'def5678');
    files.set(`/versions/codify-${config.platform}-${config.arch}-tar-gz.json`, Buffer.from(JSON.stringify({ '8.1.0': `${host}/${key}` })));

    await new Updater(config).runUpdate({ version: '8.1.0' });
    expect(runBin()).toBe('codify 8.1.0');

    await expect(new Updater(config).runUpdate({ version: '7.0.0' })).rejects.toThrow('7.0.0 not found in index');
  });

  it('rejects a tarball whose sha256 does not match and leaves nothing behind', async () => {
    const { manifest } = release('9.1.0', 'bad0000', { badSha: true });
    files.set(`/channels/beta/codify-${config.platform}-${config.arch}-buildmanifest`, Buffer.from(manifest));

    await expect(new Updater(config).runUpdate({ channel: 'beta' })).rejects.toThrow('SHA mismatch');
    expect(readdirSync(clientRoot)).toEqual([]);
  });

  it('reports invalid channels', async () => {
    await expect(new Updater(config).runUpdate({ channel: 'nope' })).rejects.toThrow('HTTP 403: Invalid channel nope');
  });

  it('removes versions unused for 42 days but keeps bin and current', async () => {
    const { manifest } = release('9.2.0', 'fed4321');
    files.set(`/channels/stable/codify-${config.platform}-${config.arch}-buildmanifest`, Buffer.from(manifest));

    const old = new Date(Date.now() - (50 * 24 * 60 * 60 * 1000));
    mkdirSync(path.join(clientRoot, '1.0.0-0000000', 'bin'), { recursive: true });
    mkdirSync(path.join(clientRoot, 'bin'), { recursive: true });
    utimesSync(path.join(clientRoot, '1.0.0-0000000'), old, old);
    utimesSync(path.join(clientRoot, 'bin'), old, old);

    await new Updater(config).runUpdate({});

    expect(existsSync(path.join(clientRoot, '1.0.0-0000000'))).toBe(false);
    expect(runBin()).toBe('codify 9.2.0');
  });
});
