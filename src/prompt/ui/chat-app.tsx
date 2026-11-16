import { useChatRuntime } from '@assistant-ui/ai-sdk';
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  Tools,
  type Toolkit,
  useAui,
  useAuiState,
} from '@assistant-ui/react-ink';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from 'ai';
import cliSpinners from 'cli-spinners';
import { Box, Static, Text } from 'ink';
import SelectInput from 'ink-select-input';
import React, { type ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { AgentApi } from '../agent-api.js';
import type { AgentAuth } from '../auth.js';
import type { ToolHost } from '../tool-host.js';
import { formatError, type MessageData, MessageView } from './message-view.js';

export interface ChatAppProps {
  api: AgentApi;
  auth: AgentAuth;
  host: ToolHost;
  initialMessages: UIMessage[];
  /** Existing thread when resuming */
  threadId?: string;
  initialPrompt?: string;
}

// The server owns tool schemas and descriptions (they're registered as client tools on the agent); the CLI only
// executes them. A permissive schema keeps the AI SDK from rejecting arguments the server already validated.
const ANY_ARGS = { type: 'object', additionalProperties: true } as const;

/** Tools the CLI executes locally. Their results have to be sent back to the agent. */
export const CLIENT_TOOL_NAMES = new Set(['read_file', 'list_directory', 'search_files', 'run_command', 'codify_plan', 'codify_apply']);

/**
 * Continue the run once every client tool call in the newest step has a result. Server tools (registry lookups,
 * `ask_question`) already ran on the server: a step with only those is finished, and `ask_question` in particular
 * must wait for the user's answer instead of being resubmitted.
 */
export function shouldSendToolResults({ messages }: { messages: UIMessage[] }): boolean {
  if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) return false;

  const parts = messages.at(-1)?.parts ?? [];
  const lastStepStart = parts.map((p) => p.type).lastIndexOf('step-start');
  const lastStepTools = parts.slice(lastStepStart + 1).flatMap((p) => {
    if (p.type === 'dynamic-tool') return [(p as { toolName: string }).toolName];
    return p.type.startsWith('tool-') ? [p.type.slice('tool-'.length)] : [];
  });

  return lastStepTools.some((name) => CLIENT_TOOL_NAMES.has(name)) && !lastStepTools.includes('ask_question');
}

