import { ConfigBlock } from '../../../entities/index.js';
import { InternalError, JsonFileParseError, SyntaxError } from '../../../utils/errors.js';
import { File } from '../../reader/entities/file.js';
import { FileParser } from '../index.js';
import { JsonConfigBlockFactory } from './config-block-factory.js';

export class JsonFileParser implements FileParser {

  async parse(file: File): Promise<ConfigBlock[]> {
    if (file.fileType !== 'json') {
      throw new InternalError('Wrong file type passed to JSON parser');
    }

    const json = this.parseJson(file);
    return this.parseConfig(json, file);
  }

  private parseJson(file: File): unknown {
    try {
      return JSON.parse(file.contents);
    } catch (error) {
      throw new JsonFileParseError({
        fileName: file.fileName,
        message: (error as Error).message,
      });
    }
  }

  private parseConfig(json: unknown, file: File): ConfigBlock[] {
    if (!Array.isArray(json)) {
      throw new SyntaxError({
        fileName: file.fileName,
        lineNumber: '0',
        message: `The root of the config JSON must be an array. ${JSON.stringify(json, null, 2)}`,
      });
    }

    return json.map((obj) => JsonConfigBlockFactory.create(obj, {
      fileName: file.fileName,
      lineNumber: obj,
    }))
  }

}
