import { Flags } from '@oclif/core';
import path from 'node:path';
import readline from 'node:readline';

import { BaseCommand } from '../common/base-command.js';
import { ImportOrchestrator } from '../orchestrators/import.js';


const rl = readline.createInterface(process.stdin, process.stdout);

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

    if (args.length === 0) {
      throw new Error('At least one resource <type> must be specified. Ex: "codify import homebrew"')
    }

    const { project, pluginManager } = await ImportOrchestrator.initializeAndValidate(args, resolvedPath, flags.secure)
    const requiredParameters = await ImportOrchestrator.getRequiredParameters(args, pluginManager);

    if (requiredParameters.size > 0 || [...requiredParameters.values()].reduce(
      (total, arr) => arr.length + total, 0
    )) {
      console.log('Some required information is needed for the import');
    }

    const parameterInput = new Map<string, Record<string, unknown>>();

    for (const [type, requiredProperties] of requiredParameters.entries()) {
      if (requiredProperties.length > 0) {
        console.log(`Resourcee: "${type}" requires additional information:`)
      }

      for (const property of requiredProperties) {
        const response = await new Promise((resolve) => {
          rl.question(`${property.propertyName} [${property.propertyType}]: `, (answer) => resolve(answer));
        });

        if (!parameterInput.has(type)) {
          parameterInput.set(type, {});
        }

        parameterInput.get(type)![property.propertyName] = response;
      }
    }

    console.log(parameterInput);

  }
}
