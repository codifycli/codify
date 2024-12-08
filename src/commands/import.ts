import { Flags } from '@oclif/core';
import path from 'node:path';

import { BaseCommand } from '../common/base-command.js';
import { ImportOrchestrator } from '../orchestrators/import.js';

export default class Import extends BaseCommand {
  static strict = false;
  static override description = 'Generate codify configs from existing installations'
  static override examples = [
    '<%= config.bin %> <%= command.id %> homebrew nvm',
  ]

  static flags = {
    // flag with a value (-p, --path=VALUE)
    path: Flags.string({ char: 'p', description: 'path to project' }),
  }


  public async run(): Promise<void> {
    const { raw, flags } = await this.parse(Import)

    if (flags.path) {
      this.log(`Applying Codify from: ${flags.path}`);
    }

    const resolvedPath = path.resolve(flags.path ?? '.');

    const args = raw
      .filter((r) => r.type === 'arg')
      .map((r) => r.input);

    await ImportOrchestrator.run({
      typeIds: args,
      path: resolvedPath,
      secureMode: flags.secure,
    }, this.reporter)

    process.exit(0)
  }
}
