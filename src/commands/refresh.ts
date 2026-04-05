import fs from 'node:fs/promises';

import { BaseCommand } from '../common/base-command.js';
import { Shell, ShellUtils } from '../utils/shell.js';
import { RefreshOrchestrator } from '../orchestrators/refresh.js';

export default class Refresh extends BaseCommand {
  static strict = false;
  static override description =
`Refreshes existing Codify configurations to have the latest changes on the system. 

Use a space-separated list of arguments to specify specific resource types to refresh. 
Leave empty to refresh all resources.

Codify will attempt to smartly insert new configurations while preserving existing spacing and formatting.

For more information, visit: https://codifycli.com/docs/commands/refresh`

  static override examples = [
    '<%= config.bin %> <%= command.id %> homebrew nvm asdf',
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> git-clone --path ../my/other/folder',
    '<%= config.bin %> <%= command.id %> \\*'
  ]

  public async run(): Promise<void> {
    const { raw, flags } = await this.parse(Refresh)

    if (flags.path) {
      this.log(`Applying Codify from: ${flags.path}`);
    }

    const resolvedPath = flags.path ?? '.';

    const args = raw
      .filter((r) => r.type === 'arg')
      .map((r) => r.input);

    const cleanedArgs = await this.cleanupZshStarExpansion(args);

    await RefreshOrchestrator.run({
      verbosityLevel: flags.debug ? 3 : 0,
      typeIds: cleanedArgs,
      path: resolvedPath,
      secureMode: flags.secure,
    }, this.reporter)

    process.exit(0)
  }

  private async cleanupZshStarExpansion(args: string[]): Promise<string[]> {
    const combinedArgs = args.join(' ');
    const zshStarExpansion = (ShellUtils.getShell() === Shell.ZSH)
      ? (await fs.readdir(process.cwd())).filter((name) => !name.startsWith('.')).join(' ')
      : ''

    return combinedArgs
      .replaceAll(zshStarExpansion, '*')
      .split(' ')
  }
}
