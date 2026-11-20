import { Args, Flags } from '@oclif/core'
import chalk from 'chalk';

import { autoApproveAllFlag, isAutoApproveAll } from '../common/approval-flags.js';
import { BaseCommand } from '../common/base-command.js';
import { ApplyOrchestrator } from '../orchestrators/apply.js';
import { MissingParametersResolver } from '../common/resolve-missing-parameters.js';
import { parseTargets, targetFlags } from '../common/target-flags.js';
import { loadRunValues, varFlag } from '../common/variable-flags.js';

export default class Apply extends BaseCommand {
  // Any number of resource types can be passed
  static strict = false;
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

The config can be a local file or directory, a Codify dashboard document id, one or more
resource types, or a public template name. With no argument, the codify file in the current
directory is used. Arguments are read in this order: codify file, resource type, template.
Resource types and templates can't be combined. Use ${chalk.bold.bgMagenta(' --resource ')} or ${chalk.bold.bgMagenta(' --template ')} to skip the detection
(ex: when a template has the same name as a resource type).

For more information, visit: https://codifycli.com/docs/commands/apply
`

  static flags = {
    'var': varFlag,
    ...targetFlags,
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
    targets: Args.string({ description: 'A codify file or directory, a document id, resource types, or a template name' }),
  }

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> ./my-setup.codify.jsonc',
    '<%= config.bin %> <%= command.id %> nvm pyenv',
    '<%= config.bin %> <%= command.id %> @codifycli/js-essentials',
    '<%= config.bin %> <%= command.id %> --template <template name>',
    '<%= config.bin %> <%= command.id %> --path ~',
    '<%= config.bin %> <%= command.id %> -o json',
    '<%= config.bin %> <%= command.id %> -S <sudo password>',
    '<%= config.bin %> <%= command.id %> -yy',
  ]

  public async run(): Promise<void> {
    const { flags, raw } = await this.parse(Apply)

    const { targets, targetKind } = parseTargets(flags, raw);

    const outcome = await ApplyOrchestrator.run({
      path: flags.path,
      targets,
      targetKind,
      verbosityLevel: flags.debug || flags.verbose ? 3 : 0,
      autoApprove: flags.yes,
      autoApproveAll: isAutoApproveAll(flags, raw),
      allowSleep: flags['allow-sleep'],
      presetParameterValues: await MissingParametersResolver.loadPresetValues(),
      // Values of variables, and the document and approved secrets of runs started from the dashboard
      ...(await loadRunValues(flags)),
      // secure: flags.secure,
    }, this.reporter);

    if (outcome.status === 'no-changes') {
      console.log('No changes necessary. Exiting');
    }

    process.exit(outcome.status === 'applied' && outcome.result.isPartialFailure() ? 1 : 0);
  }
}
