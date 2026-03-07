import { Config, ConfigFileSchema } from '@codifycli/schemas';
import * as yaml from 'js-yaml';
import SourceMap from 'js-yaml-source-map';

import { AjvValidationError } from '../../common/errors.js';
import { ajv } from '../../utils/ajv.js';
import { InMemoryFile, LanguageSpecificParser, ParsedConfig } from '../entities.js';
import { SourceMapCache } from '../source-maps.js';

const validator = ajv.compile(ConfigFileSchema);

export class YamlParser implements LanguageSpecificParser {
  parse(file: InMemoryFile, sourceMaps?: SourceMapCache): ParsedConfig[] {
    const sourceMap = new SourceMap()

    let contents;
    try {
      contents = yaml.load(file.contents, { listener: sourceMap.listen() });
    } catch (error) {
      throw error;
    }

    if (sourceMaps) {
      sourceMaps.addSourceMap(file, sourceMap);
    }

    if (!this.validate(contents)) {
      throw new AjvValidationError('invalid config file', validator.errors!, file.filePath, sourceMaps);
    }

    return contents.map((contents, idx) => ({
        contents,
        sourceMapKey: SourceMapCache.constructKey(file.filePath, `/${idx}`)
      }))
  }

  private validate(content: unknown): content is Config[] {
    return validator(content);
  }
}
