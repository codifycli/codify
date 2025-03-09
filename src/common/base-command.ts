import { Command, Flags } from '@oclif/core';
import { OutputFlags } from '@oclif/core/interfaces';
import chalk from 'chalk';
import { SudoRequestData } from 'codify-schemas';
import createDebug from 'debug';

import { Event, ctx } from '../events/context.js';
import { Reporter, ReporterFactory, ReporterType } from '../ui/reporters/reporter.js';
import { SudoUtils } from '../utils/sudo.js';
import { prettyPrintError } from './errors.js';

export abstract class BaseCommand extends Command {
  static baseFlags = {
    'debug': Flags.boolean({
      description: 'Print additional debug logs.'
    }),
    'output': Flags.option({
      char: 'o',
      default: 'default',
      options: ['plain', 'default', 'json'],
      description: 'Control the output format.',
    })(),
    path: Flags.string({ char: 'p', description: 'Path to run Codify from.' }),
  }

  protected reporter!: Reporter;

  public async init(): Promise<void> {
    await super.init();

    const { flags } = await this.parse({
      flags: this.ctor.flags,
      baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
      strict: false,
    });

    const debug = createDebug('codify');
    if (debug.enabled || flags.debug) {
      createDebug.enable('*');
    }

    const reporterType = this.getReporterType(flags);
    this.reporter = ReporterFactory.create(reporterType)

    if (flags.secure) {
      console.log(chalk.blue('Running Codify in secure mode. Sudo will be prompted every time'));
    }

    ctx.on(Event.SUDO_REQUEST, async (pluginName: string, data: SudoRequestData) => {
      try {
        const password = (flags.sudoPassword) ?? (await this.reporter.promptSudo(pluginName, data, flags.secure));

        const result = await SudoUtils.runCommand(data.command, data.options, flags.secure, pluginName, password)
        ctx.sudoRequestGranted(pluginName, result);

        // This listener is outside of the base-command callstack. We have to manually catch the error.
      } catch (error) {
        this.catch(error as Error);
      }
    });
  }

  protected async catch(err: Error): Promise<void> {
    prettyPrintError(err);
    process.exit(1);
  }

  private getReporterType(flags: OutputFlags<any>): ReporterType {
    if (flags.output) {
      switch (flags.output) {
        case 'debug': {
          return ReporterType.DEBUG;
        }

        case 'json': {
          return ReporterType.JSON;
        }

        case 'plain': {
          return ReporterType.PLAIN;
        }

        case 'default': {
          return ReporterType.DEFAULT;
        }
      }
    }

    return ReporterType.DEFAULT;
  }
}