function buildToolkit(host: ToolHost): Toolkit {
  const tool = (description: string, execute: (args: any, context: { toolCallId: string }) => Promise<unknown>) => ({
    description,
    parameters: ANY_ARGS as any,
    execute: async (args: unknown, context: { toolCallId: string }) => {
      try {
        return await execute(args, context);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
    render: () => null,
  });

  return {
    read_file: tool('Read a file', (args) => host.readFile(args)),
    list_directory: tool('List a directory', (args) => host.listDirectory(args)),
    search_files: tool('Search files', (args) => host.searchFiles(args)),
    run_command: tool('Run a read-only command', (args) => host.runCommand(args)),
    codify_plan: tool('Plan a config', (args) => host.codifyPlan(args)),
    codify_apply: tool('Apply a config', (args, { toolCallId }) => host.codifyApply(args, toolCallId)),
  } as unknown as Toolkit;
}

export function ChatApp(props: ChatAppProps) {
  const threadIdRef = useRef<null | string>(props.threadId ?? null);
  props.host.threadId = threadIdRef.current;
  const [transportError, setTransportError] = useState<null | string>(null);

  const transport = useMemo(() => new DefaultChatTransport<UIMessage>({
    api: props.api.chatUrl(),
    headers: props.api.authHeaders(),
    async prepareSendMessagesRequest({ messages }) {
      const last = messages.at(-1);
      if (!threadIdRef.current) {
        const firstText = last?.parts.find((p) => p.type === 'text') as { text?: string } | undefined;
        const thread = await props.api.createThread(titleFrom(firstText?.text));
        threadIdRef.current = thread.id;
        props.host.threadId = thread.id;
      }

      // Mastra memory holds the history: send only the newest message (a user prompt, or an assistant message
      // carrying client tool results).
      return {
        body: {
          messages: last ? [last] : [],
          memory: { thread: threadIdRef.current, resource: props.auth.userId },
        },
      };
    },
  }), [props.api, props.auth.userId, props.host]);

  const runtime = useChatRuntime({
    transport,
    messages: props.initialMessages,
    sendAutomaticallyWhen: shouldSendToolResults,
    onError: (error) => setTransportError(error.message),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Chat {...props} clearTransportError={() => setTransportError(null)} transportError={transportError} />
    </AssistantRuntimeProvider>
  );
}

type TranscriptItem =
  | { key: string; kind: 'artifact'; node: ReactNode }
  | { key: string; kind: 'banner' }
  | { key: string; kind: 'message'; message: MessageData };

function Chat(props: ChatAppProps & { clearTransportError: () => void; transportError: null | string; }) {
  const { host } = props;
  const toolkit = useMemo(() => buildToolkit(host), [host]);
  const aui = useAui({ tools: Tools({ toolkit }) });

  const messages = useAuiState((s) => s.thread.messages) as unknown as readonly MessageData[];
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const approval = useSyncExternalStore(host.approval.subscribe, host.approval.get);
  const busy = useSyncExternalStore(host.busy.subscribe, host.busy.get);
  const artifacts = useSyncExternalStore(host.artifacts.subscribe, host.artifacts.get);

  // Finished messages move into Ink's <Static> region (terminal scrollback) and are never redrawn. Only the
  // in-progress message stays live. Items are append-only: <Static> prints each new item exactly once.
  const [transcript, setTranscript] = useState<TranscriptItem[]>([{ key: 'banner', kind: 'banner' }]);
  const graduated = useRef(0);
  const looseArtifacts = useRef(0);

  const last = messages.at(-1);
  const lastIsSettled = !isRunning && !busy && !approval
    && last?.status?.type !== 'running' && last?.status?.type !== 'requires-action';
  const cutoff = lastIsSettled ? messages.length : Math.max(0, messages.length - 1);

  useEffect(() => {
    const additions: TranscriptItem[] = [];
    for (; graduated.current < cutoff; graduated.current++) {
      const message = messages[graduated.current];
      additions.push({ key: `m-${message.id}-${graduated.current}`, kind: 'message', message });
    }

    const loose = artifacts.get(null) ?? [];
    for (; looseArtifacts.current < loose.length; looseArtifacts.current++) {
      additions.push({ key: `a-${looseArtifacts.current}`, kind: 'artifact', node: loose[looseArtifacts.current] });
    }

    if (additions.length > 0) setTranscript((items) => [...items, ...additions]);
  }, [cutoff, messages, artifacts]);

  // Send a prompt given on the command line (`codify prompt "upgrade node"`)
  const sentInitial = useRef(false);
  useEffect(() => {
    if (props.initialPrompt && !sentInitial.current) {
      sentInitial.current = true;
      aui.thread().append(props.initialPrompt);
    }
  }, []);

  const liveMessage = cutoff < messages.length ? messages.at(-1) : undefined;
  const question = lastIsSettled ? pendingQuestion(last) : undefined;
  const [otherSelected, setOtherSelected] = useState(false);
  useEffect(() => setOtherSelected(false), [last?.id]);

  const showComposer = !isRunning && !busy && !approval && (!question || otherSelected);

  return (
    <>
      <Static items={transcript}>
        {(item) => {
          switch (item.kind) {
            case 'banner': { return <Banner auth={props.auth} key={item.key} resumed={props.initialMessages.length > 0} />; }
            case 'artifact': { return <Box key={item.key}>{item.node}</Box>; }
            case 'message': { return <MessageView artifacts={artifacts} key={item.key} message={item.message} />; }
          }
        }}
      </Static>

      {liveMessage && <MessageView artifacts={artifacts} message={liveMessage} />}

      {isRunning && !approval && !busy && <Spinner label="Thinking" />}

      {props.transportError && !isRunning && !(last?.status?.type === 'incomplete' && last.status.reason === 'error') && (
        <Box marginTop={1}><Text color="red">{props.transportError}</Text></Box>
      )}

      {approval && (
        <Box borderColor="yellow" borderStyle="round" flexDirection="column" marginTop={1} paddingX={1}>
          <Text bold>{approval.asRoot ? 'Run as root?' : 'Allow this command?'}</Text>
          <Text color="cyan">{approval.command}</Text>
          <Text dimColor>{approval.reason}</Text>
          <SelectInput
            items={[{ label: 'Yes, run it', value: 'yes' }, { label: 'No', value: 'no' }]}
            onSelect={(item) => approval.resolve(item.value === 'yes')}
          />
        </Box>
      )}

      {/* The plan / confirmation / apply progress UI, sudo prompts, etc. */}
      {host.reporter.element}

      {question && !otherSelected && (
        <Box flexDirection="column" marginTop={1}>
          <SelectInput
            items={[
              ...question.options.map((o) => ({ key: o.value, label: o.label, value: o.label })),
              ...(question.allowOther ? [{ key: '__other', label: 'Other…', value: '__other' }] : []),
            ]}
            onSelect={(item) => {
              if (item.value === '__other') {
                setOtherSelected(true);
              } else {
                props.clearTransportError();
                aui.thread().append(item.value);
              }
            }}
          />
        </Box>
      )}

      {showComposer && (
        <Box borderColor="gray" borderStyle="round" marginTop={1} paddingX={1}>
          <Text color="cyan">{'› '}</Text>
          <ComposerPrimitive.Input
            autoFocus
            placeholder={messages.length === 0 ? 'Describe a change, e.g. "upgrade node to the latest LTS"' : 'Reply…'}
            submitOnEnter
          />
        </Box>
      )}
      {showComposer && <Text dimColor>{'  Enter to send · Ctrl+C to exit'}</Text>}
    </>
  );
}

function Banner(props: { auth: AgentAuth; resumed: boolean }) {
  return (
    <Box flexDirection="column">
      <Text bold color="magenta">Codify agent</Text>
      <Text dimColor>
        {props.resumed ? 'Resuming your conversation. ' : ''}
        Describe a change and Codify will plan it against this machine. Nothing is applied without your approval.
      </Text>
      {props.auth.isAnonymous && (
        <Text dimColor>Not logged in: you have a few free prompts. Run `codify login` to keep going.</Text>
      )}
    </Box>
  );
}

function Spinner(props: { label: string }) {
  const { frames, interval } = cliSpinners.dots;
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % frames.length), interval);
    return () => clearInterval(timer);
  }, []);

  return <Box marginTop={1}><Text color="magenta">{frames[frame]} </Text><Text dimColor>{props.label}…</Text></Box>;
}

interface QuestionArgs {
  allowOther?: boolean;
  options: Array<{ label: string; value: string }>;
  question: string;
}

/** The agent's last action was ask_question and the user hasn't answered yet */
function pendingQuestion(message: MessageData | undefined): QuestionArgs | undefined {
  if (message?.role !== 'assistant') return undefined;
  const toolCalls = message.content.filter((p) => p.type === 'tool-call');
  const lastCall = toolCalls.at(-1);
  if (lastCall?.toolName !== 'ask_question') return undefined;
  const args = lastCall.args as QuestionArgs | undefined;
  return args && Array.isArray(args.options) ? args : undefined;
}

function titleFrom(text: string | undefined): string {
  const clean = (text ?? '').replaceAll(/\s+/g, ' ').trim();
  return clean.length > 60 ? clean.slice(0, 57) + '…' : clean || 'New chat';
}

export { formatError };
