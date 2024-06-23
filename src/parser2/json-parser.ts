import { Config, ConfigFileSchema } from 'codify-schemas';
import parseJson from 'parse-json';

import { SyntaxError } from '../common/errors.js';
import { ajv } from '../utils/ajv.js';
import { InMemoryFile, LanguageSpecificParser, ParsedConfig } from './entities.js';

const validator = ajv.compile(ConfigFileSchema);

export class JsonParser implements LanguageSpecificParser {


  parse(file: InMemoryFile): ParsedConfig[] {
    let content;
    try {
      content = parseJson(file.contents);
    } catch (error) {
      throw new SyntaxError({
        fileName: file.fileName,
        message: (error as Error).message,
      });
    }

    if (!JsonParser.validate(content)) {

    }
  }

  private static validate(content: unknown): content is Config[] {
    return validator(content);
  }
}
