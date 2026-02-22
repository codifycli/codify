import { ResourceJson, ResourceOs, ResourceConfig as SchemaResourceConfig } from 'codify-schemas';

import { deepEqual } from '../utils/index.js';
import { ConfigBlock, ConfigType } from './config.js';
import { ResourceInfo } from './resource-info.js';

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
  os?: ResourceOs[];
  sourceMapKey?: string;

  // Calculated
  dependencyIds: string[] = []; // id of other nodes
  parameters: Record<string, unknown>;

  resourceInfo?: ResourceInfo;

  constructor(config: SchemaResourceConfig, sourceMapKey?: string) {
    const { dependsOn, name, type, os, ...parameters } = config;

    this.raw = config;
    this.type = type;
    this.name = name;
    this.os = os;
    this.parameters = parameters ?? {};
    this.dependsOn = dependsOn ?? []
    this.sourceMapKey = sourceMapKey;
  }

  static fromJson(json: ResourceJson): ResourceConfig {
    return new ResourceConfig({
      ...json.core,
      ...json.parameters,
    })
  }

  get id() {
    return this.name ? `${this.type}.${this.name}` : this.type;
  }

  core(excludeName?: boolean): SchemaResourceConfig {
    return {
      type: this.type,
      ...(excludeName || !this.name ? {} : { name: this.name }),
      ...(this.dependsOn.length > 0 ? { dependsOn: this.dependsOn } : {}),
      ...(this.os && this.os?.length > 0 ? { os: this.os } : {})
    };
  }

  toJson(): ResourceJson {
    return {
      core: this.core(),
      parameters: this.parameters ?? {},
    }
  }

  isSame(type: string, name?: string): boolean {
    const externalId = name ? `${type}.${name}` : type;
    return externalId === this.id;
  }

  isDeepEqual(other?: ResourceConfig | null): boolean {
    if (!other) {
      return false;
    }

    return deepEqual(other.parameters, this.parameters)
      && deepEqual({ type: this.type, name: this.name }, { type: other.type, name: other.name });
  }

  setName(name: string) {
    this.name = name;
    this.raw.name = name;
  }

  setParameter(name: string, value: unknown) {
    this.parameters[name] = value;
    this.raw[name] = value;
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

  attachResourceInfo(resourceInfo: ResourceInfo) {
    if (resourceInfo.type !== this.type) {
      throw new Error(`Attempting to attach resource info (${resourceInfo.type}) on an un-related resource (${this.type})`)
    }

    this.resourceInfo = resourceInfo;
  }
}
