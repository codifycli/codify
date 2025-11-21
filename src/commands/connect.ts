import { BaseCommand } from '../common/base-command.js';
import { ConnectOrchestrator } from '../orchestrators/connect.js';

export default class Connect extends BaseCommand {
  static description =
    `Validate a codify.jsonc/codify.json/codify.yaml file.
    
For more information, visit: https://docs.codifycli.com/commands/validate
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
