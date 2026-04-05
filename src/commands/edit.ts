import { BaseCommand } from '../common/base-command.js';
import { EditOrchestrator } from '../orchestrators/edit.js';

export default class Edit extends BaseCommand {
  static description =
    `Short cut for opening your default Codify file in the Codify dashboard.
    
For more information, visit: https://codifycli.com/docs/commands/edit
`

  static flags = {}

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --path=../../import.codify.jsonc',
  ]

  public async run(): Promise<void> {
    const { flags } = await this.parse(Edit);
    const rootCommand = this.config.options.root;

    await EditOrchestrator.run(rootCommand, this.reporter);

  }
}
