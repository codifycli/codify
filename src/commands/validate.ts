import { BaseCommand } from '../common/base-command.js';
import { ValidateOrchestrator } from '../orchestrators/validate.js';
import { CodifyParser } from '../parser/index.js';

export default class Validate extends BaseCommand {
  static description =
    `Validate a codify.jsonc/codify.json/codify.yaml file.
    
For more information, visit: https://docs.codifycli.com/commands/validate
`

  static flags = {}

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --path=../../import.codify.jsonc',
  ]

  async init(): Promise<void> {
    console.log('Running Codify validate...')
    return super.init();
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Validate)

    await ValidateOrchestrator.run({
      path: flags.path,
    }, this.reporter)

    await CodifyParser.parse(flags.path);

    process.exit(0);
  }
}
