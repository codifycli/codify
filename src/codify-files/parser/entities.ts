import { Config } from 'codify-schemas';

import { InMemoryFile } from '../resolver/entities.js';
import { SourceMapCache } from './source-maps.js';

export interface ParsedConfig {
  contents: Config;
  sourceMapKey: string;
}

export interface LanguageSpecificParser {
  parse(file: InMemoryFile, sourceMaps: SourceMapCache): ParsedConfig[];
}
