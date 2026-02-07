import { ErrorObject } from 'ajv';
import chalk from 'chalk';

import { ResourceConfig } from '../entities/resource-config.js';
import { SourceMapCache } from '../codify-files/parser/source-maps.js';
import { formatAjvErrors } from '../utils/ajv.js';
import { RemoveErrorMethods } from './types.js';

export abstract class CodifyError extends Error {
  abstract formattedMessage(): string
}

export class InternalError extends CodifyError {
  name = 'InternalError'

  formattedMessage(): string {
    return `Internal error: ${this.message}`;
  }
}

export class AjvValidationError extends CodifyError {
  validationErrors: ErrorObject[];
  sourceMapKey?: string;
  sourceMaps?: SourceMapCache;
  
  constructor(
    message: string,
    validationErrors: ErrorObject[],
    sourceMapKey?: string,
    sourceMaps?: SourceMapCache,
  ) {
    super(message);
    this.validationErrors = validationErrors;
    this.sourceMapKey = sourceMapKey;
    this.sourceMaps = sourceMaps;
  }

  formattedMessage(): string {
    let errorMessage = `Validation error: ${this.message}.\n\n`;
    errorMessage += formatAjvErrors(this.validationErrors, this.sourceMapKey, this.sourceMaps)
    return errorMessage;
  }
}

export type PluginValidationErrorParams = Array<{
  customErrorMessage?: string,
  resource: ResourceConfig,
  schemaErrors: ErrorObject[],
}>

export class PluginValidationError extends CodifyError {
  resourceErrors: PluginValidationErrorParams
  sourceMaps?: SourceMapCache

  constructor(
    params: PluginValidationErrorParams,
    sourceMaps?: SourceMapCache,
  ) {
    super('Validation error: the following parameters are not supported.\n\n');
    this.resourceErrors = params
    this.sourceMaps = sourceMaps;
  }

  formattedMessage(): string {
    let errorMessage = `${this.message}`;

    for (const resourceError of this.resourceErrors) {
      const { customErrorMessage, resource, schemaErrors } = resourceError;

      errorMessage += `Resource "${resource.id}" has invalid parameters.\n`
      errorMessage += formatAjvErrors(schemaErrors, resource.sourceMapKey, this.sourceMaps)

      if (customErrorMessage) {
        let childMessage = `${schemaErrors.length + 1}. ${customErrorMessage}\n`

        if (resource.sourceMapKey && this.sourceMaps) {
          childMessage += `${this.sourceMaps.getCodeSnippet(resource.sourceMapKey)}\n`;
        }

        errorMessage += childMessage.split(/\n/)
          .map((l) => `  ${l}`)
          .join('\n')
      }
    }

    return errorMessage;
  }
}

export class TypeNotFoundError extends CodifyError {
  invalidConfigs: ResourceConfig[];
  sourceMaps?: SourceMapCache;

  constructor(invalidConfigs: ResourceConfig[], sourceMaps?: SourceMapCache) {
    super('Validation error: invalid type found. Resource type was not found in any plugins.')

    this.invalidConfigs = invalidConfigs;
    this.sourceMaps = sourceMaps;
  }

  formattedMessage(): string {
    let errorMessage = `${this.message}\n\n`

    for (const invalidConfig of this.invalidConfigs) {
      if (!invalidConfig.sourceMapKey || !this.sourceMaps) {
        errorMessage += `type ${invalidConfig.type} is not valid.`
        continue;
      }

      const codeSnippet = this.sourceMaps?.getCodeSnippet(SourceMapCache.combineKeys(invalidConfig.sourceMapKey!, 'type'))
      errorMessage += `Type "${invalidConfig.type}" is not valid\n${codeSnippet}`
    }

    return errorMessage;
  }
}

export class OperatingSystemNotSupportedError extends CodifyError {
  invalidConfigs: ResourceConfig[];
  sourceMaps?: SourceMapCache;

  constructor(invalidConfigs: ResourceConfig[], sourceMaps?: SourceMapCache) {
    super('Validation error: invalid operating system found. Resource type is not supported on this operating system.')

    this.invalidConfigs = invalidConfigs;
    this.sourceMaps = sourceMaps;
  }

  formattedMessage(): string {
    let errorMessage = `${this.message}\n\n`

    for (const invalidConfig of this.invalidConfigs) {
      if (!invalidConfig.sourceMapKey || !this.sourceMaps) {
        errorMessage += `type ${invalidConfig.type} is not valid.`
        continue;
      }

      const codeSnippet = this.sourceMaps?.getCodeSnippet(SourceMapCache.combineKeys(invalidConfig.sourceMapKey!, 'type'))
      errorMessage += `Type "${invalidConfig.type}" is not valid\n${codeSnippet}`
    }

    return errorMessage;
  }
}

export class LinuxDistroNotSupportedError extends CodifyError {
  invalidConfigs: ResourceConfig[];
  sourceMaps?: SourceMapCache;

  constructor(invalidConfigs: ResourceConfig[], sourceMaps?: SourceMapCache) {
    super('Validation error: invalid Linux distribution found. Resource type is not supported on this Linux distribution.')

    this.invalidConfigs = invalidConfigs;
    this.sourceMaps = sourceMaps;
  }

  formattedMessage(): string {
    let errorMessage = `${this.message}\n\n`

    for (const invalidConfig of this.invalidConfigs) {
      if (!invalidConfig.sourceMapKey || !this.sourceMaps) {
        errorMessage += `type ${invalidConfig.type} is not valid.`
        continue;
      }

      const codeSnippet = this.sourceMaps?.getCodeSnippet(SourceMapCache.combineKeys(invalidConfig.sourceMapKey!, 'type'))
      errorMessage += `Type "${invalidConfig.type}" is not valid\n${codeSnippet}`
    }

    return errorMessage;
  }
}


export class InvalidResourceError extends Error {
  name = 'InvalidResourceError'

  message!: string;
  fileName!: string;
  resourceDefinition!: string;

  constructor(props: RemoveErrorMethods<InvalidResourceError>) {
    super(props.message)
    Object.assign(this, props);
  }
}

export class SyntaxError extends CodifyError {
  name = 'JsonFileParseError'
  fileName!: string;

  constructor(props: RemoveErrorMethods<SyntaxError>) {
    super(props.message)
    Object.assign(this, props);
  }

  formattedMessage(): string {
    return `Syntax error: found in ${this.fileName}: ${this.message}`
  }
}

export class UnauthorizedError extends CodifyError {
  name = 'UnauthorizedError'
  requestName?: string

  constructor(props: Omit<RemoveErrorMethods<UnauthorizedError>, 'message'>) {
    super(`Unauthorized request to Codify. ${props.requestName ?? ''}`)
    Object.assign(this, props);
  }

  formattedMessage(): string {
    return this.message
  }
}

export class SpawnError extends CodifyError {
  name = 'SpawnError'
  command: string;
  exitCode: number;
  data: string;

  constructor(command: string, exitCode: number, data: string) {
    super(`Command "${command}" failed with exit code ${exitCode}`)
    this.command = command;
    this.exitCode = exitCode;
    this.data = data;
  }

  formattedMessage(): string {
    return `Spawn error: ${this.message}\n\n${this.data}`
  }
}

export function prettyPrintError(error: unknown): void {
  if (error instanceof CodifyError) {
    return console.error(chalk.red(error.formattedMessage()));
  }

  if (error instanceof Error) {
    return console.error(chalk.red(error.message));
  }

  console.error(chalk.red(String(error)));
}
