import { Args, Flags } from '@oclif/core'
import chalk from 'chalk';

import { autoApproveAllFlag, isAutoApproveAll } from '../common/approval-flags.js';
import { BaseCommand } from '../common/base-command.js';
import { ApplyOrchestrator } from '../orchestrators/apply.js';
import { MissingParametersResolver } from '../common/resolve-missing-parameters.js';
import { loadVariableValues, varFlag } from '../common/variable-flags.js';

export default class Apply extends BaseCommand {
  static description =
`Install or update resources on the system based on a codify.jsonc file.

Codify first generates a plan to determine the necessary execution steps. See
${chalk.bold.bgMagenta(' codify plan --help ')} for more details.
The execution plan will be presented and approval will be asked before Codify applies
any changes.

For scripts: use ${chalk.bold.bgMagenta(' --output json ')} which will skip approval and 
apply changes directly.

Commands (actions) that come from templates always have to be approved, even with -y.
Use ${chalk.bold.bgMagenta(' -yy ')} or ${chalk.bold.bgMagenta(' --auto-approve-all ')} to approve them as well.

The config can be a local file or directory, a public template name, or a Codify
dashboard document id. With no argument, the codify file in the current directory is used.

For more information, visit: https://codifycli.com/docs/commands/apply
`

  static flags = {
    'var': varFlag,
    'sudoPassword': Flags.string({
      optional: true,
      description: 'Automatically use this password for any handlers that require elevated permissions.',
      char: 'S'
    }),
    'yes': Flags.boolean({
      description: 'Automatically approve the apply without prompting for confirmation.',
      char: 'y',
      default: false,
    }),
    'auto-approve-all': autoApproveAllFlag,
    'verbose': Flags.boolean({
      char: 'v',
      description: 'Print plugin output (stdout/stderr) to the terminal.',
    }),
    'allow-sleep': Flags.boolean({
      description: 'Allow the system to sleep during apply operations.',
      default: false,
    }),
  }

  static args = {
    pathArgs: Args.string({ description: 'Path to a codify file or directory, a template name, or a document id' }),
  }

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> ./my-setup.codify.jsonc',
    '<%= config.bin %> <%= command.id %> <template name>',
    '<%= config.bin %> <%= command.id %> --path ~',
    '<%= config.bin %> <%= command.id %> -o json',
    '<%= config.bin %> <%= command.id %> -S <sudo password>',
    '<%= config.bin %> <%= command.id %> -yy',
  ]

  public async run(): Promise<void> {
    const { flags, args, raw } = await this.parse(Apply)

    if (flags.path && args.pathArgs) {
      throw new Error('Cannot specify both --path and path argument');
    }

    const outcome = await ApplyOrchestrator.run({
      path: flags.path ?? args.pathArgs,
      verbosityLevel: flags.debug || flags.verbose ? 3 : 0,
      autoApprove: flags.yes,
      autoApproveAll: isAutoApproveAll(flags, raw),
      allowSleep: flags['allow-sleep'],
      presetParameterValues: await MissingParametersResolver.loadPresetValues(),
      variableValues: await loadVariableValues(flags),
      // secure: flags.secure,
    }, this.reporter);

    if (outcome.status === 'no-changes') {
      console.log('No changes necessary. Exiting');
    }

    process.exit(outcome.status === 'applied' && outcome.result.isPartialFailure() ? 1 : 0);
  }
}
