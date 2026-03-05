
import { OS, SpawnStatus } from 'codify-schemas';
import os from 'node:os';

import { PluginInitOrchestrator } from '../common/initialize-plugins.js';
import { ProcessName, ctx, SubProcessName } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { StubReporter } from '../ui/reporters/stub-reporter.js';
import { sleep } from '../utils/index.js';
import { spawn, spawnSafe } from '../utils/spawn.js';
import { PlanOrchestrator, PlanOrchestratorResponse } from './plan.js';
import { ValidateOrchestrator } from './validate.js';
import { FileUtils } from '../utils/file.js';

export interface TestArgs {
  path?: string;
  secure?: boolean;
  verbosityLevel?: number;
  vmOs: OS;
}

export const TestOrchestrator = {
  async run(args: TestArgs, reporter: Reporter): Promise<void> {
    ctx.processStarted(ProcessName.TEST);
    reporter.silent = true;

    ctx.subprocessStarted(SubProcessName.TEST_INITIALIZE_AND_VALIDATE);
    // Perform validation initially to ensure the project is valid
    const initializationResult = await PluginInitOrchestrator.run({ ...args, noProgress: true }, reporter);
    await ValidateOrchestrator.run({ existing: initializationResult, noProgress: true }, reporter);
    ctx.subprocessFinished(SubProcessName.TEST_INITIALIZE_AND_VALIDATE);

    await this.ensureVmIsInstalled(reporter, args.vmOs);

    const password = await reporter.promptSecret('Password needed to copy Codify installation to VM...');

    ctx.subprocessStarted(SubProcessName.TEST_STARTING_VM);
    const baseVmName = args.vmOs === OS.Darwin ? 'codify-test-vm-macos' : 'codify-test-vm-linux';
    const vmName = this.generateVmName();
    await spawnSafe(`tart clone ${baseVmName} ${vmName}`, { interactive: true });

    // Run this in the background. The user will have to manually exit the GUI to stop the test.
    spawnSafe(`tart run ${vmName}`, { interactive: true })
      .finally(() => {
        ctx.subprocessFinished(SubProcessName.TEST_USER_CONTINUE_ON_VM);
        ctx.subprocessStarted(SubProcessName.TEST_DELETING_VM);

        spawnSafe(`tart delete ${vmName}`, { interactive: true })
        ctx.subprocessFinished(SubProcessName.TEST_DELETING_VM);

        ctx.processFinished(ProcessName.TEST);
        console.log('VM has been killed... exiting.')
        process.exit(1);
      })
    await sleep(5_000);
    await this.waitUntilVmIsReady(vmName);

    ctx.subprocessFinished(SubProcessName.TEST_STARTING_VM);

    ctx.subprocessStarted(SubProcessName.TEST_COPYING_OVER_CONFIGS_AND_OPENING_TERMINAL);
    // Install codify on the VM
    // await spawn(`tart exec ${vmName} /bin/bash -c "$(curl -fsSL https://releases.codifycli.com/install.sh)"`, { interactive: true });
    const { data: ip } = await spawnSafe(`tart ip ${vmName}`, { interactive: true });

    await spawn(`sshpass -p "admin" rsync -avz -e 'ssh -o PubkeyAuthentication=no -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null' /usr/local/lib/codify admin@${ip}:~/codify-lib`, { requiresRoot: true }, undefined, password);

    if (await FileUtils.dirExists('~/.local/share/codify')) {
      await spawn(`sshpass -p "admin" rsync -avz -e 'ssh -o PubkeyAuthentication=no -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null' ~/.local/share/codify admin@${ip}:~/.local/share/codify`, { interactive: true });
    }

    try {
      await spawn(`tart exec ${vmName} sudo mv /Users/admin/codify-lib /usr/local/lib`, { interactive: true });
      await spawn(`tart exec ${vmName} sudo ln -s /usr/local/lib/codify/bin/codify /usr/local/bin/codify`, { interactive: true });
      await spawn(`sshpass -p "admin" scp -o PubkeyAuthentication=no -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${initializationResult.project.codifyFiles[0]} admin@${ip}:~/codify.jsonc`, { interactive: true });

      if (args.vmOs === OS.Darwin) {
        await spawn(`tart exec ${vmName} osascript -e "tell application \\"Terminal\\" to do script \\"cd ~/ && codify apply\\""`, { interactive: true });
      } else {
        await spawn(`tart exec ${vmName} gnome-terminal -- bash -c "cd ~/ && codify apply"`, { interactive: true });
      }
    } catch (e) {
      ctx.log(`Error copying files to VM: ${e}`);
    }

    ctx.subprocessFinished(SubProcessName.TEST_COPYING_OVER_CONFIGS_AND_OPENING_TERMINAL);
    ctx.subprocessStarted(SubProcessName.TEST_USER_CONTINUE_ON_VM);

    await sleep(1_000_000_000);
  },

  generateVmName(): string {
    return `codify-test-vm-${Date.now()}`;
  },

  async ensureVmIsInstalled(reporter: Reporter, vmOs: OS): Promise<void> {
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
          type: 'project',
          plugins: { default: '/Users/kevinwang/Projects/codify-homebrew-plugin/src/index.ts' }
        }, {
          type: 'homebrew',
          formulae: ['sshpass']
        }, {
          type: 'tart',
          clone: [{ sourceName: vmImage, name: vmName }],
        }],
        noProgress: true,
        verbosityLevel: -1,
      }, new StubReporter());

      reporter.silent = false;
      ctx.subprocessFinished(SubProcessName.TEST_CHECKING_VM_INSTALLED);
    } else {
      throw new Error('VM installation not supported on Linux just yet');
    }

    // Short circuit and exit if every change is NOOP
    if (!planResult.plan.isEmpty()) {
      reporter.displayPlan(planResult.plan);
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
  }
};
