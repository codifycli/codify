import { Args, Command, Flags } from '@oclif/core'
import path from 'node:path';

import { ApplyOrchestrator } from './orchestrator.js';

export default class Apply extends Command {
  static args = {
    file: Args.string({ description: 'file to read' }),
  }

  static description = 'describe the command here'

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    // flag with no value (-f, --force)
    force: Flags.boolean({ char: 'f' }),
    // flag with a value (-n, --name=VALUE)
    name: Flags.string({ char: 'n', description: 'name to print' }),
    // flag with a value (-p, --path=VALUE)
    path: Flags.string({ char: 'p', description: 'path to project' }),
  }

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(Apply)

    const name = flags.name ?? 'world'
    this.log(`hello ${name} from /Users/kevinwang/Projects/codify/codify-core/src/commands/apply.ts`)
    if (args.file && flags.force) {
      this.log(`you input --force and --file: ${args.file}`)
    }

    if (flags.path) {
      this.log(`Applying Codify from: ${flags.path}`);
    }

    const resolvedPath = path.resolve(flags.path ?? '.');
    await ApplyOrchestrator.run(resolvedPath);
  }
}
