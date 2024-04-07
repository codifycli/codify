import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { Parser } from '../index.js';
import { File } from './entities/file.js';
import { LoadedProject } from './entities/project.js';

/**
 * This class loads relevant files in the project directory into memory so that they can be compiled
 * TODO: Rename this to reader. A loader has a different meaning for compilers
 */
export class ProjectReader {

  async readProject(directory: string): Promise<LoadedProject> {
    try {
      const project: LoadedProject = {
        files: [],
        rootDirectory: directory,
      }

      const dir = await fs.readdir(directory);
      await Promise.all(dir
        .map(async (fileName) => {
          if (!this.isFileTypeSupported(fileName)) {
            return;
          }

          const parsedFile = await this.readFile(fileName, directory);
          project.files.push(parsedFile);
        })
      );

      return project;

    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  private async readFile(fileName: string, directory: string): Promise<File> {
    const fileLocation = path.join(directory, fileName);
    const fileType = fileName.lastIndexOf('.') === -1 ? '' : fileName.split('.').pop()!;

    return new File({ contents: await fs.readFile(fileLocation, 'utf8'), fileName, fileType });
  }

  private isFileTypeSupported(fileName: string): boolean {
    const parser = Object.entries(Parser.supportedParsers).find(([k]) => fileName.endsWith(k));

    return parser !== null && parser !== undefined;
  }
}
