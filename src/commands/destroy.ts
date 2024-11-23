import { BaseCommand } from '../common/base-command.js';
import { DestroyOrchestrator } from '../orchestrators/destroy.js';

export default class Destroy extends BaseCommand {
  static strict = false;
  static description = 'Destroy or uninstall a resource (or many resources).'
  static examples = [
    '<%= config.bin %> <%= command.id %> homebrew nvm',
  ]
  
  public async run(): Promise<void> {
    const { flags, raw } = await this.parse(Destroy)

    const args = raw
      .filter((r) => r.type === 'arg')
      .map((r) => r.input);

    if (args.length === 0) {
      throw new Error('At least one resource <type> must be specified. Ex: "codify destroy homebrew"')
    }

    if (flags.path) {
      this.log(`Applying Codify from: ${flags.path}`);
    }

    await DestroyOrchestrator.run({
      ids: args,
      path: flags.path,
      secureMode: flags.secure,
    }, this.reporter)

    process.exit(0);
  }
}
