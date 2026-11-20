// Port of the update command of @oclif/plugin-update (MIT, Copyright (c) 2018 Salesforce.com), see src/update/LICENSE.

import { Args, Command, Flags, Interfaces, ux } from '@oclif/core';
import chalk from 'chalk';
import { render } from 'ink';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import React from 'react';

import SelectInput from '../ui/components/widgets/SelectInput.js';
import { fetchJson, Updater } from '../update/updater.js';
import { compareVersions } from '../utils/semver.js';

export default class Update extends Command {
  static args = {
    channel: Args.string({ optional: true }),
  };

  static description = 'update the <%= config.bin %> CLI';

  static examples = [
    {
      command: '<%= config.bin %> <%= command.id %> stable',
      description: 'Update to the stable channel:',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --version 1.0.0',
      description: 'Update to a specific version:',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --interactive',
      description: 'Interactively select version:',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --available',
      description: 'See available versions:',
    },
  ];

  static flags = {
    autoupdate: Flags.boolean({ hidden: true }),
    available: Flags.boolean({
      char: 'a',
      description: 'See available versions.',
      exclusive: ['version', 'interactive'],
    }),
    force: Flags.boolean({
      description: 'Force a re-download of the requested version.',
      exclusive: ['interactive', 'available'],
    }),
    interactive: Flags.boolean({
      char: 'i',
      description: 'Interactively select version to install. This is ignored if a channel is provided.',
      exclusive: ['version'],
    }),
    verbose: Flags.boolean({
      char: 'b',
      dependsOn: ['available'],
      description: 'Show more details about the available versions.',
    }),
    version: Flags.string({
      char: 'v',
      description: 'Install a specific version.',
      exclusive: ['interactive'],
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Update);
    const updater = new Updater(this.config);

    if (flags.available) {
      const { distTags, index, localVersions } = await lookupVersions(updater, this.config);
      const rows = sortVersions(Object.keys(index)).map((version) => {
        const location = localVersions.find((l) => path.basename(l).startsWith(version)) ?? index[version];
        return {
          channel: channelName(distTags[version]) ?? '',
          downloaded: location.includes('http') ? '' : 'true',
          location,
          version: this.config.version === version ? `${chalk.yellowBright(version)} (current)` : version,
        };
      });

      const columns: Array<keyof typeof rows[number]> = flags.verbose
        ? ['version', 'channel', 'downloaded', 'location']
        : ['version', 'channel', 'downloaded'];
      ux.stdout(formatTable(columns, rows));
      return;
    }

    if (args.channel && flags.version) {
      this.error('You cannot specify both a version and a channel.');
    }

    await updater.runUpdate({
      autoUpdate: flags.autoupdate,
      channel: args.channel,
      force: flags.force,
      version: flags.interactive ? await promptForVersion(updater, this.config) : flags.version,
    });
  }
}

async function lookupVersions(updater: Updater, config: Interfaces.Config) {
  ux.action.start('Looking up versions');
  const [index, localVersions, distTags] = await Promise.all([
    updater.fetchVersionIndex(),
    updater.findLocalVersions(),
    fetchDistTags(config),
  ]);
  ux.action.stop(`Found ${Object.keys(index).length} versions`);
  return { distTags, index, localVersions };
}

/** version -> npm dist-tag (ex: latest) */
async function fetchDistTags(config: Interfaces.Config): Promise<Record<string, string>> {
  if (config.pjson.oclif.update?.disableNpmLookup) {
    return {};
  }

  const registry = config.npmRegistry ?? 'https://registry.npmjs.org';
  const body = await fetchJson(`${registry}/${config.pjson.name}`) as { 'dist-tags'?: Record<string, string> };
  return Object.fromEntries(Object.entries(body['dist-tags'] ?? {}).map(([tag, version]) => [version, tag]));
}

/** npm style tags to oclif channels */
function channelName(tag?: string): string | undefined {
  if (tag === 'latest') return 'stable';
  if (tag === 'latest-rc') return 'stable-rc';
  return tag;
}

function sortVersions(versions: string[]): string[] {
  return [...versions].sort((a, b) => {
    try {
      return compareVersions(b, a);
    } catch {
      return b.localeCompare(a);
    }
  });
}

async function promptForVersion(updater: Updater, config: Interfaces.Config): Promise<string> {
  const { distTags, index } = await lookupVersions(updater, config);
  const items = sortVersions(Object.keys(index))
    .map((version) => ({ label: distTags[version] ? `${version} (${distTags[version]})` : version, value: version }));

  ux.stdout('Select a version to update to');
  return new Promise((resolve, reject) => {
    const app = render(React.createElement(SelectInput<string>, {
      items,
      limit: 10,
      onSelect(item) {
        app.unmount();
        resolve(item.value);
      },
    }));
    app.waitUntilExit().then(() => reject(new Error('No version selected')), reject);
  });
}

// A table with a header and | separators, like the vertical-with-outline style of @oclif/table
function formatTable<K extends string>(columns: K[], rows: Array<Record<K, string>>): string {
  const visibleLength = (text: string) => stripVTControlCharacters(text).length;
  const header = Object.fromEntries(columns.map((c) => [c, chalk.bold(c.charAt(0).toUpperCase() + c.slice(1))])) as Record<K, string>;
  const widths = columns.map((c) => Math.max(...[header, ...rows].map((row) => visibleLength(row[c]))));

  const line = (row: Record<K, string>) => '│ ' + columns
    .map((c, i) => row[c] + ' '.repeat(widths[i] - visibleLength(row[c])))
    .join(' │ ') + ' │';
  const rule = (left: string, middle: string, right: string) => left + widths.map((w) => '─'.repeat(w + 2)).join(middle) + right;

  return [rule('┌', '┬', '┐'), line(header), rule('├', '┼', '┤'), ...rows.map((row) => line(row)), rule('└', '┴', '┘')].join('\n');
}
