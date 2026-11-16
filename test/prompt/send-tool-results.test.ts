import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { shouldSendToolResults } from '../../src/prompt/ui/chat-app.js';

const assistant = (...parts: unknown[]) => ({ messages: [{ id: 'a', role: 'assistant', parts } as UIMessage] });
const done = (name: string, id = name) => ({ type: `tool-${name}`, toolCallId: id, state: 'output-available', input: {}, output: {} });

describe('shouldSendToolResults', () => {
  it('continues once every client tool in the newest step has a result', () => {
    expect(shouldSendToolResults(assistant({ type: 'step-start' }, done('read_file')))).toBe(true);
    expect(shouldSendToolResults(assistant({ type: 'step-start' }, done('run_command'), done('search_files')))).toBe(true);
  });

  it('waits while a client tool is still running', () => {
    expect(shouldSendToolResults(assistant(
      { type: 'step-start' }, done('read_file'), { type: 'tool-codify_apply', toolCallId: 'x', state: 'input-available', input: {} },
    ))).toBe(false);
  });

  it('does not resubmit for ask_question: the user has to answer it', () => {
    expect(shouldSendToolResults(assistant({ type: 'step-start' }, done('ask_question')))).toBe(false);
  });

  it('does not resubmit a step that only used server tools', () => {
    expect(shouldSendToolResults(assistant({ type: 'step-start' }, done('read_file'), { type: 'step-start' }, done('search_resources')))).toBe(false);
  });
});
