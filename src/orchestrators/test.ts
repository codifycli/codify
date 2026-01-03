
import { SpawnStatus } from 'codify-schemas';

import { PluginInitOrchestrator } from '../common/initialize-plugins.js';
import { ProcessName, ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { sleep } from '../utils/index.js';
import { spawn, spawnSafe } from '../utils/spawn.js';
import { PlanOrchestrator } from './plan.js';
import { ValidateOrchestrator } from './validate.js';

export interface TestArgs {
  path?: string;
  secure?: boolean;
  verbosityLevel?: number;
}

export const TestOrchestrator = {
  async run(args: TestArgs, reporter: Reporter): Promise<void> {
    
    // Perform validation initially to ensure the project is valid
    const initializationResult = await PluginInitOrchestrator.run(args, reporter);
    await ValidateOrchestrator.run({ existing: initializationResult }, reporter);

    const planResult = await PlanOrchestrator.run({
      codifyConfigs: [{
        type: 'project',
        plugins: { default: '/Users/kevinwang/Projects/codify-homebrew-plugin/src/index.ts' }
      }, {
        type: 'homebrew',
        formulae: ['sshpass']
      }, {
        type: 'tart',
        clone: [{ sourceName: 'ghcr.io/cirruslabs/macos-tahoe-base:latest', name: 'codify-test-vm' }],
      }],
    }, reporter);

    // Short circuit and exit if every change is NOOP
    if (!planResult.plan.isEmpty()) {
      const confirm = await reporter.promptConfirmation('The following resources will need to be installed (Tart VM - 25gb). Do you want to continue?')
      if (!confirm) {
        return process.exit(0);
      }

      const { plan, pluginManager, project } = planResult;
      const filteredPlan = plan.filterNoopResources()

      ctx.processStarted(ProcessName.APPLY);
      await pluginManager.apply(project, filteredPlan);
      ctx.processFinished(ProcessName.APPLY);
    }

    const vmName = this.generateVmName();
    await spawnSafe(`tart clone codify-test-vm ${vmName}`, { interactive: true });

    // Run this in the background. The user will have to manually exit the GUI to stop the test.
    spawnSafe(`tart run ${vmName}`, { interactive: true })
      .finally(() => {
        console.log('VM has been killed... exiting.')
        process.exit(1);
      })
    await sleep(10_000);
    await this.waitUntilVmIsReady(vmName);

    // Install codify on the VM
    // await spawn(`tart exec ${vmName} /bin/bash -c "$(curl -fsSL https://releases.codifycli.com/install.sh)"`, { interactive: true });
    const { data: ip } = await spawnSafe(`tart ip ${vmName}`, { interactive: true });
    await spawn(`sshpass -p "admin" scp -o PubkeyAuthentication=no -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${initializationResult.project.codifyFiles[0]} admin@${ip}:~/codify.jsonc`, { interactive: true });
    // await spawn(`tart exec ${vmName} codify apply`, undefined, { interactive: true });

    await spawn(`tart exec ${vmName} osascript -e "tell application \\"Terminal\\" to do script \\"cd ~/ && codify apply\\""`)

    await sleep(1_000_000_000);
  },

  generateVmName(): string {
    return `codify-test-vm-${Date.now()}`;
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
