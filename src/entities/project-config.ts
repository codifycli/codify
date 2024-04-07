import { ProjectSchema } from 'codify-schemas';

import { ConfigClass } from '../config-compiler/language-definition.js';
import { ajv } from '../utils/ajv.js';
import { RemoveMethods } from '../utils/types.js';
import { ConfigBlock } from './index.js';

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

const validate = ajv.compile(ProjectSchema);

export class ProjectConfig implements ConfigBlock {
  configClass = ConfigClass.PROJECT;

  type: string;
  name?: string;
  plugins?: Record<string, string>;

  constructor(config: unknown) {
    if (this.validateConfig(config)) {
      this.type = config.type; // type is always project
      this.name = config.name;
      this.plugins = config.plugins;

      return;
    }

    throw new Error('Unable to parse project');
  }

  validateConfig(config: unknown): config is RemoveMethods<ProjectConfig> {
    if (!validate(config)) {
      throw new Error(`Invalid project config: ${JSON.stringify(validate.errors, null, 2)}`)
    }

    return true;
  }
}
