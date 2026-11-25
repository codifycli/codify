import { ConfigBlock, ConfigType } from '../entities/config.js';
import { NoticeConfig } from '../entities/notice-config.js';
import { ProjectConfig } from '../entities/project-config.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { TemplateConfig } from '../entities/template-config.js';
import { VariableConfig } from '../entities/variable-config.js';
import { ParsedConfig } from './entities.js';
import {
  Config,
  NoticeConfig as NoticeConfigType,
  NoticeSchema,
  ProjectConfig as ProjectConfigType,
  ProjectSchema,
  ResourceConfig as ResourceConfigType,
  ResourceSchema,
  TemplateConfig as TemplateConfigType,
  TemplateSchema,
  VariableConfig as VariableConfigType,
  VariableSchema,
} from '@codifycli/schemas';
import { ajv } from '../utils/ajv.js';
import { AjvValidationError } from '../common/errors.js';
import { SourceMapCache } from './source-maps.js';

const projectConfigValidator = ajv.compile(ProjectSchema);
const resourceConfigValidator = ajv.compile(ResourceSchema);
const templateConfigValidator = ajv.compile(TemplateSchema);
const variableConfigValidator = ajv.compile(VariableSchema);
const noticeConfigValidator = ajv.compile(NoticeSchema);

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

      case ConfigType.VARIABLE: {
        if (!this.validateVariableConfig(rawConfig)) {
          throw new AjvValidationError(
            'invalid variable config.',
            variableConfigValidator.errors!,
            parsedConfig.sourceMapKey,
            sourceMaps
          )
        }

        return new VariableConfig(rawConfig, parsedConfig.sourceMapKey);
      }

      case ConfigType.NOTICE: {
        if (!this.validateNoticeConfig(rawConfig)) {
          throw new AjvValidationError(
            'invalid notice config.',
            noticeConfigValidator.errors!,
            parsedConfig.sourceMapKey,
            sourceMaps
          )
        }

        return new NoticeConfig(rawConfig, parsedConfig.sourceMapKey);
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

  private validateVariableConfig(config: Config): config is VariableConfigType {
    return variableConfigValidator(config);
  }

  private validateNoticeConfig(config: Config): config is NoticeConfigType {
    return noticeConfigValidator(config);
  }

  private validateResourceConfig(config: Config): config is ResourceConfigType {
    return resourceConfigValidator(config);
  }
}

export const ConfigFactory = new Factory();
