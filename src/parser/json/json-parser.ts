import { Config, ConfigFileSchema } from 'codify-schemas';
import parseJson from 'parse-json';
import * as jsonSourceMap from 'json-source-map';

import { AjvValidationError, SyntaxError } from '../../common/errors.js';
import { ajv } from '../../utils/ajv.js';
import { InMemoryFile, LanguageSpecificParser, ParsedConfig } from '../entities.js';
import { SourceMapCache } from '../source-maps.js';

const validator = ajv.compile(ConfigFileSchema);

export class JsonParser implements LanguageSpecificParser {
  parse(file: InMemoryFile, sourceMaps: SourceMapCache): ParsedConfig[] {
    let content;
    try {
      content = parseJson(file.contents);

      sourceMaps.addSourceMap(file, jsonSourceMap.parse(file.contents));
    } catch (error) {
      throw new SyntaxError({
        fileName: file.filePath,
        message: (error as Error).message,
      });
    }

    if (!this.validate(content)) {
      throw new AjvValidationError('invalid config file', validator.errors!, file.filePath, sourceMaps);
    }

    return content.map((contents, idx) => {
      return {
        contents,
        sourceMapKey: SourceMapCache.constructKey(file.filePath, `/${idx}`)
      }
    })
  }

  private validate(content: unknown): content is Config[] {
    return validator(content);
  }
}
