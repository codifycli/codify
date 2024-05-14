import { Args, Command } from '@oclif/core'
import { UninstallOrchestrator } from '../orchestrators/uninstall.js';
import { DefaultReporter } from '../ui/reporters/default-reporter.js';
import { ctx } from '../events/context.js';

export default class Uninstall extends Command {
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
    new DefaultReporter()

    const args = raw
      .filter((r) => r.type === 'arg')
      .map((r) => r.input);


    // const name = flags.name ?? 'world'
    // this.log(`hello ${name} from /Users/kevinwang/Projects/codify2/codify/src/commands/uninstall.ts`)
    if (args.length === 0) {
      throw new Error('A resource id must be specified for uninstall. Ex: "codify uninstall homebrew"')
    }

    try {
      await UninstallOrchestrator.run(args);
    } catch (error) {
      ctx.log(error);
      process.exit(1);
    }

    process.exit(0);
  }
}
