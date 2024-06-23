import { ProjectConfig as SchemaProjectConfig } from 'codify-schemas';

import { ConfigBlock, ConfigType } from './config.js';

/** Project JSON supported format
 * {
 *   "type": "project",
 *   "name?": "optional-name"
 *   "plugins?": {
 *     "plguin1": "^10.6.2", // From registry
 *     "https://www.github.com/project": "^10.3.2", // url
 *   }
 * }
 */

export class ProjectConfig implements ConfigBlock {
  configClass = ConfigType.PROJECT;
  type = ConfigType.PROJECT;

  version?: string;
  plugins?: Record<string, string>;
  description?: string;

  constructor(config: SchemaProjectConfig) {
    this.version = config.version;
    this.description = config.description;
    this.plugins = config.plugins;
  }
}
