import { Args } from '@oclif/core'

import { UninstallOrchestrator } from '../orchestrators/uninstall.js';
import { BaseCommand } from '../common/base-command.js';

export default class Uninstall extends BaseCommand {
  static description = 'describe the command here'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {}

  static strict = false;

  static args = {
    resources: Args.string({
      description: 'A resource typeId for uninstalling. Ex: "codify uninstall homebrew"',
      required: true,
    }),
  }

  public async run(): Promise<void> {
    const { raw } = await this.parse(Uninstall)

    const args = raw
      .filter((r) => r.type === 'arg')
      .map((r) => r.input);

    if (args.length === 0) {
      throw new Error('A resource id must be specified for uninstall. Ex: "codify uninstall homebrew"')
    }

    await UninstallOrchestrator.run(args);

    process.exit(0);
  }
}
