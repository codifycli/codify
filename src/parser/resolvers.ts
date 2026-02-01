import fs from 'node:fs/promises';
import path from 'node:path';
import { validate } from 'uuid';

import { InMemoryFile } from './entities.js';
import { CODIFY_FILE_REGEX } from './index.js';
import { FileReader } from './readers/file-reader.js';
import { RemoteDocumentIdReader } from './readers/remote-document-id-reader.js';
import { RemoteDocumentReader } from './readers/remote-document-reader.js';
import { RemoteTemplateReader } from './readers/remote-template-reader.js';

export enum ResolverType {
  LOCAL = 'LOCAL',
  REMOTE_DOCUMENT_ID = 'REMOTE_DOCUMENT_ID',
  REMOTE_DOCUMENT = 'REMOTE_DOCUMENT',
  TEMPLATE = 'TEMPLATE',
}

export interface ResolverResult {
  files: InMemoryFile[];
  type: ResolverType;
  location: string;
}

export class CodifyResolver {
  private static mapping = {
    [ResolverType.LOCAL]: CodifyResolver.resolveLocal,
    [ResolverType.REMOTE_DOCUMENT_ID]: CodifyResolver.resolveRemoteDocumentId,
    [ResolverType.REMOTE_DOCUMENT]: CodifyResolver.resolveRemoteDocument,
    [ResolverType.TEMPLATE]: CodifyResolver.resolveTemplate,
  }

  static async run(location: string, resolvers: (ResolverType | null)[]): Promise<ResolverResult> {
    let lastCheckedType: ResolverType | null = null;

    for (const type of resolvers) {
      if (!type) continue;

      const resolver = this.mapping[type];
      if (!resolver) continue;

      const result = await resolver(location);
      lastCheckedType = type;

      if (!result) continue;

      if (result.files.length > 0) {
        return result;
      }
    }

    return { files: [], type: lastCheckedType ?? ResolverType.LOCAL, location };
  }

  static async runResolver(location: string, type: ResolverType): Promise<ResolverResult> {
    const resolver = this.mapping[type];
    if (!resolver) {
      throw new Error(`Invalid resolver type ${type}`);
    }

    return resolver(location);
  }

  static async resolveLocal(location: string): Promise<ResolverResult> {
    const filePaths = await this.getFilePaths(location);
    if (!filePaths) {
      return { files: [], type: ResolverType.LOCAL, location };
    }

    const fileReader = new FileReader();
    const files = await Promise.all(filePaths.map(async (filePath) => fileReader.read(filePath)));

    return { files, type: ResolverType.LOCAL, location };
  }

  static async resolveRemoteDocumentId(documentId: string): Promise<ResolverResult> {
    // Not a valid UUID, skip...
    if (!validate(documentId)) {
      return { files: [], type: ResolverType.REMOTE_DOCUMENT_ID, location: documentId };
    }
 
    const reader = new RemoteDocumentIdReader();
    const document = await reader.read(documentId);

    return { files: [document], type: ResolverType.REMOTE_DOCUMENT_ID, location: documentId };
  }

  static async resolveRemoteDocument(name: string): Promise<ResolverResult> {
    const reader = new RemoteDocumentReader();
    const document = await reader.read(name);
    
    return { files: [document], type: ResolverType.REMOTE_DOCUMENT, location: name };
  }

  static async resolveTemplate(templateName: string): Promise<ResolverResult> {
    const reader = new RemoteTemplateReader();
    const document = await reader.read(templateName);
    
    return { files: [document], type: ResolverType.TEMPLATE, location: templateName };
  }

  private static async getFilePaths(dirOrFile: string): Promise<string[]> {
    const absolutePath = path.resolve(dirOrFile);
    const isDirectory = (await fs.lstat(absolutePath)).isDirectory();

    // A single file was passed in. We need to test if the file satisfies the codify file regex
    if (!isDirectory) {
      const fileName = path.basename(absolutePath);
      if (!CODIFY_FILE_REGEX.test(fileName)) {
        throw new Error(`Invalid file path provided ${absolutePath} ${fileName}. Expected the file to be *.codify.jsonc, *.codify.json5, *.codify.json, or *.codify.yaml `)
      }

      return [absolutePath];
    }

    const filesInDir = await fs.readdir(absolutePath);

    return filesInDir
      .filter((name) => CODIFY_FILE_REGEX.test(name))
      .map((name) => path.join(absolutePath, name))
  }
}
