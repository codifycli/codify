import { execSync, spawn, SpawnOptions } from 'node:child_process';

import { ctx } from '../events/context.js';

export const SudoUtils = {
  async runCommand(command: string, options: CodifySpawnOptions, secureMode: boolean, pluginName?: string, password?: string): Promise<SpawnResult> {
    const result = await codifySpawn(command, options, secureMode, pluginName, password);

    if (result.status === SpawnStatus.ERROR && result.data.startsWith('sudo:')) {
      throw new Error('Sudo request failed. Exiting...')
    }

    return result;
  },

  validate(password?: string): boolean {
    try {
      // Sudo with -SNv will not prompt if within sudo cache timeout
      execSync(`sudo -SNv ${password ? `<<< ${password}` : ''}`, { stdio: 'ignore' })
      return true;
    } catch {
      return false;
    }
  }

};

enum SpawnStatus {
  ERROR = 'error',
  SUCCESS = 'success',
}

interface SpawnResult {
  data: string;
  status: SpawnStatus,
}

type CodifySpawnOptions = {
  cwd?: string;
  throws?: boolean,
} & Omit<SpawnOptions, 'detached' | 'shell' | 'stdio'>

/**
 *
 * @param cmd Command to run. Ex: `rm -rf`
 * @param opts Options for spawn
 * @param secureMode Secure mode for sudo
 * @param pluginName Optional plugin name so that stdout and stderr can be piped
 * @param password Optional password can be directly supplied
 *
 * @see promiseSpawn
 * @see spawn
 *
 * @returns SpawnResult { status: SUCCESS | ERROR; data: string }
 */
async function codifySpawn(
  cmd: string,
  opts: CodifySpawnOptions,
  secureMode: boolean,
  pluginName?: string,
  password?: string,
): Promise<{ data: string, status: SpawnStatus }> {
  return new Promise((resolve) => {
    const output: string[] = [];

    const _cmd = password ?
      secureMode
        ? `sudo -k; sudo -SN <<< "${password}" ${cmd}`
        : `sudo -S <<< "${password}" ${cmd}`
      : secureMode
        ? `sudo -k; sudo -N ${cmd}`
        : `sudo ${cmd}`;

    // Source start up shells to emulate a users environment vs. a non-interactive non-login shell script
    // Ignore all stdin
    const _process = spawn(`source ~/.zshrc; ${_cmd}`, [], {
      ...opts,
      shell: 'zsh',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const { stderr, stdout } = _process
    stdout.setEncoding('utf8');
    stderr.setEncoding('utf8');

    stdout.on('data', (data) => {
      output.push(data.toString());
    })

    stderr.on('data', (data) => {
      output.push(data.toString());
    })

    _process.on('error', (data) => {
    })

    // please node that this is not a full replacement for 'inherit'
    // the child process can and will detect if stdout is a pty and change output based on it
    // the terminal context is lost & ansi information (coloring) etc will be lost
    if (pluginName) {
      stdout.on('data', (data) => ctx.pluginStdout(pluginName, data))
      stderr.on('data', (data) => ctx.pluginStderr(pluginName, data))
    } else {
      stdout.pipe(process.stdout);
      stderr.pipe(process.stderr);
    }

    _process.on('close', (code) => {
      resolve({
        data: output.join('\n'),
        status: code === 0 ? SpawnStatus.SUCCESS : SpawnStatus.ERROR,
      })
    })
  })
}
