import { InternalError } from '../common/errors.js';
import { Project } from '../entities/project.js';
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
    return Project.create(configBlocks);
  }
}
