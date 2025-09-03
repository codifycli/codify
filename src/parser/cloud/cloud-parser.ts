import { Config } from 'codify-schemas';

import { InMemoryFile, LanguageSpecificParser, ParsedConfig } from '../entities.js';
import { SourceMapCache } from '../source-maps.js';

export class CloudParser implements LanguageSpecificParser {
  parse(file: InMemoryFile, sourceMaps: SourceMapCache): ParsedConfig[] {
    const contents = JSON.parse(file.contents) as Array<Config>;

    return contents.map((content) => {
      const { id, type, ...config } = content;
      return {
        contents: { type, ...config },
        sourceMapKey: id as string,
      }
    })
  }

}
