import { LinuxDistro } from '@codifycli/schemas';
import cp from 'node:child_process';
import * as fs from 'node:fs/promises';
import util from 'node:util';
import os from 'node:os';
import path from 'node:path';

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

  getPrimaryShellRc(): string {
    return this.getShellRcFiles()[0];
  },

  getShellRcFiles(): string[] {
    const shell = process.env.SHELL || os.userInfo().shell || '';
    const homeDir = os.homedir();

    if (shell.endsWith('bash')) {
      // Linux typically uses .bashrc, macOS uses .bash_profile
      if (ShellUtils.isLinux()) {
        return [
          path.join(homeDir, '.bashrc'),
          path.join(homeDir, '.bash_profile'),
          path.join(homeDir, '.profile'),
        ];
      }

      return [
        path.join(homeDir, '.bash_profile'),
        path.join(homeDir, '.bashrc'),
        path.join(homeDir, '.profile'),
      ];
    }

    if (shell.endsWith('zsh')) {
      return [
        path.join(homeDir, '.zshrc'),
        path.join(homeDir, '.zprofile'),
        path.join(homeDir, '.zshenv'),
      ];
    }

    if (shell.endsWith('sh')) {
      return [
        path.join(homeDir, '.profile'),
      ]
    }

    if (shell.endsWith('ksh')) {
      return [
        path.join(homeDir, '.profile'),
        path.join(homeDir, '.kshrc'),
      ]
    }

    if (shell.endsWith('csh')) {
      return [
        path.join(homeDir, '.cshrc'),
        path.join(homeDir, '.login'),
        path.join(homeDir, '.logout'),
      ]
    }

    if (shell.endsWith('fish')) {
      return [
        path.join(homeDir, '.config/fish/config.fish'),
      ]
    }

    // Default to bash-style files
    return [
      path.join(homeDir, '.bashrc'),
      path.join(homeDir, '.bash_profile'),
      path.join(homeDir, '.profile'),
    ];
  },

  isMacOS(): boolean {
    return os.platform() === 'darwin';
  },

  isLinux(): boolean {
    return os.platform() === 'linux';
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
