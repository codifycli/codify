import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

import { PluginSearchQuery, PluginSearchResult } from './types.js';

const API_BASE_URL = 'https://api.codifycli.com'

export const ApiClient = {
  async searchPlugins(query: PluginSearchQuery[]): Promise<PluginSearchResult> {
    const body = JSON.stringify({ query });
    const res = await fetch(
      `${API_BASE_URL}/v1/plugins/versions/search`,
      { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }
    );

    if (!res.ok) {
      const message = await res.text();
      throw new Error(message);
    }

    const json = await res.json();
    return json.results as unknown as PluginSearchResult;
  },

  async downloadPlugin(filePath: string, url: string): Promise<void> {
    const { body } = await fetch(url)
    
    const dirname = path.dirname(filePath);
    if (!await fs.stat(dirname).then((s) => s.isDirectory()).catch(() => false)) {
      await fs.mkdir(dirname, { recursive: true });
    }
    
    const ws = fsSync.createWriteStream(filePath)
    // Different type definitions here for readable stream (NodeJS vs DOM). Small hack to fix that
    await finished(Readable.fromWeb(body as never).pipe(ws));
  },
};
