import { ProcessName, ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { PluginInitOrchestrator } from './initialize-plugins.js';

export const InitializeOrchestrator = {

  async run(reporter: Reporter) {
    await reporter.displayInitBanner()

    ctx.processStarted(ProcessName.INIT)
    await reporter.displayProgress();


    const { pluginManager, typeIdsToDependenciesMap } = await PluginInitOrchestrator.run({}, reporter);

    const importResults = await Promise.all([...typeIdsToDependenciesMap.keys()].map(async (typeId) => {
      try {
        return await pluginManager.importResource({
          core: { type: typeId },
          parameters: {}
        }, true);
      } catch {
        return null;
      }
    }))

    const flattenedResults = importResults.filter(Boolean).flatMap(p => p?.result).filter(Boolean)

    const userSelectedTypes = await reporter.promptInitResultSelection([...new Set(flattenedResults.map((r) => r!.core.type))])

    ctx.processFinished(ProcessName.INIT);

    console.log(JSON.stringify(flattenedResults, null, 2));
  },


};
