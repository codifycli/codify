import {
  Config,
  ProjectConfig as ProjectConfigType,
  ProjectSchema,
  ResourceConfig as ResourceConfigType,
  ResourceSchema
} from 'codify-schemas';

import { AjvValidationError } from '../../common/errors.js';
import { ConfigBlock, ConfigType } from '../../entities/config.js';
import { ProjectConfig } from '../../entities/project-config.js';
import { ResourceConfig } from '../../entities/resource-config.js';
import { ajv } from '../../utils/ajv.js';
import { ParsedConfig } from './entities.js';
import { SourceMapCache } from './source-maps.js';

const projectConfigValidator = ajv.compile(ProjectSchema);
const resourceConfigValidator = ajv.compile(ResourceSchema);

class Factory {
  create(
    parsedConfig: ParsedConfig,
    sourceMaps: SourceMapCache
  ): ConfigBlock {
    const rawConfig = parsedConfig.contents;
    const { type } = parsedConfig.contents;

    switch (type) {
      case ConfigType.PROJECT: {
        if (!this.validateProjectConfig(rawConfig)) {
          throw new AjvValidationError(
            'invalid project config.',
            projectConfigValidator.errors!,
            parsedConfig.sourceMapKey,
            sourceMaps
          )
        }

        return new ProjectConfig(rawConfig);
      }

      default: {
        if (!this.validateResourceConfig(rawConfig)) {
          throw new AjvValidationError(
            `invalid resource config for "${rawConfig.type}" resource`,
            resourceConfigValidator.errors!,
            parsedConfig.sourceMapKey,
            sourceMaps
          )
        }

        return new ResourceConfig(parsedConfig.contents, parsedConfig.sourceMapKey);
      }
    }
  };

  private validateProjectConfig(config: Config): config is ProjectConfigType {
    return projectConfigValidator(config);
  }

  private validateResourceConfig(config: Config): config is ResourceConfigType {
    return resourceConfigValidator(config);
  }
}

export const ConfigFactory = new Factory();
