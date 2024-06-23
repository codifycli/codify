import { ErrorObject } from 'ajv';
import chalk from 'chalk';

import { RemoveErrorMethods } from './types.js';
import { SourceMap } from 'node:module';

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
  fileName?: string;
  contents?: string;
  
  constructor(
    message: string,
    validationError: ErrorObject[],
    contextInfo?: {
      fileName: string;
      contents: string;
    }
  ) {
    super(message);
    
    this.validationError = validationError;

    this.fileName = contextInfo?.fileName;
    this.contents = contextInfo?.contents;
  }

  formattedMessage(): string {
    if (!this.contents) {
      return `Validation error:

${this.validationError.map((e) => e.)}`
    }


    const sourceMap = new SourceMap()
    let errorMessage = '';
    const sourceMap = jsonSourceMap.stringify(subject, null, 2);
    const jsonLines = sourceMap.json.split('\n');
    validator.errors.forEach(error => {
      errorMessage += '\n\n' + validator.errorsText([ error ]);
      let errorPointer = sourceMap.pointers[error.dataPath];
      errorMessage += '\n> ' + jsonLines.slice(errorPointer.value.line, errorPointer.valueEnd.line).join('\n> ');
    });
    throw new Error(errorMessage);

    return `Validation error ${this.co}`
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
