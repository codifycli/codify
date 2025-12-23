import { execSync } from 'node:child_process';


export const SudoUtils = {
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
