import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

import { Plugin } from './entities/plugin.js';

const DEFAULT_PLUGIN_URL = 'https://codify-plugin-library.s3.amazonaws.com/codify-core/index.js';
const PLUGIN_CACHE_DIR = '/Library/Caches/codify/plugins'

export class PluginResolver {

  static async resolve(name: string, version?: string): Promise<Plugin> {
    await PluginResolver.checkAndCreateCacheDirIfNotExists()

    // TODO: Add plugin versioning in the future
    return this.resolvePlugin(name)
  }

  private static async resolvePlugin(name: string): Promise<Plugin> {
    const { body } = await fetch(DEFAULT_PLUGIN_URL)
    if (!body) {
      throw new Error(`Un-able to fetch plugin ${name}. Body was null`);
    }

    const fileUrl = path.join(PLUGIN_CACHE_DIR, `${name}.js`);
    const ws = fsSync.createWriteStream(fileUrl)

    // Different type definitions here for readable stream (NodeJS vs DOM). Small hack to fix that
    await finished(Readable.fromWeb(body as never).pipe(ws));

    return new Plugin(
        name,
        fileUrl,
    )
  }

  private static async checkAndCreateCacheDirIfNotExists() {
    if (!(await fs.stat(PLUGIN_CACHE_DIR))) {
      await fs.mkdir(PLUGIN_CACHE_DIR);
    }
  }
}
