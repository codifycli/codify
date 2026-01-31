import JsonSourceMap from '@mischnic/json-sourcemap';
import { Config, ConfigFileSchema } from 'codify-schemas';
import JSON5 from 'json5'

import { AjvValidationError, SyntaxError } from '../../common/errors.js';
import { ajv } from '../../utils/ajv.js';
import { InMemoryFile, LanguageSpecificParser, ParsedConfig } from '../entities.js';
import { SourceMapCache } from '../source-maps.js';

const validator = ajv.compile(ConfigFileSchema);

export class Json5Parser implements LanguageSpecificParser {
  parse(file: InMemoryFile, sourceMaps?: SourceMapCache): ParsedConfig[] {
    let content;
    try {
      content = JSON5.parse(file.contents);

      if (sourceMaps) {
        sourceMaps.addSourceMap(file, JsonSourceMap.parse(file.contents, undefined, { dialect: 'JSON5' }));
      }
    } catch (error) {
      throw new SyntaxError({
        fileName: file.path,
        message: (error as Error).message,
      });
    }

    if (!this.validate(content)) {
      throw new AjvValidationError('invalid config file', validator.errors!, file.path, sourceMaps);
    }

    return content.map((contents, idx) => ({
        contents,
        sourceMapKey: SourceMapCache.constructKey(file.path, `/${idx}`)
      }))
  }

  private validate(content: unknown): content is Config[] {
    return validator(content);
  }
}
