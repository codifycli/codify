import { Config } from '@codifycli/schemas';

import type { RegistryTemplate } from '../api/dashboard/types.js';
import { SourceMapCache } from './source-maps.js';

export interface InMemoryFile {
  contents: string;
  filePath: string;
  fileType: FileType;
}

export interface ParsedConfig {
  contents: Config;
  sourceMapKey: string;
}

export interface LanguageSpecificParser {
  parse(file: InMemoryFile, sourceMaps: SourceMapCache): ParsedConfig[];
}

export enum FileType {
  JSON = 'json',
  YAML = 'yaml',
  JSON5 = 'json5',
  JSONC = 'jsonc',
  REMOTE = 'remote',
}

/** Where a project was loaded from. Decided once by the CodifyResolver. */
export enum CodifySourceType {
  // A codify file on disk (absolute path)
  LOCAL = 'local',
  // A remote file stored in the Codify dashboard (document id)
  REMOTE = 'remote',
  // A public template from the Codify registry
  TEMPLATE = 'template',
}

export type CodifySource =
  | { type: CodifySourceType.REMOTE; documentId: string }
  | { type: CodifySourceType.LOCAL; path: string }
  | { type: CodifySourceType.TEMPLATE; template: RegistryTemplate };
