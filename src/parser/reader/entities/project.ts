import { File } from './file.js';

export interface LoadedProject {
  files: File[];
  rootDirectory: string;
}
