import chalk from 'chalk';

import { BaseCommand } from '../common/base-command.js';
import { LoginOrchestrator } from '../orchestrators/login.js';
import { LoginHelper } from '../connect/login-helper.js';

export default class Login extends BaseCommand {
  static description =
    `Logout of codify cloud account
    
For more information, visit: https://docs.codifycli.com/commands/logout
`

  static flags = {}

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --path=../../import.codify.jsonc',
  ]

  public async run(): Promise<void> {
    await LoginHelper.logout();
    console.log(chalk.green('\nSuccessfully logged out.'))

    process.exit(0);
  }
}
