import { execSync } from 'node:child_process';

import { OsUtils } from './os-utils.js';
import { ShellUtils } from './shell.js';

export const SudoUtils = {
  validate(password?: string): boolean {
    try {
      if (OsUtils.isMacOS()) {
        // Sudo with -SNv will not prompt if within sudo cache timeout. Mac OS uses -SNv instead of -Snv
        execSync(`sudo -SNv ${password ? `<<< ${password}` : ''}`, { stdio: 'ignore' })
        return true;
      }

      // Sudo with -Snv will not prompt if within sudo cache timeout
      execSync(`sudo -Skv ${password ? `<<< '${password}'` : ''}`, { stdio: 'ignore', shell: ShellUtils.getDefaultShell() })
      return true;
    } catch {
      return false;
    }
  }
};
