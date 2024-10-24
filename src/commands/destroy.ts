import path from 'node:path';

import { BaseCommand } from '../common/base-command.js';
import { ApplyOrchestrator } from '../orchestrators/apply.js';
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

    const resolvedPath = path.resolve(flags.path ?? '.');
    const planResult = await DestroyOrchestrator.getDestroyPlan(args, resolvedPath, flags.secure);

    this.reporter.displayPlan(planResult.plan);

    // Short circuit and exit if every change is NOOP
    if (planResult.plan.isEmpty()) {
      console.log('No changes necessary. Exiting');
      return process.exit(0);
    }

    const confirm = await this.reporter.promptApplyConfirmation()
    if (!confirm) {
      return process.exit(0);
    }

    await ApplyOrchestrator.run(planResult);
    await this.reporter.displayApplyComplete([]);

    process.exit(0);
  }
}
