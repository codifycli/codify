import * as fs from 'node:fs/promises';

import { InternalError } from '../../common/errors.js';
import { FileType, InMemoryFile } from '../entities.js';
import { Reader } from './index.js';

export class FileReader implements Reader {
  async read(filePath: string): Promise<InMemoryFile> {
    const contents = await fs.readFile(filePath, 'utf8');

    return {
      contents,
      filePath,
      fileType: FileReader.getFileType(filePath),
    }
  }

  private static getFileType(filePath: string): FileType {
    if (filePath.endsWith('.json')) {
      return FileType.JSON
    }

    if (filePath.endsWith('.yaml')) {
      return FileType.YAML
    }

    if (filePath.endsWith('.json5')) {
      return FileType.JSON5
    }

    if (filePath.endsWith('.jsonc')) {
      return FileType.JSONC
    }

    throw new InternalError(`Unsupported file type passed to FileReader. File path: ${filePath}`);
  }
}
