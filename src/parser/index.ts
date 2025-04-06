import * as fs from 'node:fs/promises';
import path from 'node:path';

import { InternalError } from '../common/errors.js';
import { ConfigBlock } from '../entities/config.js';
import { Project } from '../entities/project.js';
import { ConfigFactory } from './config-factory.js';
import { FileType, InMemoryFile, ParsedConfig } from './entities.js';
import { JsonParser } from './json/json-parser.js';
import { Json5Parser } from './json5/json-parser.js';
import { JsoncParser } from './jsonc/json-parser.js';
import { FileReader } from './reader.js';
import { SourceMapCache } from './source-maps.js';
import { YamlParser } from './yaml/yaml-parser.js';

export const CODIFY_FILE_REGEX = /^(.*)?codify(.json|.yaml|.json5|.jsonc)$/;

class Parser {
  private readonly languageSpecificParsers= {
    [FileType.JSON]: new JsonParser(),
    [FileType.YAML]: new YamlParser(),
    [FileType.JSON5]: new Json5Parser(),
    [FileType.JSONC]: new JsoncParser()
  }

  async parse(dirOrFile: string): Promise<Project> {
    const absolutePath = path.resolve(dirOrFile);
    const sourceMaps = new SourceMapCache()
    const codifyFiles = await this.getFilePaths(absolutePath)
    
    const configs = await this.readFiles(codifyFiles)
      .then((files) => this.parseContents(files, sourceMaps))
      .then((config) => this.createConfigBlocks(config, sourceMaps))

    return Project.create(configs, codifyFiles, sourceMaps);
  }

  private async getFilePaths(dirOrFile: string): Promise<string[]> {
    const isDirectory = (await fs.lstat(dirOrFile)).isDirectory();

    // A single file was passed in. We need to test if the file satisfies the codify file regex
    if (!isDirectory) {
      const fileName = path.basename(dirOrFile);
      if (!CODIFY_FILE_REGEX.test(fileName)) {
        throw new Error(`Invalid file path provided ${dirOrFile} ${fileName}. Expected the file to be *codify.json or *codify.yaml `)
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

  private parseContents(files: InMemoryFile[], sourceMaps: SourceMapCache): ParsedConfig[] {
    return files.flatMap((file) => {
      const parser = this.languageSpecificParsers[file.fileType];
      if (!parser) {
        throw new InternalError(`Unable to find a language specific parser for type ${file.fileType} for file ${file.filePath}`)
      }

      return parser.parse(file, sourceMaps);
    });
  }

  private createConfigBlocks(parsedConfig: ParsedConfig[], sourceMaps: SourceMapCache): ConfigBlock[] {
    return parsedConfig.map((config) => ConfigFactory.create(config, sourceMaps))
  }
}

export const CodifyParser = new Parser();
