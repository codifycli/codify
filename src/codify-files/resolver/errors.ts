import { ResolverResult } from './runners.js';

export class MultipleFilesError extends Error {
  result: ResolverResult

  constructor(result: ResolverResult) {
    super(`Multiple matching Codify files found:\n${result.files.join('\n')}`);
    this.result = result;
  }
}

export class NoCodifyFileError extends Error {
  result: ResolverResult
  
  constructor(result: ResolverResult) {
    super(`No Codify file found at ${result.location}`);
    this.result = result;
  }
}