import * as fs from 'node:fs/promises';
import path from 'node:path';

import { Project } from '../entities/project.js';
import { FileReader } from './reader.js';
import { InMemoryFile, ParsedConfig } from './entities.js';

const CODIFY_FILE_REGEX = /^codify(\..*)?(.json|.yaml)$/gm;

export const CodifyParser = new class {
  parse(dirOrFile: string): Project {
    const absolutePath = path.resolve(dirOrFile);
    
    await this.getFilePaths(absolutePath)
      .then((paths) => this.readFiles(paths))
      .then((files) => )

  }

  private async getFilePaths(dirOrFile: string): Promise<string[]> {
    const isDirectory = (await fs.lstat(dirOrFile)).isDirectory();

    // A single file was passed in. We need to test if the file satisfies the codify file regex
    if (!isDirectory) {
      const fileName = path.basename(dirOrFile);
      if (!CODIFY_FILE_REGEX.test(fileName)) {
        throw new Error(`Invalid file path provided ${dirOrFile}. Expected the file to be codify.*.json or .yaml `)
      }

      return [dirOrFile];
    }

    const filesInDir = await fs.readdir(dirOrFile);

    return filesInDir
      .filter((name) => CODIFY_FILE_REGEX.test(name))
      .map((name) => path.join(dirOrFile, name))
  }

  private readFiles(filePaths: string[]): Promise<InMemoryFile[]> {
    return Promise.all(filePaths.map(
      (p) => FileReader.read(p)
    ))
  }

  private parseContents(files: InMemoryFile[]): Promise<ParsedConfig[]> {
    return Promise.all()
  }
}
