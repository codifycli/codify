import { Config } from 'codify-schemas';
import jsonSourceMap from 'json-source-map';

import { InMemoryFile } from '../../resolver/entities.js';
import { LanguageSpecificParser, ParsedConfig } from '../entities.js';
import { SourceMapCache } from '../source-maps.js';

export class RemoteParser implements LanguageSpecificParser {
  parse(file: InMemoryFile, sourceMaps: SourceMapCache): ParsedConfig[] {
    const contents = JSON.parse(file.contents) as Array<Config>;

    if (sourceMaps) {
      sourceMaps.addSourceMap(file, jsonSourceMap.parse(file.contents));
    }

    return contents.map((content, idx) => {
      const { type, ...config } = content;
      return {
        contents: { type, ...config },
        sourceMapKey: SourceMapCache.constructKey(file.path, `/${idx}`),
      }
    })
  }

}
