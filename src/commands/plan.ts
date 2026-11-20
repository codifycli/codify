import chalk from 'chalk';
import { BaseCommand } from '../common/base-command.js';
import { PlanOrchestrator } from '../orchestrators/plan.js';
import { Args } from '@oclif/core';
import { MissingParametersResolver } from '../common/resolve-missing-parameters.js';

import { autoApproveAllFlag } from '../common/approval-flags.js';
import { parseTargets, targetFlags } from '../common/target-flags.js';
import { loadRunValues, varFlag } from '../common/variable-flags.js';

export default class Plan extends BaseCommand {
  // Any number of resource types can be passed
  static strict = false;
  static description =
`Generate an execution plan to apply changes from a codify.jsonc file.
 
This plan lists all the changes Codify needs to make to apply the codify.jsonc file.
The plan will not be executed. Behind the scenes, Codify performs a refresh scan to 
determine the current configuration and installed resources, then compares them with 
the desired configuration to compute the execution plan.

The config can be a local file or directory, a Codify dashboard document id, one or more
resource types, or a public template name. Arguments are read in this order: codify file,
resource type, template. Resource types and templates can't be combined. Use
${chalk.bold.bgMagenta(' --resource ')} or ${chalk.bold.bgMagenta(' --template ')} to skip the detection.

For scripts: use ${chalk.bold.bgMagenta(' --output json ')} which will skip all prompts and print
 only the final result as a json.

For more information, visit: https://codifycli.com/docs/commands/plan`

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> -o json',
    '<%= config.bin %> <%= command.id %> -p ../',
    '<%= config.bin %> <%= command.id %> nvm pyenv',
    '<%= config.bin %> <%= command.id %> <template name>',
    '<%= config.bin %> <%= command.id %> --template <template name>',
  ]

  static flags = {
    'var': varFlag,
    ...targetFlags,
    'auto-approve-all': autoApproveAllFlag,
  }

  static args = {
    targets: Args.string({ description: 'A codify file or directory, a document id, resource types, or a template name' }),
  }

  async init(): Promise<void> {
    return super.init();
  }

  public async run(): Promise<void> {
    const { flags, raw } = await this.parse(Plan)

    const { targets, targetKind } = parseTargets(flags, raw);

    await PlanOrchestrator.run({
      verbosityLevel: flags.debug ? 3 : 0,
      path: flags.path,
      targets,
      targetKind,
      // No --secure flag is declared on plan (kept as before)
      secureMode: (flags as { secure?: boolean }).secure,
      autoApproveTemplateCommands: flags['auto-approve-all'],
      presetParameterValues: await MissingParametersResolver.loadPresetValues(),
      // Values of variables, and the document and approved secrets of runs started from the dashboard
      ...(await loadRunValues(flags)),
    }, this.reporter);

    process.exit(0);
  }
}
