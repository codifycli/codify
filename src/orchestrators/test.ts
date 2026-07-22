
import { OS, SpawnStatus } from '@codifycli/schemas';
import os from 'node:os';
import fs from 'node:fs'
import fsp from 'node:fs/promises';
import path from 'node:path';
import semver from 'semver';

import { PluginInitOrchestrator } from '../common/initialize-plugins.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { StubReporter } from '../ui/reporters/stub-reporter.js';
import { sleep } from '../utils/index.js';
import { spawn, spawnSafe } from '../utils/spawn.js';
import { PlanOrchestrator, PlanOrchestratorResponse } from './plan.js';
import { ValidateOrchestrator } from './validate.js';
import { OsUtils } from '../utils/os-utils.js';
import { DebugReporter } from '../ui/reporters/debug-reporter.js';

export interface TestArgs {
  path?: string;
  secure?: boolean;
  verbosityLevel?: number;
  vmOs: OS;
}

export const TestOrchestrator = {
  async run(args: TestArgs, reporter: Reporter): Promise<void> {
    if (!OsUtils.isMacOS()) {
      throw new Error('Only a MacOS host is supported currently for testing');
    }

    ctx.processStarted(ProcessName.TEST);
    reporter.silent = true;

    ctx.subprocessStarted(SubProcessName.TEST_INITIALIZE_AND_VALIDATE);
    // Perform validation initially to ensure the project is valid
    const initializationResult = await PluginInitOrchestrator.run({ ...args, noProgress: true }, reporter);
    await ValidateOrchestrator.run({ existing: initializationResult, noProgress: true }, reporter);
    ctx.subprocessFinished(SubProcessName.TEST_INITIALIZE_AND_VALIDATE);

    await this.ensureVmIsInstalled(reporter, args.vmOs);

    ctx.subprocessStarted(SubProcessName.TEST_STARTING_VM);
    const baseVmName = args.vmOs === OS.Darwin ? 'codify-test-vm-macos' : 'codify-test-vm-linux';
    const vmName = this.generateVmName();
    await spawnSafe(`tart clone ${baseVmName} ${vmName}`, { interactive: true });

    const codifyInstall = await this.resolveCurrentCodifyInstall();

    // Run this in the background. The user will have to manually exit the GUI to stop the test.
    // We bind mount the codify installation and the codify config directory. We choose not use :ro (read-only) because live changes are not supported in read-only mode.
    spawnSafe(`tart run ${vmName} --dir=codify-lib:${codifyInstall}:ro --dir='codify-config:${path.dirname(initializationResult.project.codifyFiles[0])}:ro'`, { interactive: true })
      .finally(() => {
        ctx.subprocessFinished(SubProcessName.TEST_USER_CONTINUE_ON_VM);
        ctx.subprocessStarted(SubProcessName.TEST_DELETING_VM);

        spawnSafe(`tart delete ${vmName}`, { interactive: true })
        ctx.subprocessFinished(SubProcessName.TEST_DELETING_VM);

        ctx.processFinished(ProcessName.TEST);
        console.log('VM has been killed... exiting.')
        process.exit(1);
      })
    await sleep(5000);
    await this.waitUntilVmIsReady(vmName);

    ctx.subprocessFinished(SubProcessName.TEST_STARTING_VM);

    ctx.subprocessStarted(SubProcessName.TEST_COPYING_OVER_CONFIGS_AND_OPENING_TERMINAL);
    // Install codify on the VM
    // await spawn(`tart exec ${vmName} /bin/bash -c "$(curl -fsSL https://releases.codifycli.com/install.sh)"`, { interactive: true });
    const { data: ip } = await spawnSafe(`tart ip ${vmName}`, { interactive: true });

    try {
      // Add symlinks to the bind mount locations.
      await spawn(`tart exec ${vmName} sudo ln -s /Volumes/My\\ Shared\\ Files/codify-lib/bin/codify /usr/local/bin/codify`, { interactive: true, allowSudoInCommand: true });
      await spawn(`tart exec ${vmName} ln -s /Volumes/My\\ Shared\\ Files/codify-config/${path.basename(initializationResult.project.codifyFiles[0])} /Users/admin/codify.jsonc`, { interactive: true });

      // Launch terminal and run codify apply
      await (args.vmOs === OS.Darwin ? spawn(`tart exec ${vmName} osascript -e "tell application \\"Terminal\\" to do script \\"cd ~ && codify apply -y\\""`, { interactive: true }) : spawn(`tart exec ${vmName} gnome-terminal -- bash -c "cd ~/ && codify apply"`, { interactive: true }));

      this.watchAndSyncFileChanges(initializationResult.project.codifyFiles[0], ip);

    } catch (error) {
      ctx.log(`Error copying files to VM: ${error}`);
    }

    ctx.subprocessFinished(SubProcessName.TEST_COPYING_OVER_CONFIGS_AND_OPENING_TERMINAL);
    ctx.subprocessStarted(SubProcessName.TEST_USER_CONTINUE_ON_VM);

    await sleep(1_000_000_000);
  },

  generateVmName(): string {
    return `codify-test-vm-${Date.now()}`;
  },

  async ensureVmIsInstalled(reporter: Reporter, vmOs: OS, isDebug = false): Promise<void> {
    if (vmOs === OS.Windows) {
      throw new Error('VM installation not supported on Windows');
    }

    const hostSystem = os.platform() === 'darwin' ? OS.Darwin : OS.Linux;

    let planResult: PlanOrchestratorResponse;
    if (hostSystem === OS.Darwin) {
      const vmImage = vmOs === OS.Darwin ? 'ghcr.io/cirruslabs/macos-tahoe-base:latest' : 'ghcr.io/cirruslabs/ubuntu-runner-arm64:latest';
      const vmName = vmOs === OS.Darwin ? 'codify-test-vm-macos' : 'codify-test-vm-linux';

      ctx.subprocessStarted(SubProcessName.TEST_CHECKING_VM_INSTALLED);
      planResult = await PlanOrchestrator.run({
        codifyConfigs: [{
          type: 'homebrew',
          formulae: ['sshpass']
        }, {
          type: 'tart',
          clone: [{ sourceName: vmImage, name: vmName }],
        }],
        noProgress: true,
        verbosityLevel: -1,
      }, reporter);

      reporter.silent = false;
      ctx.subprocessFinished(SubProcessName.TEST_CHECKING_VM_INSTALLED);
    } else {
      throw new Error('VM installation not supported on Linux just yet');
    }

    // Short circuit and exit if every change is NOOP
    if (!planResult.plan.isEmpty()) {
      await reporter.displayPlan(planResult.plan);
      const confirm = await reporter.promptConfirmation('The following resources will need to be installed (Tart VM - 25gb). Do you want to continue?')
      if (!confirm) {
        return process.exit(0);
      }

      const { plan, pluginManager, project } = planResult;
      await pluginManager.setVerbosityLevel(3);
      const filteredPlan = plan.filterNoopResources()

      await reporter.displayProgress();
      await pluginManager.apply(project, filteredPlan);
    }
  },

  async waitUntilVmIsReady(vmName: string): Promise<void> {
    while (true) {
      const result = await spawnSafe(`tart exec ${vmName} pwd`, { interactive: true, timeout: 5000 })
      if (result.status === SpawnStatus.SUCCESS) {
        return;
      }

      await sleep(1000);
    }
  },

  async resolveCurrentCodifyInstall(): Promise<string> {
    // CODIFY_BINPATH is set by the oclif launcher to the actual running binary path,
    // e.g. ~/.local/share/codify/client/1.2.0-beta.5-217718d/bin/codify
    // Walk up two levels (bin/ -> version dir) to get the install root.
    const binPath = process.env.CODIFY_BINPATH;
    if (binPath) {
      const installDir = path.resolve(path.dirname(binPath), '..');
      try {
        await fsp.access(path.join(installDir, 'bin', 'codify'));
        return installDir;
      } catch {
        // fall through
      }
    }

    // Fallback: scan versioned dirs under ~/.local/share/codify/client/ and pick the highest semver
    const clientDir = path.join(os.homedir(), '.local', 'share', 'codify', 'client');
    try {
      const entries = await fsp.readdir(clientDir);
      const versioned = entries
        .filter((e) => e !== 'current' && e !== 'bin')
        .map((e) => {
          // Directory names are like "1.2.0-beta.5-217718d" — strip the trailing commit hash
          const withoutHash = e.replace(/-[0-9a-f]{7,}$/, '');
          return { dir: e, version: semver.valid(semver.coerce(withoutHash)) };
        })
        .filter((e): e is { dir: string; version: string } => e.version !== null)
        .sort((a, b) => semver.rcompare(a.version, b.version));

      if (versioned.length > 0) {
        return path.join(clientDir, versioned[0].dir);
      }
    } catch {
      // fall through
    }

    return '/usr/local/lib/codify';
  },

  watchAndSyncFileChanges(filePath: string, ip: string): void {
    const watcher = fs.watch(filePath, { persistent: false }, async (eventType) => {
      if (eventType === 'change') {
        ctx.log('Config file changed, syncing to VM...');
        try {
          // Copy the updated config file to the VM
          // This command will fail but it causes the bind mount to update for some reason. (seems like a bug in Tart). Leave this here for now.
          await spawn(`sshpass -p "admin" scp -o PubkeyAuthentication=no -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null '${filePath}' admin@${ip}:~/codify.jsonc`, { interactive: true });
          // ctx.log('Config file synced successfully');
        } catch (error) {
          // ctx.log(`Error syncing config file: ${error}`);
        }
      }
    });

    // Clean up the watcher when the process finishes
    const cleanupWatcher = () => {
      watcher.close();
    };

    process.once('exit', cleanupWatcher);
  }
};
