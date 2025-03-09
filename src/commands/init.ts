import fs from 'node:fs/promises';

import { BaseCommand } from '../common/base-command.js';
import { InitializeOrchestrator } from '../orchestrators/init.js';
import { ShellUtils } from '../utils/shell.js';

export default class Init extends BaseCommand {
  static strict = false;
  static override description =
`Initialize codify.`

  static baseFlags= {
    ...BaseCommand.baseFlags,
    path: { hidden: true },
  }

  static override examples = [
    '<%= config.bin %> <%= command.id %> homebrew nvm asdf\\*',
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> git-clone --path ../my/other/folder',
    '<%= config.bin %> <%= command.id %> \\*'
  ]

  public async run(): Promise<void> {
    await InitializeOrchestrator.run(this.reporter);
  }
}
