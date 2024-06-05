import { ConfigBlock } from '../entities/config.js';
import { Project } from '../entities/project.js';
import { ProjectConfig } from '../entities/project-config.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { InternalError } from '../common/errors.js';
import { ConfigClass } from './language-definition.js';
import { FileParser } from './parser/index.js';
import { JsonFileParser } from './parser/json/file-parser.js';
import { FileReader } from './reader/index.js';

export class Parser {

  static readonly supportedParsers: Record<string, FileParser> = {
    'json': new JsonFileParser(),
  }

  static async parseProject(path: string): Promise<Project> {
    const fileReader = new FileReader();
    const configFile = await fileReader.readConfigOrThrow(path);

    const parser = Parser.supportedParsers[configFile.fileType];
    if (!parser) {
      throw new InternalError(`Unsupported file format loaded into parser: ${configFile.fileName}`);
    }

    const configBlocks = await parser.parse(configFile);
    const projectConfig = Parser.findProjectConfig(configBlocks);

    return new Project(
      projectConfig,
      configBlocks.filter((u) => u.configClass !== ConfigClass.PROJECT) as ResourceConfig[],
    )
  }

  private static findProjectConfig(configBlocks: ConfigBlock[]): ProjectConfig | null {
    const parsedProjectConfigs = configBlocks.filter((u) => u.configClass === ConfigClass.PROJECT);
    if (parsedProjectConfigs.length > 1) {
      throw new Error('One or zero project config can be specified');
    }

    return (parsedProjectConfigs[0] ?? null) as unknown as ProjectConfig | null;
  }
}
