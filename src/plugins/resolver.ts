import latestSemver from 'latest-semver';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';

import { PluginInfo } from '../api//backend/types.js';
import { ApiClient } from '../api/backend/index.js';
import { ctx } from '../events/context.js';
import { VERSION } from '../config.js';
import { Plugin } from './plugin.js';

const PLUGIN_CACHE_DIR = path.resolve(os.homedir(), '.codify/plugins')

export class PluginResolver {

  static async resolveAll(definitions: Record<string, string>): Promise<Plugin[]> {
    await PluginResolver.checkAndCreateCacheDirIfNotExists()

    const localPluginDefs = Object.entries(definitions)
      .filter(([k, v]) => v.endsWith('.js') || v.endsWith('.ts'))
    const localPlugins = await Promise.all(localPluginDefs.map(([name, path]) =>
      PluginResolver.resolveLocalPlugin(name, path)
    ))

    const networkPluginDefs = Object.entries(definitions)
      .filter(([k]) => !localPluginDefs.some(([lk]) => k === lk))

    if (networkPluginDefs.length === 0) {
      return localPlugins;
    }

    // Fetch the latest plugin info from the server
    const latestPluginInfo = await ApiClient
      .searchPlugins(networkPluginDefs.map(([name, version]) => ({ name, version })), VERSION)
      .catch((error: Error) => {
        console.warn('Unable to fetch latest plugin info');
        ctx.debug(`Unable to fetch latest plugin info:\n${error.message}`);
      }) ?? undefined;

    const networkPlugins = await Promise.all(networkPluginDefs.map(([name, version]) =>
      PluginResolver.resolvePluginNetwork(name, version, latestPluginInfo?.[name])
    ))

    return [...networkPlugins, ...localPlugins];
  }

  static async resolveLocalPlugin(name: string, filePath: string, version?: string): Promise<Plugin> {
    if (filePath.endsWith('.js') && filePath.endsWith('.ts')) {
      throw new Error(`Only .js and .ts plugins are support currently. Can't resolve ${filePath}`);
    }

    let stats: fsSync.Stats;
    try {
      stats = await fs.stat(path.resolve(filePath));
    } catch {
      throw new Error(`Unable to find plugin file path ${filePath}`)
    }

    if (!stats.isFile()) {
      throw new Error(`Provided plugin path ${filePath} does not reference a file`);
    }

    return new Plugin(
      name,
      version ?? '0.0.0',
      filePath,
    )
  }

  private static async resolvePluginNetwork(name: string, version: string, latestInfoFromNetwork?: PluginInfo): Promise<Plugin> {
    const resolvedVersion = (version === 'latest') ? await PluginResolver.resolveLatestLocalVersion(name) : version;
    if (!resolvedVersion && !latestInfoFromNetwork) {
      throw new Error(`Plugin ${name} not found and not able to download from registry. Please try again at a later time`);
    }

    if (!resolvedVersion) {
      return downloadFreshPlugin();
    }

    const localPluginExists = await PluginResolver.localPluginExists(name, resolvedVersion);
    if (!localPluginExists && !latestInfoFromNetwork) {
      throw new Error(`Plugin ${name} not found and not able to download from registry. Please try again at a later time`);
    }

    // Plugin already exists, then no need to download. OR couldn't fetch plugin info from online then just resolve local version. OR we already have the latest version
    if (resolvedVersion &&
      ((localPluginExists && !latestInfoFromNetwork)
      || (resolvedVersion === latestInfoFromNetwork!.version))
    ) {
      return PluginResolver.resolveLocalPlugin(name, `${PLUGIN_CACHE_DIR}/${name}/${resolvedVersion}/index.js`);
    }

    return downloadFreshPlugin();

    // Set up folders and download plugin from the network.
    async function downloadFreshPlugin(): Promise<Plugin> {
      const filePath = `${PLUGIN_CACHE_DIR}/${name}/${latestInfoFromNetwork?.version}/index.js`;
      await ApiClient.downloadPlugin(filePath, latestInfoFromNetwork!.downloadLink);

      return new Plugin(
        name,
        version,
        filePath,
      )
    }
  }

  private static async checkAndCreateCacheDirIfNotExists() {
    let pluginDirStat = null;
    try {
      pluginDirStat = await fs.stat(PLUGIN_CACHE_DIR)
    } catch {
      ctx.log('Plugin cache dir does not exist')
    }

    if (pluginDirStat && pluginDirStat.isDirectory()) {
      return;
    }

    if (pluginDirStat && !pluginDirStat.isDirectory()) {
      throw new Error(`An object already exists at ${PLUGIN_CACHE_DIR} and is not a directory. Please delete and try again`);
    }

    ctx.log('Creating a new cache dir for codify');
    await fs.mkdir(PLUGIN_CACHE_DIR, { recursive: true });
  }

  private static async resolveLatestLocalVersion(name: string): Promise<string | undefined> {
    try {
      const pluginPath = path.join(PLUGIN_CACHE_DIR, name);
      const versions = await fs.readdir(pluginPath);
      return latestSemver(versions);
    } catch {
      return undefined;
    }
  }

  private static async localPluginExists(name: string, version: string): Promise<boolean> {
    const pluginPath = path.join(PLUGIN_CACHE_DIR, name, version, 'index.js');
    try {
      const fileStats = await fs.stat(pluginPath)
      return fileStats.isFile();
    } catch {
      return false;
    }
  }
}
