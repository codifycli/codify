import { BaseCommand } from '../common/base-command.js';
import { UninstallOrchestrator } from '../orchestrators/uninstall.js';

export default class Uninstall extends BaseCommand {
  static description = 'describe the command here'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static strict = false;

  public async run(): Promise<void> {
    const { flags, raw } = await this.parse(Uninstall)

    const args = raw
      .filter((r) => r.type === 'arg')
      .map((r) => r.input);

    if (args.length === 0) {
      throw new Error('A resource id must be specified for uninstall. Ex: "codify uninstall homebrew"')
    }

    await UninstallOrchestrator.run(args, flags.secure);

    process.exit(0);
  }
}
