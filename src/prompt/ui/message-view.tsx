import { Box, Text, useWindowSize } from 'ink';
import React from 'react';

import { ApplyResultSummary, describeToolCall, ToolCallSummary } from './tool-summary.js';
import type { TranscriptItem } from './transcript.js';

export { formatError } from './transcript.js';

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

/** One item of the transcript, printed once through <Static> */
export function TranscriptItemView(props: { item: Exclude<TranscriptItem, { kind: 'banner' }> }) {
  const { item } = props;

  switch (item.kind) {
    case 'user': {
      return (
        <Box marginTop={1}>
          <Text bold color="cyan">{'› '}</Text>
          <Text bold>{item.text}</Text>
        </Box>
      );
    }

    case 'text': {
      return <Box marginTop={item.startsMessage ? 1 : 0}><Text>{item.text}</Text></Box>;
    }

    case 'tool': {
      return (
        <Box marginTop={item.startsMessage ? 1 : 0}>
          <ToolCallSummary args={item.part.args} isError={item.part.isError} result={item.part.result} skipped={item.skipped} toolName={item.part.toolName!} />
        </Box>
      );
    }

    case 'apply-header': {
      // Printed before the outcome is known; the result line below it says how it ended
      return (
        <Box marginTop={item.startsMessage ? 1 : 0}>
          <Text><Text color="magenta">{'▸ '}</Text><Text bold>{describeToolCall('codify_apply', (item.part.args ?? {}) as Record<string, unknown>)}</Text></Text>
        </Box>
      );
    }

    case 'apply-result': {
      return <Box marginLeft={2}><ApplyResultSummary result={item.result} /></Box>;
    }

    case 'node': {
      return <Box marginLeft={2}>{item.node}</Box>;
    }

    case 'error': {
      return <Box marginTop={1}><Text color="red">{item.text}</Text></Box>;
    }
  }
}

// Leave room for the spinner, prompts and composer below the live tail
const RESERVED_ROWS = 8;

/**
 * The parts of the running message that aren't final yet. Usually one streaming text part or a running tool.
 * Streaming text is cut to its last lines so the live area never outgrows the terminal (see transcript.ts); the full
 * text is printed into the transcript once it's final.
 */
export function LivePartsView(props: { parts: Array<{ index: number; part: MessagePart }>; startsMessage: boolean }) {
  const { columns, rows } = useWindowSize();

  return (
    <Box flexDirection="column" marginTop={props.startsMessage ? 1 : 0}>
      {props.parts.map(({ index, part }) => {
        if (part.type === 'text' && part.text?.trim()) {
          return <Text key={index}>{tailLines(part.text.trim(), Math.max(3, rows - RESERVED_ROWS), columns)}</Text>;
        }

        if (part.type === 'tool-call' && part.toolName) {
          return <ToolCallSummary args={part.args} isError={part.isError} key={part.toolCallId ?? index} result={part.result} toolName={part.toolName} />;
        }

        return null;
      })}
    </Box>
  );
}

/** The last lines of `text` that fit in `maxRows` terminal rows of `columns` width */
export function tailLines(text: string, maxRows: number, columns: number): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  let used = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const height = Math.max(1, Math.ceil(lines[i].length / Math.max(1, columns)));
    if (used + height > maxRows - 1 && kept.length > 0) {
      return ['…', ...kept].join('\n');
    }

    used += height;
    kept.unshift(lines[i]);
  }

  return kept.join('\n');
}
