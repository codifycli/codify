import { Config, ConfigFileSchema } from 'codify-schemas';
import * as yaml from 'js-yaml';

import { AjvValidationError } from '../../common/errors.js';
import { ajv } from '../../utils/ajv.js';
import { InMemoryFile, LanguageSpecificParser, ParsedConfig } from '../entities.js';
import SourceMap from 'js-yaml-source-map';

const validator = ajv.compile(ConfigFileSchema);

export class YamlParser implements LanguageSpecificParser {
  parse(file: InMemoryFile): ParsedConfig[] {
    const sourceMap = new SourceMap()

    let contents;
    try {
      contents = yaml.load(file.contents, { listener: sourceMap.listen() });
    } catch (error) {
      throw error;
    }

    if (!this.validate(contents)) {
      throw new AjvValidationError('invalid config', validator.errors!, {
        fileName: file.filePath,
        contents: contents as any,
      });
    }

    const fileLength = file.contents.split(/\n/g).length;

    return contents.map((contents, idx) => {
      const pointer = sourceMap.lookup(`.${idx}`);
      const nextPointer = sourceMap.lookup(`.${idx + 1}`)

      const lineNumberStart = pointer?.line ?? 0;
      const lineNumberEnd = nextPointer?.line ?? fileLength;

      return {
        filePath: file.filePath,
        fileType: file.fileType,
        contents,
        lineNumberStart,
        lineNumberEnd,
      }
    })
  }

  private validate(content: unknown): content is Config[] {
    return validator(content);
  }
}
