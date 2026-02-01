import { Config } from 'codify-schemas';

import { InternalError } from '../common/errors.js';
import { ConfigBlock } from '../entities/config.js';
import { Project } from '../entities/project.js';
import { ConfigFactory } from './config-factory.js';
import { FileType, InMemoryFile, ParsedConfig } from './entities.js';
import { MultipleFilesError, NoCodifyFileError } from './errors.js';
import { JsonParser } from './json/json-parser.js';
import { Json5Parser } from './json5/json-parser.js';
import { JsoncParser } from './jsonc/json-parser.js';
import { RemoteParser } from './remote/remote-parser.js';
import { CodifyResolver, ResolverResult, ResolverType } from './resolvers.js';
import { SourceMapCache } from './source-maps.js';
import { YamlParser } from './yaml/yaml-parser.js';

export const CODIFY_FILE_REGEX = /^(.*)?codify(.*)?(.json|.yaml|.json5|.jsonc)$/;

export interface ParserArgs {
  allowEmptyProject?: boolean;
  allowTemplates?: boolean;
  path?: string;
  transformProject?: (project: Project) => Project | Promise<Project>;
  rawConfigs?: Config[]; // Raw configs are provided directly
  resolverType?: ResolverType;
}

interface ParseResult {
  configs: ParsedConfig[];
  file: InMemoryFile;
}

interface ConfigResult {
  configs: ConfigBlock[];
  file: InMemoryFile;
}

class Parser {
  private readonly languageSpecificParsers= {
    [FileType.JSON]: new JsonParser(),
    [FileType.YAML]: new YamlParser(),
    [FileType.JSON5]: new Json5Parser(),
    [FileType.JSONC]: new JsoncParser(),
    [FileType.REMOTE]: new RemoteParser(),
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
  async parse(location: string, args?: ParserArgs, isLoggedIn = false): Promise<Project> {
    const sourceMaps = new SourceMapCache()

    const { configs, file } = await this.resolveFiles(location, args, isLoggedIn)
      .then((result) => this.validateResolver(result))
      .then((files) => this.parseContents(files, sourceMaps))
      .then((config) => this.createConfigBlocks(config, sourceMaps))

    return Project.create(configs, file.path, sourceMaps);
  }

  async parseJson(configs: Config[]): Promise<Project> {
    const sourceMaps = new SourceMapCache()

    const configBlocks = this.createConfigBlocks(configs
        .map((c) => ({ contents: c, sourceMapKey: '' })),
      sourceMaps
    )

    return Project.create(configBlocks.configs, undefined, sourceMaps);
  }

  private async resolveFiles(location: string, args?: ParserArgs, isLoggedIn = false): Promise<ResolverResult> {
    if (args?.resolverType) {
      return CodifyResolver.runResolver(location, args.resolverType);
    }

   if (args?.path) {
      return CodifyResolver.resolveLocal(args?.path)
    }

   return CodifyResolver.run(location, [
      ResolverType.LOCAL,
      (isLoggedIn) ? ResolverType.REMOTE_DOCUMENT_ID : null,
      (isLoggedIn) ? ResolverType.REMOTE_DOCUMENT : null,
      (args?.allowTemplates) ? ResolverType.TEMPLATE : null,
    ]);
  }

  private async validateResolver(result: ResolverResult): Promise<InMemoryFile> {
    if (result.files.length === 0) {
      throw new NoCodifyFileError(result);
    }

   if (result.files.length > 1) {
      throw new MultipleFilesError(result);
    }

    return result.files[0];
  }

  private parseContents(file: InMemoryFile, sourceMaps: SourceMapCache): ParseResult {
    const parser = this.languageSpecificParsers[file.fileType];
    if (!parser) {
      throw new InternalError(`Unable to find a language specific parser for type ${file.fileType} for file ${file.path}`)
    }

    const configs = parser.parse(file, sourceMaps);
    return { configs, file };
  }

  private createConfigBlocks(parseResult: ParseResult, sourceMaps: SourceMapCache): ConfigResult {
    const configs = parseResult.configs.map((config) => ConfigFactory.create(config, sourceMaps));
    return { configs, file: parseResult.file };
  }
}

export const CodifyParser = new Parser();
