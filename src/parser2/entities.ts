import { Config } from 'codify-schemas';

export interface InMemoryFile {
  contents: string;
  directory: string;
  fileName: string;
  fileType: string;
}

export interface ParsedConfig {
  config: Config;
  fileName: string;
  lineNumberEnd: number;
  lineNumberStart: number;
}

export interface LanguageSpecificParser {
  parse(file: InMemoryFile): ParsedConfig[];
}

export enum FileType {
  JSON = 'json',
  YAML = 'yaml'
}
