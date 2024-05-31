import { ConfigClass } from '../parser/language-definition.js';

export interface ConfigBlock {
  configClass: ConfigClass;
  type: string;

  validateConfig(config: unknown): never | void;
}
