import { Args, Flags } from '@oclif/core';

import { BaseCommand } from '../common/base-command.js';
import { PromptOrchestrator } from '../orchestrators/prompt.js';
import { ToolHost } from '../prompt/tool-host.js';
import { Reporter } from '../ui/reporters/reporter.js';

export default class Prompt extends BaseCommand {
  static description =
`Chat with the Codify agent from your terminal.

Describe a change ("upgrade node to the latest LTS", "set up a python data science
environment") and the agent builds a Codify config for it, plans it against this
machine and asks you before applying anything. It can also inspect your machine with
read-only commands to help debug issues. Commands that could change your system,
and anything with sudo, always ask for your approval first.

Configs the agent applies are saved under ~/.codify/sessions; your project files are
never modified. Running ${'`codify`'} with no command starts this chat.

For more information, visit: https://codifycli.com/docs/commands/prompt`

  static strict = false;

  static args = {
    prompt: Args.string({ description: 'Start the conversation with this message' }),
  }

  static flags = {
    resume: Flags.boolean({ char: 'r', description: 'Continue a previous conversation.', default: false }),
  }

  static examples = [
    '<%= config.bin %>',
    '<%= config.bin %> <%= command.id %> "upgrade node to the latest LTS"',
    '<%= config.bin %> <%= command.id %> --resume',
  ]

  private host!: ToolHost;

  protected createReporter(): Reporter {
    this.host = new ToolHost();
    return this.host.reporter;
  }

  public async run(): Promise<void> {
    const { argv, flags } = await this.parse(Prompt);
    const prompt = (argv as string[]).join(' ').trim();

    await PromptOrchestrator.run({ resume: flags.resume, prompt: prompt || undefined }, this.host);
    process.exit(0);
  }
}
