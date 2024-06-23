import { File } from '../reader/file.js';
import { ConfigBlock } from '../../entities/config.js';

export interface FileParser {
  parse(file: File): Promise<ConfigBlock[]>
}
