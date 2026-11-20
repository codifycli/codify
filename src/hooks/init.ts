// The init hook of @oclif/plugin-update (MIT, Copyright (c) 2018 Salesforce.com), see src/update/LICENSE: starts
// `codify update --autoupdate` in the background, at most once a day (every 14 days on the stable channel).
// Also routes fetch through HTTP(S)_PROXY when one is set.

import { Hook } from '@oclif/core';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, open, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createDebug } from '../utils/debug.js';
import { configureProxyFromEnv } from '../utils/proxy.js';

const debug = createDebug('codify:update');

const hook: Hook.Init = async function (opts) {
  configureProxyFromEnv();

  if (opts.id === 'update' || opts.config.scopedEnvVarTrue('DISABLE_AUTOUPDATE')) {
    return;
  }

  const { config } = opts;
  const binPath = config.binPath ?? config.bin;
  const lastRunFile = path.join(config.cacheDir, 'lastrun');
  const autoUpdateFile = path.join(config.cacheDir, 'autoupdate');
  const autoUpdateLogFile = path.join(config.cacheDir, 'autoupdate.log');
  const clientRoot = config.scopedEnvVar('OCLIF_CLIENT_HOME') ?? path.join(config.dataDir, 'client');

  await mkdir(config.cacheDir, { recursive: true });
  await touch(lastRunFile);

  const clientDir = path.join(clientRoot, config.version);
  if (existsSync(clientDir)) {
    await touch(clientDir);
  }

  if (!(await autoUpdateNeeded(autoUpdateFile, config.channel, config.pjson.oclif.update?.autoupdate?.debounce))) {
    return;
  }

  debug('autoupdate running');
  await writeFile(autoUpdateFile, '');

  debug(`spawning autoupdate on ${binPath}`);
  const fd = await open(autoUpdateLogFile, 'a');
  await fd.write(`[${new Date().toISOString()}] starting \`${binPath} update --autoupdate\` from ${process.argv.slice(1, 3).join(' ')}\n`);
  const stream = fd.createWriteStream();
  spawn(binPath, ['update', '--autoupdate'], {
    detached: true,
    env: {
      ...process.env,
      [config.scopedEnvVarKey('SKIP_ANALYTICS')]: '1',
      [config.scopedEnvVarKey('TIMESTAMPS')]: '1',
    },
    stdio: ['ignore', stream, stream],
  })
    .on('error', (error) => process.emitWarning(error))
    .unref();
};

async function autoUpdateNeeded(autoUpdateFile: string, channel: string, debounceDays?: number): Promise<boolean> {
  try {
    const { mtime } = await stat(autoUpdateFile);
    const days = debounceDays !== undefined && debounceDays > 0 ? debounceDays : (channel === 'stable' ? 14 : 1);
    mtime.setHours(mtime.getHours() + (days * 24));
    return mtime < new Date();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }

    debug('autoupdate ENOENT');
    return true;
  }
}

async function touch(p: string): Promise<void> {
  try {
    await utimes(p, new Date(), new Date());
  } catch {
    await writeFile(p, '');
  }
}

export default hook;
