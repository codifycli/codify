import { Command, Help, HelpBase } from '@oclif/core';
import { colorize } from '@oclif/core/ux';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';

enum HelpSection {
  GET_STARTED = 'GETTING STARTED',
  CORE = 'CORE',
  IMPORT = 'IMPORT',
  CLOUD = 'CLOUD',
}

const HelpOrganization = {
  [HelpSection.GET_STARTED]: [
    'init',
  ],
  [HelpSection.CORE]: [
    'plan',
    'apply',
    'destroy',
    'validate'
  ],
  [HelpSection.IMPORT]: [
    'import',
    'refresh',
  ],
  [HelpSection.CLOUD]: [
    'login',
    'logout',
    'edit',
    'connect',
  ]
}

export default class CustomHelp extends Help {
  formatCommands(commands: Command.Loadable[]): string {
    if (commands.length === 0) return ''

    const gettingStarted = this.formatSection(HelpSection.GET_STARTED, commands)
    const core = this.formatSection(HelpSection.CORE, commands)
    const importSection = this.formatSection(HelpSection.IMPORT, commands)
    const cloud = this.formatSection(HelpSection.CLOUD, commands)

    return this.section('COMMANDS', `${gettingStarted}\n\n${core}\n\n${importSection}\n\n${cloud}`)
  }

  formatSection(section: HelpSection, commands: Command.Loadable[]): string {
    const body = this.renderList(
      commands
        .filter((c) => HelpOrganization[section].includes(c.id))
        .filter((c) => (this.opts.hideAliasesFromRoot ? !c.aliases?.includes(c.id) : true))
        .map((c) => {
          if (this.config.topicSeparator !== ':') c.id = c.id.replaceAll(':', this.config.topicSeparator)
          const summary = this.summary(c)
          return [
            colorize(this.config?.theme?.command, c.id),
            summary && colorize(this.config?.theme?.sectionDescription, stripAnsi(summary)),
          ]
        }),
      {
        indentation: 2,
        spacer: '\n',
        stripAnsi: this.opts.stripAnsi,
      },
    )

    return `${chalk.underline(section)}\n${body}`
  }
}
