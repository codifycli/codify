import readline from 'node:readline'

import { ConfigParser } from '../../config-parser/index.js';
import { PluginCollection } from '../../plugins/plugin-collection.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


export const ApplyOrchestrator = {

  async run(rootDirectory: string): Promise<string> {
    const project = await ConfigParser.parseProject(rootDirectory);
    if (project.isEmpty()) {
      console.log('Empty project. Taking no action');
      return '';
    }

    const pluginCollection = new PluginCollection();
    const dependencyMap = await pluginCollection.initialize(project);
    project.validateWithResourceMap(dependencyMap);
    project.resolveResourceDependencies(dependencyMap);

    const validationResults = await pluginCollection.validate(project);
    project.handlePluginResourceValidationResults(validationResults);
    project.calculateEvaluationOrder();

    const plan = await pluginCollection.getPlan(project);
    console.log(JSON.stringify(plan, null, 2));

    console.log('Is this okay?');

    for await (const line of rl) {
      if (line === 'yes') {
        break;
      } else {
        return '';
      }
    }

    await pluginCollection.apply(plan);
    await pluginCollection.destroy();

    return '';
  },
};
