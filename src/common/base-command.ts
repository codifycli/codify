import { Command, Flags } from '@oclif/core';
import { OutputFlags } from '@oclif/core/interfaces';
import chalk from 'chalk';
import { CommandRequestData, PressKeyToContinueRequestData } from '@codifycli/schemas';
import createDebug from 'debug';

import { LoginHelper } from '../connect/login-helper.js';
import { ctx, Event } from '../events/context.js';
import { LoginOrchestrator } from '../orchestrators/login.js';
import { DefaultReporter } from '../ui/reporters/default-reporter.js';
import { Reporter, ReporterFactory, ReporterType } from '../ui/reporters/reporter.js';
import { spawnSafe } from '../utils/spawn.js';
import { SudoUtils } from '../utils/sudo.js';
import { PluginError, prettyPrintError } from './errors.js';

export abstract class BaseCommand extends Command {
  static baseFlags = {
    'debug': Flags.boolean({
      description: 'Print additional debug logs.'
    }),
    'output': Flags.option({
      char: 'o',
      options: ['plain', 'default', 'json'],
      description: 'Control the output format. Default to default and plain for non-tty environments. Use json for scripts',
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

    const reporterType = this.getReporterType(flags)
    this.reporter = ReporterFactory.create(reporterType)

    let cachedSudoPassword: string | null = flags.sudoPassword ?? null;

    if (this.reporter instanceof DefaultReporter) {
      if (cachedSudoPassword !== null) {
        this.reporter.setSudoPasswordCached();
      }

      this.reporter.onSudoPasswordSubmitted(async (password: string) => {
        const isValid = await SudoUtils.validate(password);
        if (isValid) {
          cachedSudoPassword = password;
        }
        return isValid;
      });
    }

    if (flags.secure) {
      console.log(chalk.blue('Running Codify in secure mode. Sudo will be prompted every time'));
    }

    ctx.on(Event.COMMAND_REQUEST, async (pluginName: string, data: CommandRequestData) => {
      try {
        let password = undefined;
        if (data.options.requiresRoot || data.options.requiresSudoAskpass) {
          if (flags.secure || !cachedSudoPassword) {
            password = (await this.reporter.promptSudo(pluginName, data))
          } else {
            password = cachedSudoPassword
          }
        }

        if (data.options.stdin) {
          console.log(chalk.blue(`Plugin "${pluginName}" is requesting stdin`));
          await this.reporter.setRawMode();
        }

        const result = await spawnSafe(data.command, data.options, pluginName, password)
        ctx.commandRequestCompleted(pluginName, result);

        // This listener is outside of the base-command callstack. We have to manually catch the error.
      } catch (error) {
        this.catch(error as Error);
      } finally {
        // Always disable raw mode after
        if (data.options.stdin) {
          await this.reporter.disableRawMode();
        }
      }
    });

    ctx.on(Event.PRESS_KEY_TO_CONTINUE_REQUEST, async (pluginName: string, data: PressKeyToContinueRequestData) => {
      await this.reporter.promptPressKeyToContinue(data.promptMessage)
      ctx.pressKeyToContinueCompleted(pluginName)
    })

    ctx.on(Event.CODIFY_LOGIN_CREDENTIALS_REQUEST, async (pluginName: string) => {
      if (pluginName !== 'default') {
        throw new Error(`Only the default plugin can request Codify credentials. Instead received ${pluginName}`);
      }

      if (LoginHelper.get()?.isLoggedIn) {
        const credentials = LoginHelper.get()?.credentials?.accessToken;
        if (!credentials) {
          throw new Error('Unable to retrieve Codify credentials for user...');
        }

        ctx.codifyLoginCompleted(pluginName, credentials);
      } else {
        ctx.log('User is not currently logged. Attempt to Login to Codify...');
        await LoginOrchestrator.run();

        if (LoginHelper.get()?.isLoggedIn) {
          const credentials = LoginHelper.get()?.credentials?.accessToken;
          if (!credentials) {
            throw new Error('Unable to retrieve Codify credentials for user...');
          }

          ctx.codifyLoginCompleted(pluginName, credentials);
        } else {
          throw new Error('Unable to login...')
        }
      }
    })

    await LoginHelper.load();

    // Catch any un-caught exceptions
    process.on('uncaughtException', (error) => {
      console.log('Caught exception')
      this.catch(error);
    })
  }

  exit(code: number): never {
    this.reporter.hide();

    process.exit(code);
  }

  protected async catch(err: Error): Promise<void> {
    if (err instanceof PluginError && this.reporter) {
      await this.reporter.hide();
      this.reporter.displayPluginError(err);
      process.exit(1);
    }

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

    if (!process.stdin.isTTY) console.log('Running in non-TTY shell. Defaulting to plain output.')

    return !process.stdin.isTTY ? ReporterType.PLAIN : ReporterType.DEFAULT;
  }
}
