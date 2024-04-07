import { LoadedModule } from './module.js';

export interface LoadedProject {
  coreModule: LoadedModule;
  rootDirectory: string;
}
