import fs from 'node:fs/promises';
import path from 'node:path';

import { InternalError } from '../common/errors.js';
import { FileType, InMemoryFile } from './entities.js';

export class FileReader {
  static async read(filePath: string): Promise<InMemoryFile> {
    const contents = await fs.readFile(filePath, 'utf8');
    
    return {
      contents,
      directory: path.dirname(filePath),
      fileName: path.basename(filePath),
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
 
    throw new InternalError(`Unsupported file type passed to FileReader. File path: ${filePath}`);
  }
}
