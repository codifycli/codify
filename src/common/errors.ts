import { ErrorObject } from 'ajv';
import chalk from 'chalk';

import { RemoveErrorMethods } from './types.js';
import * as jsonSourceMap from 'json-source-map';

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
  contents?: Record<string, unknown>;
  
  constructor(
    message: string,
    validationError: ErrorObject[],
    contextInfo?: { fileName: string; contents: Record<string, unknown> }
  ) {
    super(message);
    this.validationError = validationError;
    this.fileName = contextInfo?.fileName;
    this.contents = contextInfo?.contents;
  }

  formattedMessage(): string {
    if (!this.contents) {
      return `Validation error:\n\n${this.validationError.map((e) => e.message).join('\n\n')}`
    }

    let errorMessage = '';
    const sourceMap = jsonSourceMap.stringify(this.contents, null, 2);
    const jsonLines = sourceMap.json.split("\n");
    this.validationError.forEach((error) => {
      errorMessage += "\n\n" + error.message;
      const errorPointer = sourceMap.pointers[error.instancePath];
      // errorMessage += '\n> ' + jsonLines.slice(errorPointer.value.line, errorPointer.valueEnd.line).join('\n> ');

      console.log(errorPointer.value);
      console.log(errorPointer.valueEnd)
      console.log(error.instancePath)
      console.log(JSON.stringify(error, null, 2));
      console.log(JSON.stringify(sourceMap, null, 2))

      errorMessage +=
        '\n' +
        jsonLines
          .slice(errorPointer.value.line, errorPointer.valueEnd.line + 1)
          .map((line, idx) => `  ${idx + errorPointer.value.line}| ${line}`)
          .join("\n");
    });

    return `Validation error: \n\n${errorMessage}`;
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
