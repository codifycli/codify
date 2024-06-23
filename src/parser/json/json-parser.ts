import { Config, ConfigFileSchema } from 'codify-schemas';
import parseJson from 'parse-json';
import * as jsonSourceMap from 'src/parser2/json/json-source-map.js';

import { AjvValidationError, SyntaxError } from '../../common/errors.js';
import { ajv } from '../../utils/ajv.js';
import { InMemoryFile, LanguageSpecificParser, ParsedConfig } from '../entities.js';

const validator = ajv.compile(ConfigFileSchema);

export class JsonParser implements LanguageSpecificParser {
  parse(file: InMemoryFile): ParsedConfig[] {
    let content;
    try {
      content = parseJson(file.contents);
    } catch (error) {
      throw new SyntaxError({
        fileName: file.filePath,
        message: (error as Error).message,
      });
    }

    if (!this.validate(content)) {
      throw new AjvValidationError('invalid config', validator.errors!, {
        fileName: file.filePath,
        contents: content,
      });
    }

    const sourceMap = jsonSourceMap.parse(file.contents, null, 2);

    return content.map((contents, idx) => {
      const pointer = sourceMap.pointers[`/${idx}`];

      return {
        filePath: file.filePath,
        fileType: file.fileType,
        contents,
        lineNumberStart: pointer.value.line,
        lineNumberEnd: pointer.valueEnd.line,
      }
    })
  }

  private validate(content: unknown): content is Config[] {
    return validator(content);
  }
}
