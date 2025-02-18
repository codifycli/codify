import util from 'node:util';
import cp from 'node:child_process';

const exec = util.promisify(cp.exec);

export class ShellUtils {
  static async isZshShell(): Promise<boolean> {
    try {
      await exec('echo $ZSH_VERSION');
      return true;
    } catch {
      return false;
    }
  }

}
