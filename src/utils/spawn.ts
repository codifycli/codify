import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import { SpawnStatus } from '@codifycli/schemas';
import stripAnsi from 'strip-ansi';

import { SpawnError } from '../common/errors.js';
import { ctx } from '../events/context.js';
import { OsUtils } from './os-utils.js';
import { Shell, ShellUtils } from './shell.js';

export interface SpawnResult {
  status: SpawnStatus;
  exitCode: number;
  data: string;
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, unknown>,
  interactive?: boolean,
  requiresRoot?: boolean,
  stdin?: boolean,
  timeout?: number,
  allowSudoInCommand?: boolean,
}

export async function spawn(cmd: string, options?: SpawnOptions, pluginName?: string, password?: string): Promise<SpawnResult> {
  const spawnResult = await spawnSafe(cmd, options, pluginName, password);

  if (spawnResult.status !== 'success') {
    throw new SpawnError(Array.isArray(cmd) ? cmd.join('\n') : cmd, spawnResult.exitCode, spawnResult.data);
  }

  return spawnResult;
}

export async function spawnSafe(cmd: string, options?: SpawnOptions, pluginName?: string, password?: string): Promise<SpawnResult> {
  if (options?.requiresRoot && !password) {
    throw new Error('Password must be specified!');
  }

  if (cmd.toLowerCase().includes('sudo') && !options?.allowSudoInCommand) {
    throw new Error(`Command must not include sudo. Plugin (${pluginName})`)
  }

  if (pluginName) {
    ctx.pluginStdout(pluginName, `Running command: ${options?.requiresRoot ? 'sudo' : ''} ${cmd}` + (options?.cwd ? `(${options?.cwd})` : ''))
  } else {
    ctx.log(`Running command: ${cmd}` + (options?.cwd ? `(${options?.cwd})` : '') + '\n');
  }

  return new Promise((resolve) => {
    const output: string[] = [];
    const historyIgnore = ShellUtils.getShell() === Shell.ZSH ? { HISTORY_IGNORE: '*' } : { HISTIGNORE: '*' };

    // If TERM_PROGRAM=Apple_Terminal is set then ANSI escape characters may be included
    // in the response.
    const env = {
      ...process.env, ...options?.env,
      TERM_PROGRAM: 'codify',
      COMMAND_MODE: 'unix2003',
      COLORTERM: 'truecolor',
      ...historyIgnore
    }

    // Initial terminal dimensions
    const initialCols = process.stdout.columns ?? 80;
    const initialRows = process.stdout.rows ?? 24;

    const command = options?.requiresRoot ? `sudo -k >/dev/null 2>&1; sudo -S <<< "${password}" -E ${ShellUtils.getDefaultShell()} ${options?.interactive ? '-i' : ''} -c "${cmd.replaceAll('"', '\\"')}"` : cmd;
    const args = options?.interactive ? ['-i', '-c', command] : ['-c', command]

    // Run the command in a pty for interactivity
    const mPty = pty.spawn(ShellUtils.getDefaultShell(), args, {
      ...options,
      cols: initialCols,
      rows: initialRows,
      env
    });

    mPty.onData((data) => {
      if (pluginName && !options?.stdin) {
        ctx.pluginStdout(pluginName, data)
      } else {
        ctx.log(data);
      }

      output.push(data.toString());
    })

    const resizeListener = () => {
      const { columns, rows } = process.stdout;
      mPty.resize(columns, rows);
    }

    const stdinListener = (data: Buffer | string) => {
      // console.log('stdinListener', data);
      mPty.write(data.toString());
    }

    // Listen to resize events for the terminal window;
    process.stdout.on('resize', resizeListener);
    if (options?.stdin) {
      process.stdin.on('data', stdinListener)
    }

    mPty.onExit((result) => {
      process.stdout.off('resize', resizeListener);
      if (options?.stdin) {
        process.stdin.off('data', stdinListener);
      }

      resolve({
        status: result.exitCode === 0 ? SpawnStatus.SUCCESS : SpawnStatus.ERROR,
        exitCode: result.exitCode,
        data: stripAnsi(output.join('\n').trim()),
      })
    });

    if (options?.timeout) {
      setTimeout(() => {
        mPty.kill();
        resolve({
          status: SpawnStatus.ERROR,
          exitCode: -1,
          data: '',
        });
      }, options.timeout);
    }
  })
}
