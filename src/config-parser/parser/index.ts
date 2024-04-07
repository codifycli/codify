import { ConfigBlock } from '../../entities/index.js';
import { File } from '../reader/entities/file.js';

export interface FileParser {
  parse(file: File): Promise<ConfigBlock[]>
}
