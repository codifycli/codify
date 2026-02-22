import { LinuxDistro, ResourceOs } from 'codify-schemas';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export enum Shell {
  ZSH = 'zsh',
  BASH = 'bash',
  SH = 'sh',
  KSH = 'ksh',
  CSH = 'csh',
  FISH = 'fish',
}
export const OsUtils = {
  getUser(): string {
    return os.userInfo().username;
  },

  getOs(): ResourceOs {
    if (OsUtils.isMacOS()) {
      return ResourceOs.MACOS;
    }

    if (OsUtils.isLinux()) {
      return ResourceOs.LINUX;
    }

    if (OsUtils.isWindows()) {
      return ResourceOs.WINDOWS;
    }

    throw new Error('Unsupported operating system');
  },

  getSystemInfo() {
    return {
      os: os.type(),
      shell: this.getShell(),
    }
  },

  isMacOS(): boolean {
    return os.platform() === 'darwin';
  },

  isLinux(): boolean {
    return os.platform() === 'linux';
  },

  isWindows(): boolean {
    return os.platform() === 'win32'
  },

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


  getPrimaryShellRc(): string {
    return this.getShellRcFiles()[0];
  },

  getShellRcFiles(): string[] {
    const shell = process.env.SHELL || '';
    const homeDir = os.homedir();

    if (shell.endsWith('bash')) {
      // Linux typically uses .bashrc, macOS uses .bash_profile
      if (OsUtils.isLinux()) {
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

  async getLinuxDistro(): Promise<LinuxDistro | undefined> {
    const osRelease = await fs.readFile('/etc/os-release', 'utf8');
    const lines = osRelease.split('\n');
    for (const line of lines) {
      if (line.startsWith('ID=')) {
        const distroId = line.slice(3).trim().replaceAll('"', '');
        return Object.values(LinuxDistro).includes(distroId as LinuxDistro) ? distroId as LinuxDistro : undefined;
      }
    }

    return undefined;
  },
  async isUbuntu(): Promise<boolean> {
    return (await this.getLinuxDistro()) === LinuxDistro.UBUNTU;
  },

  async isDebian(): Promise<boolean> {
    return (await this.getLinuxDistro()) === LinuxDistro.DEBIAN;
  },

  async isArch(): Promise<boolean> {
    return (await this.getLinuxDistro()) === LinuxDistro.ARCH;
  },

  async isCentOS(): Promise<boolean> {
    return (await this.getLinuxDistro()) === LinuxDistro.CENTOS;
  },

  async isFedora(): Promise<boolean> {
    return (await this.getLinuxDistro()) === LinuxDistro.FEDORA;
  },

  async isRHEL(): Promise<boolean> {
    return (await this.getLinuxDistro()) === LinuxDistro.RHEL;
  },

  isDebianBased(): boolean {
    return fsSync.existsSync('/etc/debian_version');
  },

  isRedhatBased(): boolean {
    return fsSync.existsSync('/etc/redhat-release');
  }
};



