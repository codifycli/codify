import { ConfigBlock } from '../../../entities/index.js';
import { ProjectConfig } from '../../../entities/project-config.js';
import { ResourceConfig } from '../../../entities/resource-config.js';
import { SyntaxError } from '../../../utils/errors.js';
import { ConfigClass } from '../../language-definition.js';

export const JsonConfigBlockFactory = {

  create(
    unknownNode: Record<string, unknown>,
    errorInfo: { fileName: string; lineNumber: string }
  ): ConfigBlock {
    if (!unknownNode.type || typeof unknownNode.type !== 'string') {
      throw new SyntaxError({
        ...errorInfo,
        message: 'No type declaration found. A type field is required for all objects',
      })
    }

    switch (unknownNode.type) {
      case ConfigClass.PROJECT: {
        return new ProjectConfig(unknownNode);
      }

      default: {
        return new ResourceConfig(unknownNode);
      }
    }
  },

};
