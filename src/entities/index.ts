import { ConfigClass } from '../config-compiler/language-definition.js';

export interface ConfigBlock {
  configClass: ConfigClass;
  type: string;

  validateConfig(config: unknown): never | void;
}
