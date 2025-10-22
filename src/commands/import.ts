import { Flags } from '@oclif/core';
import chalk from 'chalk';
import fs from 'node:fs/promises';

import { BaseCommand } from '../common/base-command.js';
import { ImportOrchestrator } from '../orchestrators/import.js';
import { ShellUtils } from '../utils/shell.js';

export default class Import extends BaseCommand {
  static strict = false;
  static override description =
`Generate Codify configurations from already installed packages. 

Use a space-separated list of arguments to specify the resource types to import. 
If a codify.jsonc file already exists, omit arguments to update the file to match the system.

${chalk.bold('Modes:')}
1. ${chalk.bold('No args:')} If no args are specified and an *.codify.jsonc already exists, Codify 
will update the existing file with new changes on the system.

${chalk.underline('Command:')}
codify import

2. ${chalk.bold('With args:')} Specify specific resources to import using arguments. Wild card matching is supported 
using '*' and '?' (${chalk.italic('Note: in zsh * expands to the current dir and needs to be escaped using \\* or \'*\'')}). 
A prompt will be shown if more information is required to complete the import.

${chalk.underline('Examples:')} 
codify import nvm asdf*
codify import \\* (for importing all supported resources)

The results can be saved in one of three ways:
  a. To an existing *.codify.jsonc file
  b. To a new file
  c. Printed to the console only
  
Codify will attempt to smartly insert new configurations while preserving existing spacing and formatting.

For more information, visit: https://docs.codifycli.com/commands/import`

  static override examples = [
    '<%= config.bin %> <%= command.id %> homebrew nvm asdf',
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> git-clone --path ../my/other/folder',
    '<%= config.bin %> <%= command.id %> \\*'
  ]

  static override flags = {
    'updateExisting': Flags.boolean({
      description: 'Force the CLI to try to update an existing file instead of prompting the user with the option of creating a new file',
    }),
  }

  public async run(): Promise<void> {
    const { raw, flags } = await this.parse(Import)

    if (flags.path) {
      this.log(`Applying Codify from: ${flags.path}`);
    }

    const resolvedPath = flags.path ?? '.';

    const args = raw
      .filter((r) => r.type === 'arg')
      .map((r) => r.input);

    const cleanedArgs = await this.cleanupZshStarExpansion(args);

    await ImportOrchestrator.run({
      verbosityLevel: flags.debug ? 3 : 0,
      typeIds: cleanedArgs,
      path: resolvedPath,
      secureMode: flags.secure,
      updateExisting: flags.updateExisting,
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
