import type { ReactNode } from 'react';

import { CLIENT_TOOL_NAMES } from './client-tools.js';
import type { MessageData, MessagePart } from './message-view.js';

/**
 * What the chat has printed into Ink's <Static> region (terminal scrollback).
 *
 * Ink redraws the live (non-static) area on every frame, and once that area is taller than the terminal it has to
 * clear and redraw the whole screen, which leaves a copy of every frame in the scrollback. So the live area must
 * stay small: finished parts of the running message are moved into the transcript as soon as they are final, not
 * when the whole message finishes, and only the part still in progress is rendered live.
 */
export type TranscriptItem =
  | { key: string; kind: 'apply-header'; part: MessagePart; startsMessage: boolean }
  | { key: string; kind: 'apply-result'; result: unknown }
  | { key: string; kind: 'banner' }
  | { key: string; kind: 'error'; text: string }
  | { key: string; kind: 'node'; node: ReactNode }
  | { key: string; kind: 'text'; startsMessage: boolean; text: string }
  | { key: string; kind: 'tool'; part: MessagePart; skipped: boolean; startsMessage: boolean }
  | { key: string; kind: 'user'; text: string };

export interface TranscriptCursor {
  /** Index of the first message not fully printed */
  message: number;
  /** Index of the first part of that message not yet printed */
  part: number;
  /** codify_apply calls whose header line has been printed */
  applyHeaders: Set<string>;
  /** How many reporter outputs have been printed per codify_apply call (`null`: not tied to a call) */
  artifacts: Map<null | string, number>;
  /** Whether anything of the current message has been printed (the first printed part gets the message spacing) */
  printedInMessage: boolean;
}

export function createCursor(): TranscriptCursor {
  return { message: 0, part: 0, applyHeaders: new Set(), artifacts: new Map(), printedInMessage: false };
}

/**
 * Move everything that is final into the transcript. Mutates `cursor` and returns the new items in order.
 *
 * @param settled Nothing is running: the last message is final too.
 */
export function advanceTranscript(
  messages: readonly MessageData[],
  settled: boolean,
  artifacts: ReadonlyMap<null | string, readonly ReactNode[]>,
  cursor: TranscriptCursor,
): TranscriptItem[] {
  const items: TranscriptItem[] = [];

  const takeArtifacts = (key: null | string) => {
    const nodes = artifacts.get(key) ?? [];
    for (let i = cursor.artifacts.get(key) ?? 0; i < nodes.length; i++) {
      items.push({ key: `node-${key}-${i}`, kind: 'node', node: nodes[i] });
    }

    cursor.artifacts.set(key, nodes.length);
  };

  // Reporter output that doesn't belong to a codify_apply call
  takeArtifacts(null);

  while (cursor.message < messages.length) {
    const message = messages[cursor.message];
    const isLast = cursor.message === messages.length - 1;
    const final = !isLast || settled;

    if (message.role === 'user') {
      const text = message.content.filter((p) => p.type === 'text').map((p) => p.text ?? '').join('');
      items.push({ key: `user-${message.id}-${cursor.message}`, kind: 'user', text });
      advanceMessage(cursor);
      continue;
    }

    if (message.role !== 'assistant') {
      advanceMessage(cursor);
      continue;
    }

    for (; cursor.part < message.content.length; cursor.part++) {
      const index = cursor.part;
      const part = message.content[index];
      const hasLaterPart = index < message.content.length - 1;
      const key = `${message.id}-${index}`;
      const startsMessage = !cursor.printedInMessage;

      if (part.type === 'tool-call' && part.toolName === 'codify_apply' && part.toolCallId) {
        // The plan, confirmation and apply results can be long, so they go straight into the transcript as the
        // embedded reporter produces them, under a header line for the call.
        if (!cursor.applyHeaders.has(part.toolCallId)) {
          cursor.applyHeaders.add(part.toolCallId);
          items.push({ key: `${key}-header`, kind: 'apply-header', part, startsMessage });
          cursor.printedInMessage = true;
        }

        takeArtifacts(part.toolCallId);
        if (part.result === undefined && !final) return items;
        if (part.result !== undefined) items.push({ key: `${key}-result`, kind: 'apply-result', result: part.result });
        continue;
      }

      if (part.type === 'tool-call' && part.toolName) {
        const isClientTool = CLIENT_TOOL_NAMES.has(part.toolName);
        // A server tool that Mastra skipped (it was called in the same step as a client tool) never gets a result.
        // It is done once later parts exist.
        const done = part.result !== undefined || final || (!isClientTool && hasLaterPart);
        if (!done) return items;
        items.push({ key, kind: 'tool', part, skipped: part.result === undefined, startsMessage });
        cursor.printedInMessage = true;
        continue;
      }

      if (part.type === 'text') {
        if (!hasLaterPart && !final) return items;
        if (part.text?.trim()) {
          items.push({ key, kind: 'text', startsMessage, text: part.text.trim() });
          cursor.printedInMessage = true;
        }
        continue;
      }

      // Reasoning and other parts aren't shown; a streaming one still blocks what follows
      if (!hasLaterPart && !final) return items;
    }

    if (!final) return items;

    if (message.status?.type === 'incomplete' && message.status.reason === 'error') {
      items.push({ key: `${message.id}-error`, kind: 'error', text: formatError(message.status.error) });
    }

    advanceMessage(cursor);
  }

  return items;
}

/** The parts of the running message that are not in the transcript yet */
export function liveParts(messages: readonly MessageData[], cursor: TranscriptCursor): { message: MessageData; parts: Array<{ index: number; part: MessagePart }> } | undefined {
  const message = messages[cursor.message];
  if (!message || message.role !== 'assistant') return undefined;

  const parts = message.content
    .map((part, index) => ({ index, part }))
    .slice(cursor.part)
    // codify_apply's header and output are already printed; its prompts render through the embedded reporter
    .filter(({ part }) => !(part.toolName === 'codify_apply' && part.toolCallId && cursor.applyHeaders.has(part.toolCallId)));

  return { message, parts };
}

function advanceMessage(cursor: TranscriptCursor): void {
  cursor.message++;
  cursor.part = 0;
  cursor.printedInMessage = false;
}

export function formatError(error: unknown): string {
  if (!error) return 'Something went wrong talking to the Codify agent.';
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }

  return JSON.stringify(error);
}
