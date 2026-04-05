import { BaseCommand } from '../common/base-command.js';
import { ConnectOrchestrator } from '../orchestrators/connect.js';

export default class Connect extends BaseCommand {
  static description =
    `Open a connection to the Codify dashboard. This command will host a local server to receive commands (e.g. apply, destroy, etc.)
from the Codify dashboard.
    
For more information, visit: https://codifycli.com/docs/commands/connect
`

  static flags = {}

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --path=../../import.codify.jsonc',
  ]

  public async run(): Promise<void> {
    const { flags } = await this.parse(Connect)
    const rootCommand = this.config.options.root;

    await ConnectOrchestrator.run(rootCommand, this.reporter);
  }
}
