import { spawn, type ChildProcess } from 'node:child_process';

import { OsUtils } from './os-utils.js';

export class SleepInhibitor {
  private process: ChildProcess;

  private constructor(process: ChildProcess) {
    this.process = process;
  }

  static start(): SleepInhibitor | null {
    let child: ChildProcess;

    if (OsUtils.isMacOS()) {
      child = spawn('caffeinate', ['-i'], { stdio: 'ignore', detached: false });
    } else if (OsUtils.isLinux()) {
      child = spawn(
        'systemd-inhibit',
        ['--what=sleep', '--why=Codify apply in progress', '--mode=block', 'sleep', 'infinity'],
        { stdio: 'ignore', detached: false }
      );
    } else {
      return null;
    }

    child.unref();

    const inhibitor = new SleepInhibitor(child);
    for (const sig of ['exit', 'SIGINT', 'SIGTERM', 'uncaughtException']) {
      process.on(sig, () => inhibitor.stop());
    }

    return inhibitor;
  }

  stop(): void {
    if (!this.process.killed) {
      this.process.kill();
    }
  }
}
