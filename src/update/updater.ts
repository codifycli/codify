// Port of @oclif/plugin-update (MIT, Copyright (c) 2018 Salesforce.com), see ./LICENSE.
// Changes: fetch (with the HTTP(S)_PROXY support of src/utils/proxy.ts) instead of got and proxy-agent, our tar
// extractor instead of tar-fs, chalk instead of ansis, no Windows support. The channel comes from the `channel` file
// only: the upstream npm dist-tags lookup always failed (the body was never parsed) and fell back to that file.

import { Config, Interfaces, ux } from '@oclif/core';
import chalk from 'chalk';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

import { createDebug } from '../utils/debug.js';
import { extractTar } from './tar.js';

const debug = createDebug('codify:update');

export interface Manifest {
  baseDir?: string;
  gz?: string;
  sha?: string;
  sha256gz?: string;
  version: string;
}

export interface UpdateOptions {
  autoUpdate?: boolean;
  channel?: string;
  force?: boolean;
  version?: string;
}

export class Updater {
  readonly clientBin: string;
  readonly clientRoot: string;

  constructor(private config: Interfaces.Config) {
    this.clientRoot = config.scopedEnvVar('OCLIF_CLIENT_HOME') ?? path.join(config.dataDir, 'client');
    this.clientBin = path.join(this.clientRoot, 'bin', config.bin);
  }

  /** version -> url of the tarball, for every published version */
  async fetchVersionIndex(): Promise<Record<string, string>> {
    try {
      return await fetchJson(this.config.s3Url(s3VersionIndexKey(this.config))) as Record<string, string>;
    } catch {
      throw new Error(`No version indices exist for ${this.config.name}.`);
    }
  }

  async findLocalVersions(): Promise<string[]> {
    await ensureClientDir(this.clientRoot);
    const dirOrFiles = await readdir(this.clientRoot);
    return dirOrFiles
      .filter((dirOrFile) => dirOrFile !== 'bin' && dirOrFile !== 'current')
      .map((f) => path.join(this.clientRoot, f));
  }

  async runUpdate(options: UpdateOptions): Promise<void> {
    const { autoUpdate, force = false, version } = options;
    if (autoUpdate) {
      await waitUntilInactive(this.config.cacheDir);
    }

    ux.action.start(`${this.config.name}: Updating CLI`);
    if (notUpdatable(this.config)) {
      ux.action.stop('not updatable');
      return;
    }

    const [channel, current] = await Promise.all([
      options.channel ?? determineChannel(this.config, version),
      determineCurrentVersion(this.clientBin, this.config.version),
    ]);

    if (version) {
      const localVersion = force ? undefined : await this.findLocalVersion(version);
      if (current === localVersion) {
        ux.action.stop(this.config.scopedEnvVar('HIDE_UPDATED_MESSAGE') ? 'done' : `already on version ${current}`);
        return;
      }

      await this.config.runHook('preupdate', { channel, version });
      if (localVersion) {
        await this.updateToExistingVersion(current, localVersion);
      } else {
        ux.action.status = 'fetching version index';
        const index = await this.fetchVersionIndex();
        const url = index[version];
        if (!url) {
          throw new Error(`${version} not found in index:\n${Object.keys(index).join(', ')}`);
        }

        const manifest = await this.fetchVersionManifest(version, url);
        const updated = manifest.sha ? `${manifest.version}-${manifest.sha}` : manifest.version;
        await this.update(manifest, current, updated, force, channel);
      }

      await this.config.runHook('update', { channel, version });
      ux.action.stop();
      ux.stdout();
      ux.stdout(`Updating to a specific version will not update the channel. If autoupdate is enabled, the CLI will eventually be updated back to ${channel}.`);
    } else {
      const manifest = await fetchChannelManifest(channel, this.config);
      const updated = manifest.sha ? `${manifest.version}-${manifest.sha}` : manifest.version;
      if (!force && current === updated) {
        ux.action.stop(this.config.scopedEnvVar('HIDE_UPDATED_MESSAGE') ? 'done' : `already on version ${current}`);
      } else {
        await this.config.runHook('preupdate', { channel, version: updated });
        await this.update(manifest, current, updated, force, channel);
      }

      await this.config.runHook('update', { channel, version: updated });
      ux.action.stop();
    }

    await this.touch();
    await this.tidy();
    debug('done');
  }

