import chalk from 'chalk';

import { BaseCommand } from '../common/base-command.js';
import { LoginOrchestrator } from '../orchestrators/login.js';

export default class Login extends BaseCommand {
  static description =
    `Logins to Codify cloud account
    
For more information, visit: https://docs.codifycli.com/commands/login
`

  static flags = {}

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --path=../../import.codify.jsonc',
  ]

  public async run(): Promise<void> {
    const { flags } = await this.parse(Login)

    await LoginOrchestrator.run();
    console.log(chalk.green('\nSuccessfully logged in!'))

    process.exit(0);
  }
}
