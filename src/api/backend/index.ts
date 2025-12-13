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

  async getRemoteFileHash(filePath: string, credentials: string): Promise<string> {
    const { documentId, fileId } = this.extractCodifyFileInfo(filePath);

    const response = await fetch((`https://api.codifycli.com/v1/documents/${documentId}/file/${fileId}/hash`), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${credentials}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get remote file hash for ${filePath}`);
    }

    const data = await response.json();
    return data.hash;
  },

  async updateRemoteFile(filePath: string, content: Blob, credentials: string): Promise<void> {
    const { documentId, fileId } = this.extractCodifyFileInfo(filePath);

    const formData = new FormData();
    formData.append('file', content);

    const response = await fetch((`https://api.codifycli.com/v1/documents/${documentId}/file/${fileId}`), {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${credentials}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to save remote file ${filePath}`);
    }
  },

  extractCodifyFileInfo(url: string) {
    const regex = /codify:\/\/(.*):(.*)/

    const [, group1, group2] = regex.exec(url) ?? [];
    if (!group1 || !group2) {
      throw new Error(`Invalid codify url ${url} for file`);
    }

    return {
      documentId: group1,
      fileId: group2,
    }
  },
};