  private async createBin(version: string): Promise<void> {
    const dst = this.clientBin;
    const { bin } = this.config;
    const binPathEnvVar = this.config.scopedEnvVarKey('BINPATH');
    const redirectedEnvVar = this.config.scopedEnvVarKey('REDIRECTED');
    await mkdir(path.dirname(dst), { recursive: true });

    const body = `#!/usr/bin/env bash
set -e
get_script_dir () {
  SOURCE="\${BASH_SOURCE[0]}"
  # While $SOURCE is a symlink, resolve it
  while [ -h "$SOURCE" ]; do
    DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
    SOURCE="$( readlink "$SOURCE" )"
    # If $SOURCE was a relative symlink (so no "/" as prefix, need to resolve it relative to the symlink base directory
    [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
  done
  DIR="$( cd -P "$( dirname "$SOURCE" )" && pwd )"
  echo "$DIR"
}
DIR=$(get_script_dir)
${binPathEnvVar}="\$DIR/${bin}" ${redirectedEnvVar}=1 "$DIR/../${version}/bin/${bin}" "$@"
`;

    await writeFile(dst, body, { mode: 0o755 });
    await rm(path.join(this.clientRoot, 'current'), { force: true, recursive: true });
    await symlink(`./${version}`, path.join(this.clientRoot, 'current'));
  }

  private async fetchVersionManifest(version: string, url: string): Promise<Manifest> {
    const parts = url.split('/');
    const hash = parts[parts.indexOf(version) + 1];
    return fetchManifest(s3VersionManifestKey(this.config, version, hash), this.config);
  }

  private async findLocalVersion(version: string): Promise<string | undefined> {
    const versions = await this.findLocalVersions();
    return versions.map((file) => path.basename(file)).find((file) => file.startsWith(version));
  }

  private async refreshConfig(version: string): Promise<void> {
    this.config = await Config.load({ root: path.join(this.clientRoot, version) });
  }

  /** Removes the versions that weren't used for 42 days */
  private async tidy(): Promise<void> {
    debug('tidy');
    try {
      const root = this.clientRoot;
      if (!existsSync(root)) {
        return;
      }

      const files = await ls(root);
      // Upstream swaps the two arguments, so `bin`, `current` and the current version were never protected by name
      const isNotSpecial = (fPath: string, version: string) => !['bin', 'current', version].includes(path.basename(fPath));
      const isOld = (fStat: { mtime: Date }) => {
        const { mtime } = fStat;
        mtime.setHours(mtime.getHours() + (42 * 24));
        return mtime < new Date();
      };

      await Promise.all(files
        .filter((f) => isNotSpecial(f.path, this.config.version) && isOld(f.stat))
        .map((f) => rm(f.path, { force: true, recursive: true })));
    } catch (error) {
      ux.warn(error as Error);
    }
  }

  /** Touches the client so it won't be tidied up right away */
  private async touch(): Promise<void> {
    try {
      const p = path.join(this.clientRoot, this.config.version);
      debug('touching client at', p);
      if (existsSync(p)) {
        await utimes(p, new Date(), new Date());
      }
    } catch (error) {
      ux.warn(error as Error);
    }
  }

