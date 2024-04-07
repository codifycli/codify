import readline from 'node:readline';

import { PlanOrchestrator } from './plan.js';

const rl = readline.createInterface(process.stdin, process.stdout);

export const ApplyOrchestrator = {
  async run(rootDirectory: string): Promise<void> {
    const { plan, pluginCollection } = await PlanOrchestrator.run(rootDirectory, false);

    const response = await new Promise((resolve) => {
      rl.question('Is this okay?\n', (answer) => resolve(answer));
    });
    if (response !== 'yes') {
      return;
    }

    await pluginCollection.apply(plan);
    await pluginCollection.destroy();
  },
};
