import { BaseCommand } from '../common/base-command.js';
import { UninstallOrchestrator } from '../orchestrators/uninstall.js';
import path from 'node:path';

export default class Uninstall extends BaseCommand {
  static description = 'Uninstall a given resource based on id.'

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

    if (flags.path) {
      this.log(`Applying Codify from: ${flags.path}`);
    }

    const resolvedPath = path.resolve(flags.path ?? '.');
    await UninstallOrchestrator.run(args, resolvedPath, flags.secure);

    process.exit(0);
  }
}
