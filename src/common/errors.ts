import { ErrorObject } from 'ajv';
import chalk from 'chalk';

import { RemoveErrorMethods } from './types.js';
import * as jsonSourceMap from 'json-source-map';
import { SourceMapCache } from '../parser/source-maps.js';

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
    let errorMessage = `Validation error: ${this.message}`;

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

export class ResourceTypeMissingError extends CodifyError {
  name = 'ConfigFileSyntaxError'

  message!: string;
  fileName!: string;
  lineNumber!: string;

  constructor(props: RemoveErrorMethods<ResourceTypeMissingError>) {
    super(props.message)
    Object.assign(this, props);
  }

  formattedMessage(): string {
    return `Syntax error: line ${JSON.stringify(this.lineNumber, null, 2)}\n\n${this.message}`
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
