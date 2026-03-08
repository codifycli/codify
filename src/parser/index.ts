import { Config } from 'codify-schemas';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { validate } from 'uuid'

import { InternalError } from '../common/errors.js';
import { ConfigBlock } from '../entities/config.js';
import { Project } from '../entities/project.js';
import { FileUtils } from '../utils/file.js';
import { CloudParser } from './cloud/cloud-parser.js';
import { ConfigFactory } from './config-factory.js';
import { FileType, InMemoryFile, ParsedConfig } from './entities.js';
import { JsonParser } from './json/json-parser.js';
import { Json5Parser } from './json5/json-parser.js';
import { JsoncParser } from './jsonc/json-parser.js';
import { CloudReader } from './reader/cloud-reader.js';
import { FileReader } from './reader/file-reader.js';
import { SourceMapCache } from './source-maps.js';
import { YamlParser } from './yaml/yaml-parser.js';

export const CODIFY_FILE_REGEX = /^(.*)?codify(.*)?(.json|.yaml|.json5|.jsonc)$/;

class Parser {
  private readonly languageSpecificParsers= {
    [FileType.JSON]: new JsonParser(),
    [FileType.YAML]: new YamlParser(),
    [FileType.JSON5]: new Json5Parser(),
    [FileType.JSONC]: new JsoncParser(),
    [FileType.CLOUD]: new CloudParser(),
  }

  async parse(dirOrFile: string): Promise<Project> {
    const sourceMaps = new SourceMapCache()
    const codifyFiles = await this.getFilePaths(dirOrFile)
    
    const configs = await this.readFiles(codifyFiles)
      .then((files) => this.parseContents(files, sourceMaps))
      .then((config) => this.createConfigBlocks(config, sourceMaps))

    return Project.create(configs, codifyFiles, sourceMaps);
  }

  async parseJson(configs: Config[]): Promise<Project> {
    const sourceMaps = new SourceMapCache()

    const configBlocks = this.createConfigBlocks(configs
        .map((c) => ({ contents: c, sourceMapKey: '' })),
      sourceMaps
    )

    return Project.create(configBlocks, [], sourceMaps);
  }

  private async getFilePaths(dirOrFile: string): Promise<string[]> {
    // A cloud file is represented as an uuid. Skip file checks if it's a cloud file;
    if (validate(dirOrFile)) {
      return [dirOrFile];
    }

    const absolutePath = path.resolve(dirOrFile);
    const isDirectory = (await fs.lstat(absolutePath)).isDirectory();

    // A single file was passed in. We need to test if the file satisfies the codify file regex
    if (!isDirectory) {
      const fileName = path.basename(absolutePath);
      if (!CODIFY_FILE_REGEX.test(fileName)) {
        throw new Error(`Invalid file path provided ${absolutePath} ${fileName}. Expected the file to be *.codify.jsonc, *.codify.json5, *.codify.json, or *.codify.yaml `)
      }

      return [absolutePath];
    }

    const filesInDir = await fs.readdir(absolutePath);

    return filesInDir
      .filter((name) => CODIFY_FILE_REGEX.test(name))
      .map((name) => path.join(absolutePath, name))
  }

  private readFiles(filePaths: string[]): Promise<InMemoryFile[]> {
    const cloudReader = new CloudReader();
    const fileReader = new FileReader();

    return Promise.all(filePaths.map(
      async (p) => {
        // If path is a uuid and doesn't exist as a file, it's a cloud file
        if (validate(p) && !(await FileUtils.fileExists(p))) {
          return cloudReader.read(p)
        }

        return fileReader.read(p)
      }
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
