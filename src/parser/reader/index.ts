import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { File } from './file.js';

const CODIFY_FILE_NAME = 'codify.json';
const NO_CONFIG_FOUND_ERROR_MESSAGE = 'No configuration found. Codify configuration files must be named codify.json'

/**
 * This class loads relevant files in the project directory into memory so that they can be compiled
 * TODO: Rename this to reader. A loader has a different meaning for compilers
 */
export class FileReader {

  async readConfigOrThrow(directory: string): Promise<File> {
    try {
      const stat = await fs.stat(directory);
      if (stat.isFile() && path.basename(directory) === CODIFY_FILE_NAME) {
        return await this.readFile(directory);
      } else if (stat.isDirectory()) {
        return await this.readDirectory(directory, CODIFY_FILE_NAME)
      } else {
        throw new Error(NO_CONFIG_FOUND_ERROR_MESSAGE);
      }

    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  private async readDirectory(directory: string, fileName: string): Promise<File> {
    const dir = await fs.readdir(directory);

    if (!dir.includes(CODIFY_FILE_NAME)) {
      throw new Error(NO_CONFIG_FOUND_ERROR_MESSAGE);
    }

    const fileLocation = path.join(directory, fileName);
    return this.readFile(fileLocation);
  }

  private async readFile(fileLocation: string): Promise<File> {
    const fileName = path.basename(fileLocation);
    const fileType = fileName.lastIndexOf('.') === -1 ? '' : fileName.split('.').pop()!;

    return new File({ contents: await fs.readFile(fileLocation, 'utf8'), fileName, fileType });
  }
}
