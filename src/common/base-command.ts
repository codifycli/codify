import { Command, Flags } from '@oclif/core';
import { FlagOutput } from '@oclif/core/lib/interfaces/parser.js';
import chalk from 'chalk';
import { SudoRequestData } from 'codify-schemas';
import createDebug from 'debug';

import { ctx, Event } from '../events/context.js';
import { Reporter, ReporterFactory, ReporterType } from '../ui/reporters/reporter.js';

export abstract class BaseCommand extends Command {

  static enableJsonFlag = true;
  static baseFlags = {
    'debug': Flags.boolean(),
    'output': Flags.option({
      char: 'o',
      default: 'default',
      options: ['plain', 'default', 'debug', 'json'],
    })(),
    'secure': Flags.boolean({
      char: 's',
      default: false,
    })
  }

  protected reporter!: Reporter;

  public async init(): Promise<void> {
    await super.init();

    const { flags } = await this.parse({
      baseFlags: (super.ctor as typeof BaseCommand).baseFlags,
      strict: false,
    });

    const reporterType = this.getReporterType(flags);
    this.reporter = ReporterFactory.create(reporterType)

    ctx.on(Event.SUDO_REQUEST, async (pluginName: string, data: SudoRequestData) => {
      const result = await this.reporter.promptSudo(pluginName, data, flags.secure);
      ctx.sudoRequestGranted(pluginName, result);
    });
  }

  protected async catch(err: Error): Promise<void> {
    console.log(chalk.red(err.message));
    process.exit(1);
  }

  private getReporterType(flags: FlagOutput): ReporterType {
    const debug = createDebug('codify');

    if (debug.enabled || flags.debug) {
      createDebug.enable('*');
      return ReporterType.DEBUG;
    }

    if (this.jsonEnabled()) {
      return ReporterType.JSON;
    }

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
