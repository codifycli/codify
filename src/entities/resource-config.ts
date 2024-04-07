import { ResourceSchema } from 'codify-schemas';

import { ConfigClass } from '../config-parser/language-definition.js';
import { ajv } from '../utils/ajv.js';
import { RemoveMethods } from '../utils/types.js';
import { ConfigBlock } from './index.js';

/** Resource JSON supported format
 * {
 *   "type": "plugin_name_resource_1",
 *   "name?": "optional-name"
 *   "parameter1": {
 *     "plguin1": "^10.6.2", // From registry
 *     "https://www.github.com/project": "^10.3.2", // url
 *   }
 *   "parameter2": "string",
 *   "parameter3": 1,
 * }
 *
 * We won't be able to validate the parameters until we get the resource definitions from the plugins
 */

const REFERENCE_REGEX = /\${(?<reference>[\w.]+)}/g

const validate = ajv.compile(ResourceSchema);

export class ResourceConfig implements ConfigBlock {
  readonly configClass = ConfigClass.RESOURCE;

  raw: Record<string, unknown>;
  type: string;
  name?: string;
  parameters: Record<string, unknown>;
  dependencyIds: string[] = []; // id of other nodes

  constructor(config: unknown) {
    if (this.validateConfig(config)) {
      const { name, type, ...parameters } = config;

      this.raw = config;
      this.type = type;
      this.name = name;
      this.parameters = parameters ?? {};

      return;
    }

    throw new Error('Unable to parse resource config');
  }

  validateConfig(config: unknown): config is RemoveMethods<ResourceConfig> {
    if (!validate(config)) {
      throw new Error(`Invalid project config: ${JSON.stringify(validate.errors, null, 2)}`)
    }

    return true;
  }

  get id() {
    return this.name === null || this.name === undefined ? this.type : `${this.type}.${this.name}`;
  }

  parseDependenciesFromParameters(resourceExists: (id: string) => boolean) {
    // TODO: Only string dependencies are supported currently
    const parametersWithDependencies = Object.entries(this.parameters)
      .filter(([, v]) => typeof v === 'string')
      .filter(([, v]) => REFERENCE_REGEX.test(v as string));

    parametersWithDependencies.forEach(([, value]) => {
      const matchResult = [...(value as string).matchAll(REFERENCE_REGEX)];

      if (!matchResult) {
        throw new Error('Internal Error: expect dependency match result to not be null');
      }

      const ids = matchResult.map(([, capturedStr]) => {
        return capturedStr;
      })

      // Validate that each id exists
      ids.forEach((id) => {
        if (!resourceExists(id)) {
          throw new Error(`Reference ${id} is not a valid resource`)
        }
      });

      this.dependencyIds.push(...ids);
    })
  }

  addDependencies(dependencies: string[]) {
    this.dependencyIds.push(...dependencies);
  }
}
