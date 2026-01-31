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
import { MultipleFilesError } from './errors.js';
import { CodifyResolver, ResolverType } from './resolvers.js';

export const CODIFY_FILE_REGEX = /^(.*)?codify(.*)?(.json|.yaml|.json5|.jsonc)$/;

export interface ParserArgs {
  allowEmptyProject?: boolean;
  allowTemplates?: boolean;
  path?: string;
  transformProject?: (project: Project) => Project | Promise<Project>;
  rawConfigs?: Config[]; // Raw configs are provided directly
}

interface FilePointer {
  location: string;
  type: FileType;
}

class Parser {
  private readonly languageSpecificParsers= {
    [FileType.JSON]: new JsonParser(),
    [FileType.YAML]: new YamlParser(),
    [FileType.JSON5]: new Json5Parser(),
    [FileType.JSONC]: new JsoncParser(),
    [FileType.REMOTE]: new CloudParser(),
  }

  /**
   * Order:
   * 1. If a path is provided, parse it and look for the location within the path
   * 3. If it is a path (relative or absolute) then search for that directory or file
   * 4. If the path is an uuid (try to match it with a UUID) on the user's account (if they are logged in)
   * 5. Attempt to search for the name on the user's account (if they are logged in)
   * 6. Attempt to resolve to a public template (if allowTemplate is enabled)
   * Error out and tell the user that the following file could not be found
   *
   *
   * @param location
   * @param args
   */
  async parse(location: string, args?: ParserArgs): Promise<Project> {
    const sourceMaps = new SourceMapCache()

    const configs = this.resolveFiles(args)
      .then((result) => this.throwIfMultipleFiles(result))
      .then((path) => this.readFiles(codifyFiles))
      .then((files) => this.parseContents(files, sourceMaps))
      .then((config) => this.createConfigBlocks(config, sourceMaps))

    return Project.create(configs, codifyFiles[0], sourceMaps);
  }

  async parseJson(configs: Config[]): Promise<Project> {
    const sourceMaps = new SourceMapCache()

    const configBlocks = this.createConfigBlocks(configs
        .map((c) => ({ contents: c, sourceMapKey: '' })),
      sourceMaps
    )

    return Project.create(configBlocks, undefined, sourceMaps);
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

  private async resolveFiles(location: string, args?: ParserArgs, isLoggedIn = false): Promise<string[]> {
    return CodifyResolver.runUntilResolves(location, [
      (args?.path) ? ResolverType.EXPLICIT_PATH : null,
      ResolverType.FILE_OR_DIRECTORY,
      (isLoggedIn) ? ResolverType.REMOTE_DOCUMENT_ID : null,
      (isLoggedIn) ? ResolverType.REMOTE_FILE : null,
      ResolverType.TEMPLATE,
    ]);

  }

  private async throwIfMultipleFiles(result: string[]): Promise<string> {
    if (result.length > 1) {
      throw new MultipleFilesError(result);
    }

    return result[0];
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
        throw new InternalError(`Unable to find a language specific parser for type ${file.fileType} for file ${file.path}`)
      }

      return parser.parse(file, sourceMaps);
    });
  }

  private createConfigBlocks(parsedConfig: ParsedConfig[], sourceMaps: SourceMapCache): ConfigBlock[] {
    return parsedConfig.map((config) => ConfigFactory.create(config, sourceMaps))
  }
}

export const CodifyParser = new Parser();
