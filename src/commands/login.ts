import { Flags } from '@oclif/core';
import chalk from 'chalk';

import { BaseCommand } from '../common/base-command.js';
import { LoginOrchestrator } from '../orchestrators/login.js';

export default class Login extends BaseCommand {
  static description =
    `Logins to Codify cloud account. 
    
By default opens a browser window to login. If username and password are provided, it will attempt to login via CLI.
    
For more information, visit: https://docs.codifycli.com/commands/login
`

  static baseFlags = {
    username: Flags.string({ char: 'u', description: 'Username to login with.' }),
    password: Flags.string({ char: 'p',  description: 'Password to login with.' }),
  }

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --username=user@example.com --password=secret',
    '<%= config.bin %> <%= command.id %> -p user@example.com -p secret',
  ]

  public async run(): Promise<void> {
    const { flags } = await this.parse(Login)

    await LoginOrchestrator.run({ username: flags.username, password: flags.password });
    console.log(chalk.green('\nSuccessfully logged in!'))

    process.exit(0);
  }
}
