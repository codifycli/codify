import { Flags } from '@oclif/core'

import { BaseCommand } from '../../common/base-command.js';
import { ApplyOrchestrator } from '../../orchestrators/apply.js';

export default class Apply extends BaseCommand {
  static description = 'Apply a codify file onto the system. A plan of the changes is first generated and a list of changes will be shown before proceeding'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --path ~',
  ]

  static flags = {
    // flag with a value (-p, --path=VALUE)
    path: Flags.string({ char: 'p', description: 'path to project' }),
  }

  async init(): Promise<void> {
    console.log('Running Codify apply...')
    return super.init();
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Apply)

    await ApplyOrchestrator.run({
      path: flags.path,
      secure: flags.secure,
    }, this.reporter);

    process.exit(0);
  }
}
