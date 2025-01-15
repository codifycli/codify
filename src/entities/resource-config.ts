import { ResourceJson, ResourceConfig as SchemaResourceConfig } from 'codify-schemas';

import { ConfigBlock, ConfigType } from './config.js';

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

export class ResourceConfig implements ConfigBlock {
  readonly configClass = ConfigType.RESOURCE;

  raw: SchemaResourceConfig;
  type: string;
  name?: string;
  dependsOn: string[];
  sourceMapKey?: string;

  // Calculated
  dependencyIds: string[] = []; // id of other nodes
  parameters: Record<string, unknown>;

  constructor(config: SchemaResourceConfig, sourceMapKey?: string) {
    const { dependsOn, name, type, ...parameters } = config;

    this.raw = config;
    this.type = type;
    this.name = name;
    this.parameters = parameters ?? {};
    this.dependsOn = dependsOn ?? []
    this.sourceMapKey = sourceMapKey;
  }

  get id() {
    return this.name ? `${this.type}.${this.name}` : this.type;
  }

  toJson(): ResourceJson {
    return {
      core: {
        type: this.type,
        name: this.name,
      },
      parameters: this.parameters ?? {},
    }
  }

  isSame(type: string, name?: string): boolean {
    const externalId = name ? `${type}.${name}` : type;
    return externalId === this.id;
  }

  setName(name: string) {
    this.name = name;
    this.raw.name = name;
  }

  addDependenciesFromDependsOn(resourceExists: (id: string) => boolean) {
    for (const id of this.dependsOn) {
      if (!resourceExists(id)) {
        throw new Error(`Reference ${id} is not a valid resource`);
      }

      this.dependencyIds.push(id);
    }
  }

  addDependenciesBasedOnParameters(resourceExists: (id: string) => boolean) {
    // TODO: Only string dependencies are supported currently
    const parametersWithDependencies = Object.entries(this.parameters)
      .filter(([, v]) => typeof v === 'string')
      .filter(([, v]) => REFERENCE_REGEX.test(v as string));

    for (const [, value] of parametersWithDependencies) {
      const matchResult = [...(value as string).matchAll(REFERENCE_REGEX)];

      if (!matchResult) {
        throw new Error('Internal Error: expect dependency match result to not be null');
      }

      const ids = matchResult.map(([, capturedStr]) => capturedStr)

      // Validate that each id exists
      for (const id of ids) {
        if (!resourceExists(id)) {
          throw new Error(`Reference ${id} is not a valid resource`)
        }
      }

      this.dependencyIds.push(...ids);
    }
  }

  addDependencies(dependencies: string[]) {
    this.dependencyIds.push(...dependencies);
  }
}
