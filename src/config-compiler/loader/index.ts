import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { ConfigReader } from '../index.js';
import { LoadedFile } from './entities/file.js';
import { LoadedModule } from './entities/module.js';
import { LoadedProject } from './entities/project.js';

/**
 * This class loads relevant files in the project directory into memory so that they can be compiled
 * TODO: Rename this to reader. A loader has a different meaning for compilers
 */
export class ConfigLoader {

  async loadProject(directory: string): Promise<LoadedProject> {
    try {
      const coreModule = await this.loadModule(directory);

      return {
        coreModule,
        rootDirectory: directory,
      };

    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  private async loadModule(directory: string): Promise<LoadedModule> {
    const dir = await fs.readdir(directory);
    const module: LoadedModule = {
      directory,
      files: [],
      // modules: [],
    }

    await Promise.all(dir
      .map(async (fileName) => {
        const matchedParser = Object.entries(ConfigReader.supportedParsers).find(([k]) => fileName.endsWith(k))
        if (!matchedParser) {
          return;
        }

        const parsedFile = await this.loadFile(fileName, directory);
        module.files.push(parsedFile);
      })
    );

    return module;
  }

  private async loadFile(fileName: string, directory: string): Promise<LoadedFile> {
    const fileLocation = path.join(directory, fileName);
    const fileType = fileName.lastIndexOf('.') === -1 ? '' : fileName.split('.').pop()!;

    return new LoadedFile({ contents: await fs.readFile(fileLocation, 'utf8'), fileName, fileType });
  }
}
