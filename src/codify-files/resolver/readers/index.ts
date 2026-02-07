import { InMemoryFile } from '../entities.js';

export interface Reader {
  read(filePath: string): Promise<InMemoryFile>;
}
