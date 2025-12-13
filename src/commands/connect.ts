import { BaseCommand } from '../common/base-command.js';
import { ConnectOrchestrator } from '../orchestrators/connect.js';

export default class Connect extends BaseCommand {
  static description =
    `Open a connection to the Codify dashboard. This command will host a local server to receive commands (e.g. apply, destroy, etc.)
from the Codify dashboard.
    
For more information, visit: https://docs.codifycli.com/commands/connect
`

  static flags = {}

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --path=../../import.codify.jsonc',
  ]

  public async run(): Promise<void> {
    const { flags } = await this.parse(Connect)
    const config = this.config;

    await ConnectOrchestrator.run(config, this.reporter);
  }
}
