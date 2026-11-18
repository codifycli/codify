import { useChatRuntime } from '@assistant-ui/ai-sdk';
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  Tools,
  type Toolkit,
  useAui,
  useAuiState,
} from '@assistant-ui/react-ink';
import { DefaultChatTransport, type UIMessage } from 'ai';
import cliSpinners from 'cli-spinners';
import { Box, Static, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { AgentApi } from '../agent-api.js';
import type { AgentAuth } from '../auth.js';
import type { ToolHost } from '../tool-host.js';
import { shouldSendToolResults } from './client-tools.js';
import { formatError, LivePartsView, type MessageData, TranscriptItemView } from './message-view.js';
import { browseFrom, type HistoryIndex, promptHistory, stepHistory } from './prompt-history.js';
import { advanceTranscript, createCursor, liveParts, type TranscriptItem } from './transcript.js';

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

export { CLIENT_TOOL_NAMES, shouldSendToolResults } from './client-tools.js';

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
    codify_inspect: tool('Inspect what is installed', (args) => host.codifyInspect(args)),
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

function Chat(props: ChatAppProps & { clearTransportError: () => void; transportError: null | string; }) {
  const { host } = props;
  const toolkit = useMemo(() => buildToolkit(host), [host]);
  const aui = useAui({ tools: Tools({ toolkit }) });

  const messages = useAuiState((s) => s.thread.messages) as unknown as readonly MessageData[];
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const approval = useSyncExternalStore(host.approval.subscribe, host.approval.get);
  const busy = useSyncExternalStore(host.busy.subscribe, host.busy.get);
  const artifacts = useSyncExternalStore(host.artifacts.subscribe, host.artifacts.get);

  const last = messages.at(-1);
  const lastIsSettled = !isRunning && !busy && !approval
    && last?.status?.type !== 'running' && last?.status?.type !== 'requires-action';

  // Everything final is printed once through Ink's <Static> (terminal scrollback) and never redrawn; only the part
  // still in progress stays live. See transcript.ts for why the live area has to stay small.
  const [transcript, setTranscript] = useState<TranscriptItem[]>([{ key: 'banner', kind: 'banner' }]);
  const cursor = useRef(createCursor());

  useEffect(() => {
    const additions = advanceTranscript(messages, lastIsSettled, artifacts, cursor.current);
    if (additions.length > 0) setTranscript((items) => [...items, ...additions]);
  }, [messages, lastIsSettled, artifacts]);

  // Send a prompt given on the command line (`codify prompt "upgrade node"`)
  const sentInitial = useRef(false);
  useEffect(() => {
    if (props.initialPrompt && !sentInitial.current) {
      sentInitial.current = true;
      aui.thread().append(props.initialPrompt);
    }
  }, []);

  const live = liveParts(messages, cursor.current);
  const question = lastIsSettled ? pendingQuestion(last) : undefined;
  const [otherSelected, setOtherSelected] = useState(false);
  useEffect(() => setOtherSelected(false), [last?.id]);

  const showComposer = !isRunning && !busy && !approval && (!question || otherSelected);

  // Up / down browse previous prompts, like a shell. The single-line composer input ignores these keys, and the hook is
  // inactive whenever a SelectInput (approval, ask_question) owns them.
  const composerText = useAuiState((s) => s.composer.text);
  const history = useMemo(() => promptHistory(messages), [messages]);
  const historyIndex = useRef<HistoryIndex>(null);
  useEffect(() => {
    historyIndex.current = null;
  }, [history.length]);

  useInput((_input, key) => {
    if (!key.upArrow && !key.downArrow) return;
    const from = browseFrom(history, historyIndex.current, composerText);
    if (from === undefined) return;
    const step = stepHistory(history, from, key.upArrow ? 'up' : 'down');
    if (!step) return;
    historyIndex.current = step.index;
    aui.composer().setText(step.text);
  }, { isActive: showComposer });

  return (
    <>
      <Static items={transcript}>
        {(item) => item.kind === 'banner'
          ? <Banner auth={props.auth} key={item.key} resumed={props.initialMessages.length > 0} />
          : <TranscriptItemView item={item} key={item.key} />}
      </Static>

      {/* While a command waits for approval, the prompt below already shows it */}
      {live && live.parts.length > 0 && !approval && <LivePartsView parts={live.parts} startsMessage={!cursor.current.printedInMessage} />}

      {isRunning && !approval && !busy && <Spinner label="Thinking" />}

      {props.transportError && !isRunning && !(last?.status?.type === 'incomplete' && last.status.reason === 'error') && (
        <Box marginTop={1}><Text color="red">{props.transportError}</Text></Box>
      )}

      {approval && (
        <Box flexDirection="column" marginTop={1}>
          <Text><Text bold color="yellow">{approval.asRoot ? 'Run as root? ' : 'Allow this command? '}</Text><Text color="cyan">{approval.command}</Text></Text>
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
      {showComposer && <Text dimColor>{`  Enter to send${history.length > 0 ? ' · ↑↓ history' : ''} · Ctrl+C to exit`}</Text>}
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
