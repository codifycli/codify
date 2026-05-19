import { execFile, spawn } from 'node:child_process';
import util from 'node:util';

import { OsUtils } from './os-utils.js';
import { ShellUtils } from './shell.js';

const execFileAsync = util.promisify(execFile);

function spawnWithInput(command: string, args: string[], input?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
    if (input) {
      child.stdin.end(input + '\n');
    } else {
      child.stdin.end();
    }
  });
}

export const SudoUtils = {
  async validate(password?: string): Promise<boolean> {
    try {
      if (OsUtils.isMacOS()) {
        // Sudo with -SNv will not prompt if within sudo cache timeout. Mac OS uses -SNv instead of -Snv
        return await spawnWithInput('sudo', ['-SNv'], password);
      }

      // Sudo with -Skv will not prompt if within sudo cache timeout
      const shell = ShellUtils.getDefaultShell();
      return await spawnWithInput(shell, ['-c', 'sudo -Skv'], password);
    } catch {
      return false;
    }
  },

  async invalidate(): Promise<void> {
    try {
      await execFileAsync('sudo', ['-k']);
    } catch { /* sudo -k never fails meaningfully */ }
  },
};
