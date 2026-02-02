import { Args } from '@oclif/core';

import { CodifyParser } from '../codify-files/parser/index.js';
import { BaseCommand } from '../common/base-command.js';
import { ValidateOrchestrator } from '../orchestrators/validate.js';
import Apply from './apply.js';

export default class Validate extends BaseCommand {
  static description =
    `Validate a codify.jsonc/codify.json/codify.yaml file.
    
For more information, visit: https://docs.codifycli.com/commands/validate
`

  static flags = {}

  static args = {
    pathArgs: Args.string(),
  }

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --path=../../import.codify.jsonc',
  ]

  async init(): Promise<void> {
    console.log('Running Codify validate...')
    return super.init();
  }

  public async run(): Promise<void> {
    const { flags, args } = await this.parse(Apply)

    if (flags.path && args.pathArgs) {
      throw new Error('Cannot specify both --path and path argument');
    }

    await ValidateOrchestrator.run({
      path: flags.path ?? args.pathArgs,
    }, this.reporter)

    await CodifyParser.parse(flags.path ?? args.pathArgs ?? '.');

    process.exit(0);
  }
}
