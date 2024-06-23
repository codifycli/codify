import { ConfigBlock } from '../../../entities/config.js';
import { ProjectConfig } from '../../../entities/project-config.js';
import { ResourceConfig } from '../../../entities/resource-config.js';
import { ConfigType } from '../../language-definition.js';

export const JsonConfigBlockFactory = {
  create(
    config: ConfigBlock,
  ): ConfigBlock {
    switch (config.type) {
      case ConfigType.PROJECT: {
        return new ProjectConfig(config);
      }

      default: {
        return new ResourceConfig(config);
      }
    }
  },

};
