import chalk from 'chalk';
import { Box, render, Text } from 'ink';
import SelectInput from '../ui/components/widgets/SelectInput.js';
import React from 'react';

import { AgentApi, AgentApiError, type AgentThread } from '../prompt/agent-api.js';
import { PromptAuth } from '../prompt/auth.js';
import { ToolHost } from '../prompt/tool-host.js';
import { ChatApp } from '../prompt/ui/chat-app.js';

export interface PromptArgs {
  /** Pick a previous CLI conversation to continue */
  resume?: boolean;
  /** Send this as the first message */
  prompt?: string;
}

export const PromptOrchestrator = {
  async run(args: PromptArgs, host: ToolHost): Promise<void> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('codify prompt needs an interactive terminal.');
    }

    const auth = await PromptAuth.get();
    const api = new AgentApi(auth);

    let thread: AgentThread | undefined;
    if (args.resume) {
      thread = await pickThread(api);
      if (!thread) return;
    }

    const initialMessages = thread ? await api.getMessages(thread.id) : [];

    const app = render(
      <ChatApp
        api={api}
        auth={auth}
        host={host}
        initialMessages={initialMessages}
        initialPrompt={args.prompt}
        threadId={thread?.id}
      />,
      // Always interactive: we checked for a TTY above. Ink otherwise switches to non-interactive output whenever
      // CI is set (it would only draw the composer, prompts and spinner once, on exit).
      { exitOnCtrlC: true, interactive: true },
    );

    await app.waitUntilExit();
  },
};

async function pickThread(api: AgentApi): Promise<AgentThread | undefined> {
  let threads: AgentThread[];
  try {
    threads = await api.listThreads();
  } catch (error) {
    if (error instanceof AgentApiError && error.status === 401) {
      throw new Error('Your Codify session has expired. Run `codify login` and try again.');
    }

    throw error;
  }

  if (threads.length === 0) {
    console.log(chalk.yellow('No previous conversations found. Starting a new one.'));
    return undefined;
  }

  return new Promise<AgentThread | undefined>((resolve) => {
    const picker = render(
      <Box flexDirection="column">
        <Text bold>Resume a conversation:</Text>
        <SelectInput
          items={threads.map((t) => ({ key: t.id, label: `${t.title}  ${chalk.dim(relativeTime(t.updatedAt))}`, value: t.id }))}
          limit={10}
          onSelect={(item) => {
            picker.unmount();
            resolve(threads.find((t) => t.id === item.value));
          }}
        />
      </Box>,
      { interactive: true },
    );
    picker.waitUntilExit().then(() => resolve(undefined));
  });
}

function relativeTime(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
