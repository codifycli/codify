import { BaseCommand } from '../common/base-command.js';
import { UninstallOrchestrator } from '../orchestrators/uninstall.js';
import path from 'node:path';
import { ApplyOrchestrator } from '../orchestrators/apply.js';

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
    const planResult = await UninstallOrchestrator.getUninstallPlan(args, resolvedPath, flags.secure);

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

    await ApplyOrchestrator.run(planResult.plan);
    await this.reporter.displayApplyComplete([]);

    process.exit(0);
  }
}