  private async update(manifest: Manifest, current: string, updated: string, force: boolean, channel: string): Promise<void> {
    ux.action.start(`${this.config.name}: Updating CLI from ${chalk.green(current)} to ${chalk.green(updated)}${channel === 'stable' ? '' : ' (' + chalk.yellow(channel) + ')'}`);
    await ensureClientDir(this.clientRoot);
    const output = path.join(this.clientRoot, updated);
    if (force || !existsSync(output)) {
      await downloadAndExtract(output, manifest, channel, this.config);
    }

    await this.refreshConfig(updated);
    await setChannel(channel, this.config.dataDir);
    await this.createBin(updated);
  }

  private async updateToExistingVersion(current: string, updated: string): Promise<void> {
    ux.action.start(`${this.config.name}: Updating CLI from ${chalk.green(current)} to ${chalk.green(updated)}`);
    await ensureClientDir(this.clientRoot);
    await this.refreshConfig(updated);
    await this.createBin(updated);
  }
}

class HttpError extends Error {
  constructor(public url: string, public statusCode: number) {
    super(`HTTP ${statusCode}: ${url}`);
  }
}

async function httpGet(url: string): Promise<Response> {
  debug(`[${url}] GET`);
  const response = await fetch(url);
  debug(`[${url}] ${response.status}`);
  if (!response.ok) {
    await response.body?.cancel();
    throw new HttpError(url, response.status);
  }

  return response;
}

export async function fetchJson(url: string): Promise<unknown> {
  const response = await httpGet(url);
  return JSON.parse(await response.text());
}

async function ensureClientDir(clientRoot: string): Promise<void> {
  try {
    await mkdir(clientRoot, { recursive: true });
  } catch (error) {
    // For some reason the client directory is sometimes a file. If so, delete it and recreate it
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      await rm(clientRoot, { force: true, recursive: true });
      await mkdir(clientRoot, { recursive: true });
    } else {
      throw error;
    }
  }
}

function notUpdatable(config: Interfaces.Config): boolean {
  if (!config.binPath) {
    const instructions = config.scopedEnvVar('UPDATE_INSTRUCTIONS');
    if (instructions) {
      ux.warn(instructions);
      // Once the spinner stops, it'll eat this blank line (https://github.com/oclif/core/issues/799)
      ux.stdout();
    }

    return true;
  }

  return false;
}

function s3SubDir(config: Interfaces.Config): string {
  const folder = (config.pjson.oclif.update?.s3 as { folder?: string } | undefined)?.folder ?? '';
  return folder !== '' && !folder.endsWith('/') ? `${folder}/` : folder;
}

function determinePlatform(config: Interfaces.Config): Interfaces.PlatformTypes {
  return config.platform === 'wsl' ? 'linux' : config.platform;
}

function s3VersionIndexKey(config: Interfaces.Config): string {
  return path.join(s3SubDir(config), 'versions', `${config.bin}-${determinePlatform(config)}-${config.arch}-tar-gz.json`);
}

function s3ChannelManifestKey(channel: string, config: Interfaces.Config): string {
  return path.join(s3SubDir(config), 'channels', channel, `${config.bin}-${determinePlatform(config)}-${config.arch}-buildmanifest`);
}

function s3VersionManifestKey(config: Interfaces.Config, version: string, hash: string): string {
  return path.join(s3SubDir(config), 'versions', version, hash, `${config.bin}-v${version}-${hash}-${determinePlatform(config)}-${config.arch}-buildmanifest`);
}

async function fetchManifest(s3Key: string, config: Interfaces.Config): Promise<Manifest> {
  ux.action.status = 'fetching manifest';
  return await fetchJson(config.s3Url(s3Key)) as Manifest;
}

async function fetchChannelManifest(channel: string, config: Interfaces.Config): Promise<Manifest> {
  try {
    return await fetchManifest(s3ChannelManifestKey(channel, config), config);
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 403) {
      throw new Error(`HTTP 403: Invalid channel ${channel}`);
    }

    throw error;
  }
}

