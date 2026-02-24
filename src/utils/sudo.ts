import { execSync } from 'node:child_process';

import { OsUtils } from './os-utils.js';

export const SudoUtils = {
  validate(password?: string): boolean {
    try {
      if (OsUtils.isMacOS()) {
        // Sudo with -SNv will not prompt if within sudo cache timeout. Mac OS uses -SNv instead of -Snv
        execSync(`sudo -SNv ${password ? `<<< ${password}` : ''}`, { stdio: 'ignore' })
        return true;
      }

      // Sudo with -Snv will not prompt if within sudo cache timeout
      execSync(`sudo -Skv ${password ? `<<< ${password}` : ''} >/dev/null 2>&1`, { stdio: 'ignore' })
      return true;
    } catch {
      return false;
    }
  }
};
