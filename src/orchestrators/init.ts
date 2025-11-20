import chalk from 'chalk';
import path from 'node:path';

import { PluginInitOrchestrator } from '../common/initialize-plugins.js';
import { ResourceConfig } from '../entities/resource-config.js';
import { ProcessName, SubProcessName, ctx } from '../events/context.js';
import { Reporter } from '../ui/reporters/reporter.js';
import { FileUtils } from '../utils/file.js';
import { resolvePathWithVariables, untildify } from '../utils/index.js';

export interface InitArgs {
  path?: string;
  verbosityLevel?: number;
}

export const InitializeOrchestrator = {

  async run(args: InitArgs, reporter: Reporter) {
    await reporter.displayInitBanner()

    ctx.processStarted(ProcessName.INIT)
    await reporter.displayProgress();


    const { pluginManager, typeIdsToDependenciesMap } = await PluginInitOrchestrator.run(args, reporter);

    ctx.subprocessStarted(SubProcessName.IMPORT_RESOURCE)
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
    ctx.subprocessFinished(SubProcessName.IMPORT_RESOURCE)

    const flattenedResults = importResults.filter(Boolean).flatMap(p => p?.result).filter(Boolean)

    const userSelectedTypes = await reporter.promptInitResultSelection([...new Set(flattenedResults.map((r) => r!.core.type))])
    ctx.log('Resource types were chosen to be imported.')

    const locationToSave = args.path ?? await this.promptSaveLocation(reporter);
    ctx.log(`Save results to ${locationToSave}`)
    await reporter.hide();

    const resourcesRaw = flattenedResults.filter((r) => r && userSelectedTypes.includes(r.core.type))
      .map((r) => ResourceConfig.fromJson(r!))
      .map((r) => r.raw);

    await FileUtils.writeFile(locationToSave, JSON.stringify(resourcesRaw, null, 2));
    ctx.log('File successfully saved');

    await reporter.displayMessage(`
🎉🎉 Codify successfully initialized. 🎉🎉   
The imported configs were written to: ${locationToSave}

Use ${chalk.bgMagenta.bold(' codify plan ')} to compute changes and ${chalk.bgMagenta.bold(' codify apply ')} to apply them.
For more information visit: https://docs.codifycli.com.

Enjoy!
    `)

    ctx.processFinished(ProcessName.INIT);

    process.exit(0);
  },

  async promptSaveLocation(reporter: Reporter): Promise<string> {
    let locationToSave = '';
    let input = '';
    let isValidSaveLocation = false;
    let error = false;

    while (!isValidSaveLocation) {
      input = (await reporter.promptInput(
        `Where to save the new Codify configs? ${chalk.grey.dim('(leave blank for ~/codify.jsonc)')}`,
        error ? `Invalid location: ${input} already exists` : undefined)
      )
      input = input ? input : '~/codify.jsonc';

      locationToSave = path.resolve(untildify(resolvePathWithVariables(input)));

      try {
        isValidSaveLocation = !(await FileUtils.fileExists(locationToSave));
        error = !isValidSaveLocation;
      } catch {
        isValidSaveLocation = false;
        error = true;
      }
    }

    return locationToSave;
  }

};
