import { Config } from 'codify-schemas';
import { SourceMapCache } from './source-maps.js';

export interface InMemoryFile {
  contents: string;
  filePath: string;
  fileType: FileType;
}

export interface ParsedConfig {
  contents: Config;
  filePath: string;
  lineNumberEnd: number;
  lineNumberStart: number;
}

export interface LanguageSpecificParser {
  parse(file: InMemoryFile, sourceMapCache: SourceMapCache): ParsedConfig[];
}

export enum FileType {
  JSON = 'json',
  YAML = 'yaml'
}
