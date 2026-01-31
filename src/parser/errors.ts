export class MultipleFilesError extends Error {
  files: string[]

  constructor(files: string[]) {
    super(`Multiple matching Codify files found:\n${files.join('\n')}`);
    this.files = files;
  }
}
