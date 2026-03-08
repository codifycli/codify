import JsonSourceMap from '@mischnic/json-sourcemap';
import { Config, ConfigFileSchema } from '@codifycli/schemas';
import jju from 'jju'

import { AjvValidationError, SyntaxError } from '../../common/errors.js';
import { ajv } from '../../utils/ajv.js';
import { InMemoryFile, LanguageSpecificParser, ParsedConfig } from '../entities.js';
import { SourceMapCache } from '../source-maps.js';

const validator = ajv.compile(ConfigFileSchema);

export class JsoncParser implements LanguageSpecificParser {
  parse(file: InMemoryFile, sourceMaps?: SourceMapCache): ParsedConfig[] {
    let content;
    try {
      content = jju.parse(file.contents);

      if (sourceMaps) {
        sourceMaps.addSourceMap(file, JsonSourceMap.parse(file.contents, undefined, { dialect: 'JSON5' }));
      }
    } catch (error) {
      throw new SyntaxError({
        fileName: file.filePath,
        message: (error as Error).message,
      });
    }

    if (!this.validate(content)) {
      throw new AjvValidationError('invalid config file', validator.errors!, file.filePath, sourceMaps);
    }

    return content.map((contents, idx) => ({
      contents,
      sourceMapKey: SourceMapCache.constructKey(file.filePath, `/${idx}`)
    }))
  }

  private validate(content: unknown): content is Config[] {
    return validator(content);
  }
}
