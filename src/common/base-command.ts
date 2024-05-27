import { Command, Flags } from '@oclif/core';
import { Reporter, ReporterFactory, ReporterType } from '../ui/reporters/reporter.js';
import { FlagOutput } from '@oclif/core/lib/interfaces/parser.js';
import createDebug from 'debug';
import chalk from 'chalk';

export abstract class BaseCommand extends Command {

  static enableJsonFlag = true;
  static baseFlags = {
    'output': Flags.option({
      default: 'default',
      char: 'o',
      options: ['plain', 'default', 'debug', 'json'],
    })(),
    'debug': Flags.boolean()
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
        case 'debug':
          return ReporterType.DEBUG;
        case 'json':
          return ReporterType.JSON;
        case 'plain':
          return ReporterType.PLAIN;
        case 'default':
          return ReporterType.DEFAULT;
      }
    }

    return ReporterType.DEFAULT;
  }
}
