import { Project } from '../entities/project.js';
import { ProjectConfig } from '../entities/project-config.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { InternalError } from '../utils/errors.js';
import { ConfigClass } from './language-definition.js';
import { FileParser } from './parser/index.js';
import { JsonFileParser } from './parser/json/file-parser.js';
import { ProjectReader } from './reader/index.js';
import { ConfigBlock } from '../entities/index.js';

export class Parser {

  static readonly supportedParsers: Record<string, FileParser> = {
    'json': new JsonFileParser(),
  }

  static async parseProject(directory: string): Promise<Project> {
    const configReader = new ProjectReader();
    const loadedProject = await configReader.readProject(directory);

    const configBlocksResult = await Promise.all(loadedProject.files.map((file) => {
      const parser = Parser.supportedParsers[file.fileType];
      if (!parser) {
        throw new InternalError(`Unsupported file format loaded into parser: ${file.fileName}`);
      }

      return parser.parse(file);
    }));

    const configBlocks = configBlocksResult.flat(1);
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
