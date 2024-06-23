import { ErrorObject } from 'ajv';
import chalk from 'chalk';

import { RemoveErrorMethods } from './types.js';
import { SourceMapCache } from '../parser/source-maps.js';
import { ResourceConfig } from '../entities/resource-config.js';

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
  validationError: ErrorObject[];
  sourceMapKey?: string;
  sourceMaps?: SourceMapCache;
  
  constructor(
    message: string,
    validationError: ErrorObject[],
    sourceMapKey?: string,
    sourceMaps?: SourceMapCache,
  ) {
    super(message);
    this.validationError = validationError;
    this.sourceMapKey = sourceMapKey;
    this.sourceMaps = sourceMaps;
  }

  formattedMessage(): string {
    let errorMessage = `Validation error: ${this.message}.`;

    if (!this.sourceMapKey || !this.sourceMaps || !this.sourceMaps.has(this.sourceMapKey)) {
      errorMessage += `\n\n${this.validationError
        .map((e, idx) => ` ${idx + 1}. ${e.message}`)
        .join('\n')}`;
      return errorMessage;
    }

    for (const error of this.validationError) {
      const codeSnippet = this.sourceMaps.getCodeSnippet(SourceMapCache.combineKeys(this.sourceMapKey, error.instancePath));
      errorMessage += `\n\n"${error.instancePath}" ${error.message}
${codeSnippet}`
    }

    return errorMessage;
  }
}

export class TypeNotFoundError extends CodifyError {
  invalidConfigs: ResourceConfig[];
  sourceMaps?: SourceMapCache;

  constructor(invalidConfigs: ResourceConfig[], sourceMaps?: SourceMapCache) {
    super(`Validation error: invalid type found. Resource type was not found in any plugins.`)

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
    return `Syntax error in codify.json: ${this.message}`
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
