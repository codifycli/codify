import { RemoveErrorMethods } from './types.js';

export class InternalError extends Error {
  name = 'InternalError'
}


export class SyntaxError extends Error {
  name = 'ConfigFileSyntaxError'

  message!: string;
  fileName!: string;
  lineNumber!: string;

  constructor(props: RemoveErrorMethods<SyntaxError>) {
    super(props.message)
    Object.assign(this, props);
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

export class JsonFileParseError extends Error {
  name = 'JsonFileParseError'
  fileName!: string;

  constructor(props: RemoveErrorMethods<JsonFileParseError>) {
    super(props.message)
    Object.assign(this, props);
  }
}
