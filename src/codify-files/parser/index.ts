import { Config } from 'codify-schemas';

import { InternalError } from '../../common/errors.js';
import { ConfigBlock } from '../../entities/config.js';
import { Project } from '../../entities/project.js';
import { FileType, InMemoryFile } from '../resolver/entities.js';
import { ConfigFactory } from './config-factory.js';
import { ParsedConfig } from './entities.js';
import { JsonParser } from './json/json-parser.js';
import { Json5Parser } from './json5/json-parser.js';
import { JsoncParser } from './jsonc/json-parser.js';
import { RemoteParser } from './remote/remote-parser.js';
import { SourceMapCache } from './source-maps.js';
import { YamlParser } from './yaml/yaml-parser.js';

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
   * @param file
   * @param args
   */
  async parse(file: InMemoryFile): Promise<Project> {
    const sourceMaps = new SourceMapCache()

    const { configs } = await Promise.resolve(this.parseContents(file, sourceMaps))
      .then((config) => this.createConfigBlocks(config, sourceMaps))

    return Project.create(configs, file.path, sourceMaps);
  }

  async parseJson(configs: Config[], path?: string): Promise<Project> {
    const sourceMaps = new SourceMapCache()

    const configBlocks = this.createConfigBlocks({
      configs: configs.map((c) => ({ contents: c, sourceMapKey: '' })),
      file: { contents: JSON.stringify(configs), path: path ?? '', fileType: FileType.JSON },
    }, sourceMaps)

    return Project.create(configBlocks.configs, path, sourceMaps);
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
