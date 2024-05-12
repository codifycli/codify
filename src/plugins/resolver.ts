import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

import { ctx } from '../events/context.js';
import { Plugin } from './plugin.js';

const DEFAULT_PLUGIN_URL = 'https://codify-plugin-library.s3.amazonaws.com/codify-core/index.js';
const PLUGIN_CACHE_DIR = '/Library/Caches/codify/plugins'

export class PluginResolver {

  static async resolve(name: string, version: string): Promise<Plugin> {
    await PluginResolver.checkAndCreateCacheDirIfNotExists()

    let directoryStat;
    try {
      directoryStat = await fs.stat(version);
    } catch {
    }

    // For easier development. A direct js file can be specified for the plugin.
    if (directoryStat && directoryStat.isFile()) {
      return PluginResolver.resolvePluginFs(name, version)
    }

    return PluginResolver.resolvePluginWeb(name, version)
  }

  private static async resolvePluginFs(name: string, filePath: string): Promise<Plugin> {
    const fileExtension = filePath.slice(filePath.lastIndexOf('.'))
    if (fileExtension !== '.js' && fileExtension !== '.ts') {
      throw new Error(`Only .js and .ts plugins are support currently. Can't resolve ${filePath}`);
    }

    return new Plugin(
      name,
      '0.0.0',
      filePath,
    )
  }

  private static async resolvePluginWeb(name: string, version: string): Promise<Plugin> {
    const { body } = await fetch(DEFAULT_PLUGIN_URL)
    if (!body) {
      throw new Error(`Un-able to fetch plugin ${name}. Body was null`);
    }

    const fileUrl = path.join(PluginResolver.getCacheDir(), `${name}.js`);
    const ws = fsSync.createWriteStream(fileUrl)

    // Different type definitions here for readable stream (NodeJS vs DOM). Small hack to fix that
    await finished(Readable.fromWeb(body as never).pipe(ws));

    return new Plugin(
      name,
      version,
      fileUrl,
    )
  }

  private static async checkAndCreateCacheDirIfNotExists() {
    let pluginDirStat = null;
    try {
      pluginDirStat = await fs.stat(PluginResolver.getCacheDir())
    } catch {
      ctx.log('Plugin cache dir does not exist')
    }

    if (pluginDirStat && pluginDirStat.isDirectory()) {
      return;
    }

    if (pluginDirStat && !pluginDirStat.isDirectory()) {
      throw new Error(`An object already exists at ${PluginResolver.getCacheDir()} and is not a directory. Please delete and try again`);
    }

    ctx.log('Creating a new cache dir for codify');
    await fs.mkdir(PluginResolver.getCacheDir(), { recursive: true });
  }

  private static getCacheDir() {
    const homeDir = process.env.HOME!;
    return path.join(homeDir, PLUGIN_CACHE_DIR);
  }
}
