import { LinuxDistro } from '@codifycli/schemas';
import cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import util from 'node:util';

const exec = util.promisify(cp.exec);

export enum Shell {
  ZSH = 'zsh',
  BASH = 'bash',
  SH = 'sh',
  KSH = 'ksh',
  CSH = 'csh',
  FISH = 'fish',
}


export const ShellUtils = {
  getShell(): Shell | undefined {
    const shell = process.env.SHELL || '';

    if (shell.endsWith('bash')) {
      return Shell.BASH
    }

    if (shell.endsWith('zsh')) {
      return Shell.ZSH
    }

    if (shell.endsWith('sh')) {
      return Shell.SH
    }

    if (shell.endsWith('csh')) {
      return Shell.CSH
    }

    if (shell.endsWith('ksh')) {
      return Shell.KSH
    }

    if (shell.endsWith('fish')) {
      return Shell.FISH
    }

    return undefined;
  },

  getDefaultShell(): string {
    return process.env.SHELL!;
  },

  async getLinuxDistro(): Promise<LinuxDistro | undefined> {
    for (const candidate of ['/etc/os-release', '/usr/lib/os-release']) {
      let osRelease: string;
      try {
        osRelease = await fs.readFile(candidate, 'utf8');
      } catch {
        continue;
      }
      for (const line of osRelease.split('\n')) {
        if (line.startsWith('ID=')) {
          const distroId = line.slice(3).trim().replaceAll('"', '');
          return Object.values(LinuxDistro).includes(distroId as LinuxDistro) ? distroId as LinuxDistro : undefined;
        }
      }
    }

    return undefined;
  },
}
