import { ProjectSchema } from 'codify-schemas';
import parseJson from 'parse-json';

import { InternalError, SyntaxError } from '../../../common/errors.js';
import { ConfigBlock } from '../../../entities/config.js';
import { ajv } from '../../../utils/ajv.js';
import { File } from '../../reader/file.js';
import { FileParser } from '../index.js';
import { JsonConfigBlockFactory } from './config-block-factory.js';

export class JsonFileParser implements FileParser {
  readonly validate = ajv.compile(ProjectSchema);

  async parse(file: File): Promise<ConfigBlock[]> {
    if (file.fileType !== 'json') {
      throw new InternalError('Wrong file type passed to JSON parser');
    }

    const json = this.parseJson(file);
    return this.parseConfig(json, file);
  }

  private parseJson(file: File): unknown {
    try {
      return parseJson(file.contents);
    } catch (error) {
      throw new SyntaxError({
        fileName: file.fileName,
        message: (error as Error).message,
      });
    }
  }

  private parseConfig(json: unknown, file: File): ConfigBlock[] {
    return json.map((obj) => JsonConfigBlockFactory.create(obj))
  }

  private validateProject() {

  }

}
