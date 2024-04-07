import { ConfigBlock } from '../../entities/index.js';
import { LoadedFile } from '../loader/entities/file.js';

export interface FileParser {
  parse(file: LoadedFile): Promise<ConfigBlock[]>
}