/** When auto updating, wait until the CLI hasn't been used for an hour */
async function waitUntilInactive(cacheDir: string): Promise<void> {
  const lastRun = (await stat(path.join(cacheDir, 'lastrun'))).mtime;
  lastRun.setHours(lastRun.getHours() + 1);
  if (lastRun > new Date()) {
    ux.stdout(`waiting until ${lastRun.toISOString()} to update`);
    await new Promise((resolve) => setTimeout(resolve, 60 * 1000));
    return waitUntilInactive(cacheDir);
  }

  ux.stdout('time to update');
}

async function setChannel(channel: string, dataDir: string): Promise<void> {
  await writeFile(path.join(dataDir, 'channel'), channel, 'utf8');
}

async function determineChannel(config: Interfaces.Config, version?: string): Promise<string> {
  ux.action.status = version ? `Determining channel for ${version}` : 'Determining channel';
  const channelPath = path.join(config.dataDir, 'channel');
  return existsSync(channelPath) ? (await readFile(channelPath, 'utf8')).trim() : 'stable';
}

/** The version the client bin script points to (ex: `"$DIR/../1.2.0-abc1234/bin/codify"`) */
async function determineCurrentVersion(clientBin: string, version: string): Promise<string> {
  try {
    const currentVersion = await readFile(clientBin, 'utf8');
    const matches = currentVersion.match(/\.\.[/\\|](.+)[/\\|]bin/);
    return matches ? matches[1] : version;
  } catch (error) {
    debug((error as Error).message);
  }

  return version;
}

async function downloadAndExtract(output: string, manifest: Manifest, channel: string, config: Interfaces.Config): Promise<void> {
  const { gz, sha256gz, version } = manifest;
  const platform = determinePlatform(config);
  const gzUrl = gz ?? config.s3Url(config.s3Key('versioned', { arch: config.arch, bin: config.bin, channel, ext: 'gz', platform, version }));
  const baseDir = manifest.baseDir ?? config.s3Key('baseDir', { arch: config.arch, bin: config.bin, channel, platform, version });

  debug(`Streaming ${gzUrl} to ${output}`);
  const response = await httpGet(gzUrl);
  const total = Number(response.headers.get('content-length')) || 0;
  const hasher = createHash('sha256');
  let transferred = 0;

  // Hash and count the compressed bytes as they are downloaded
  const download = Readable.fromWeb(response.body as never);
  download.on('data', (chunk: Buffer) => {
    hasher.update(chunk);
    transferred += chunk.length;
    if (ux.action.type === 'spinner') {
      ux.action.status = total
        ? `${fileSize(transferred)}/${fileSize(total)}${transferred === total ? ' - Finishing up...' : ''}`
        : fileSize(transferred);
    }
  });

  const tmp = `${output}.partial.${Math.random().toString().split('.')[1].slice(0, 5)}`;
  debug(`extracting to ${tmp}`);
  try {
    const gunzip = createGunzip();
    download.on('error', (error) => gunzip.destroy(error));
    await extractTar(download.pipe(gunzip), tmp);

    const shasum = hasher.digest('hex');
    if (sha256gz && sha256gz !== shasum) {
      throw new Error(`SHA mismatch: expected ${shasum} to be ${sha256gz}`);
    }

    await rm(output, { force: true, recursive: true });
    debug(`moving ${path.join(tmp, baseDir)} to ${output}`);
    await rename(path.join(tmp, baseDir), output);
    await rm(tmp, { force: true, recursive: true });
    await utimes(output, new Date(), new Date());
    debug('done extracting');
  } catch (error) {
    await rm(tmp, { force: true, recursive: true }).catch(() => {});
    throw error;
  }
}

async function ls(dir: string): Promise<Array<{ path: string; stat: Awaited<ReturnType<typeof stat>> }>> {
  const files = await readdir(dir);
  return Promise.all(files.map(async (f) => {
    const p = path.join(dir, f);
    return { path: p, stat: await stat(p) };
  }));
}

function fileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${value.toFixed(1)} ${units[unit]}`;
}
