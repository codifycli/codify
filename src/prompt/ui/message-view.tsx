import { Box, Text } from 'ink';
import React, { type ReactNode } from 'react';

import { ApplyResultSummary, ToolCallSummary } from './tool-summary.js';

export interface MessagePart {
  type: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
}

export interface MessageData {
  id: string;
  role: string;
  content: readonly MessagePart[];
  status?: { error?: unknown; reason?: string; type: string; };
}

/**
 * Renders one chat message from plain data. Used both for the live (running) message and for finished messages in
 * the transcript, which Ink prints once through <Static>.
 */
export function MessageView(props: { artifacts?: ReadonlyMap<null | string, readonly ReactNode[]>; message: MessageData; }) {
  const { message } = props;

  if (message.role === 'user') {
    const text = message.content.filter((p) => p.type === 'text').map((p) => p.text).join('');
    return (
      <Box marginTop={1}>
        <Text color="cyan" bold>{'› '}</Text>
        <Text bold>{text}</Text>
      </Box>
    );
  }

  const error = message.status?.type === 'incomplete' && message.status.reason === 'error'
    ? formatError(message.status.error)
    : undefined;

  return (
    <Box flexDirection="column" marginTop={1}>
      {message.content.map((part, index) => {
        if (part.type === 'text' && part.text?.trim()) {
          return <Text key={index}>{part.text.trim()}</Text>;
        }

        if (part.type === 'tool-call' && part.toolName) {
          return (
            <Box flexDirection="column" key={part.toolCallId ?? index}>
              <ToolCallSummary args={part.args} isError={part.isError} result={part.result} toolName={part.toolName} />
              {part.toolName === 'codify_apply' && (
                <Box flexDirection="column" marginLeft={2}>
                  {(props.artifacts?.get(part.toolCallId ?? '') ?? []).map((node, i) => <Box key={i}>{node}</Box>)}
                  {part.result !== undefined && <ApplyResultSummary result={part.result} />}
                </Box>
              )}
            </Box>
          );
        }

        return null;
      })}
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
}

export function formatError(error: unknown): string {
  if (!error) return 'Something went wrong talking to the Codify agent.';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }

  return JSON.stringify(error);
}
