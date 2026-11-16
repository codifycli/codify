import { ConfigBlock, ConfigType } from '../entities/config.js';
import { ProjectConfig } from '../entities/project-config.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { TemplateConfig } from '../entities/template-config.js';
import { ParsedConfig } from './entities.js';
import {
  Config,
  ProjectConfig as ProjectConfigType,
  ProjectSchema,
  ResourceConfig as ResourceConfigType,
  ResourceSchema,
  TemplateConfig as TemplateConfigType,
  TemplateSchema,
} from '@codifycli/schemas';
import { ajv } from '../utils/ajv.js';
import { AjvValidationError } from '../common/errors.js';
import { SourceMapCache } from './source-maps.js';

const projectConfigValidator = ajv.compile(ProjectSchema);
const resourceConfigValidator = ajv.compile(ResourceSchema);
const templateConfigValidator = ajv.compile(TemplateSchema);

class Factory {
  create(
    parsedConfig: ParsedConfig,
    sourceMaps: SourceMapCache
  ): ConfigBlock {
    const rawConfig = parsedConfig.contents;
    const type = parsedConfig.contents.type;

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

      case ConfigType.TEMPLATE: {
        if (!this.validateTemplateConfig(rawConfig)) {
          throw new AjvValidationError(
            'invalid template config.',
            templateConfigValidator.errors!,
            parsedConfig.sourceMapKey,
            sourceMaps
          )
        }

        return new TemplateConfig(rawConfig, parsedConfig.sourceMapKey);
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

  private validateTemplateConfig(config: Config): config is TemplateConfigType {
    return templateConfigValidator(config);
  }

  private validateResourceConfig(config: Config): config is ResourceConfigType {
    return resourceConfigValidator(config);
  }
}

export const ConfigFactory = new Factory();
