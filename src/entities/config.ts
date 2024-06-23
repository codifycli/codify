import { ConfigType } from '../parser/language-definition.js';

export interface ConfigBlock {
  configClass: ConfigType;
  type: string;
}
