import { Config } from 'codify-schemas';
import { SourceMapCache } from './source-maps.js';

export interface InMemoryFile {
  contents: string;
  path: string;
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
