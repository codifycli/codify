import { Args, Flags } from '@oclif/core'
import * as path from 'node:path';

import { PlanOrchestrator } from '../../orchestrators/plan.js';
import { BaseCommand } from '../../common/base-command.js';

export default class Plan extends BaseCommand {
  static description = 'Generate a plan based on a codify.json file. This plan will list ' +
    'out the changes Codify will need to make in order to meet the desired config.'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  async init(): Promise<void> {
    return super.init();
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Plan)

    await PlanOrchestrator.run({
      path: flags.path,
      secureMode: flags.secure,
    }, this.reporter);

    process.exit(0);
  }
}
