import { Config } from 'codify-schemas';
import { SourceMapCache } from './source-maps.js';

export interface InMemoryFile {
  // The contents of the file
  contents: string;
  // Path to the specific file
  path: string;
  // The file type (json, yaml, json5, jsonc, remote)
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
  REMOTE = 'remote', // Remote files are always JSONC for now.
}
