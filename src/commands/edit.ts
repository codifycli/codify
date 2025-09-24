import { BaseCommand } from '../common/base-command.js';
import { ConnectOrchestrator } from '../orchestrators/connect.js';

export default class Edit extends BaseCommand {
  static description =
    `Edit a codify.jsonc/codify.json/codify.yaml file.
    
For more information, visit: https://docs.codifycli.com/commands/validate
`

  static flags = {}

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --path=../../import.codify.jsonc',
  ]

  public async run(): Promise<void> {
    const { flags } = await this.parse(Edit)

    // await ConnectOrchestrator.run();
  }
}
