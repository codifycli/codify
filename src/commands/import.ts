import fs from 'node:fs/promises';
import path from 'node:path';

import { BaseCommand } from '../common/base-command.js';
import { ImportOrchestrator } from '../orchestrators/import.js';
import { ShellUtils } from '../utils/shell.js';

export default class Import extends BaseCommand {
  static strict = false;
  static override description =
`Generate codify configs from already installed packages. Use a list of space separated arguments to specify the resource types to import. Leave blank to import all resource in an existing *.codify.json file.

Modes:
1. No args: if no args are specified and an *.codify.json already exists. Then codify will update the existing file with any new changes to the resources specified in the file/files.

Command: codify import

2. With args: specify specific resources to import using arguments. Wild card matching is supported using '*' and ? (Note: in zsh * expands to the current dir and needs to be escaped using \\* or '*'). A prompt will be shown if more information is required to complete the import.

Example: codify import nvm asdf\\*, codify import \\* (for importing all supported resources)

The results can then be saved:
  a. To an existing *.codify.json file
  b. To a new file
  c. Or only printed to console
  
Codify will try to smartly insert new configs by following existing spacing and formatting.
`

  static override examples = [
    '<%= config.bin %> <%= command.id %> homebrew nvm asdf\\*',
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> git-clone --path ../my/other/folder',
    '<%= config.bin %> <%= command.id %> \\*'
  ]

  public async run(): Promise<void> {
    const { raw, flags } = await this.parse(Import)

    if (flags.path) {
      this.log(`Applying Codify from: ${flags.path}`);
    }

    const resolvedPath = path.resolve(flags.path ?? '.');

    const args = raw
      .filter((r) => r.type === 'arg')
      .map((r) => r.input);

    const cleanedArgs = await this.cleanupZshStarExpansion(args);

    await ImportOrchestrator.run({
      typeIds: cleanedArgs,
      path: resolvedPath,
      secureMode: flags.secure,
    }, this.reporter)

    process.exit(0)
  }

  private async cleanupZshStarExpansion(args: string[]): Promise<string[]> {
    const combinedArgs = args.join(' ');
    const zshStarExpansion = (await ShellUtils.isZshShell())
      ? (await fs.readdir(process.cwd())).filter((name) => !name.startsWith('.')).join(' ')
      : ''

    return combinedArgs
      .replaceAll(zshStarExpansion, '*')
      .split(' ')
  }
}
