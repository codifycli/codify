import { describe, expect, it } from 'vitest';

import type { MessageData } from '../../src/prompt/ui/message-view.js';
import { advanceTranscript, createCursor, liveParts } from '../../src/prompt/ui/transcript.js';

const user = (id: string, text: string): MessageData => ({ id, role: 'user', content: [{ type: 'text', text }] });
const assistant = (id: string, ...content: MessageData['content'][number][]): MessageData => ({ id, role: 'assistant', content });
const text = (t: string) => ({ type: 'text', text: t });
const tool = (toolName: string, id: string, result?: unknown) => ({ type: 'tool-call', toolName, toolCallId: id, args: {}, result });
const kinds = (items: Array<{ kind: string }>) => items.map((i) => i.kind);

describe('advanceTranscript', () => {
  it('keeps the part that is still streaming live and prints the rest as soon as it is final', () => {
    const cursor = createCursor();
    const noArtifacts = new Map();

    // Streaming text: nothing of the assistant message is final yet
    let messages = [user('u', 'upgrade node'), assistant('a', text('Let me check'))];
    expect(kinds(advanceTranscript(messages, false, noArtifacts, cursor))).toEqual(['user']);
    expect(liveParts(messages, cursor)?.parts.map((p) => p.part.type)).toEqual(['text']);

    // A tool call follows: the text is final, the running tool stays live
    messages = [messages[0], assistant('a', text('Let me check'), tool('run_command', 'c1'))];
    expect(kinds(advanceTranscript(messages, false, noArtifacts, cursor))).toEqual(['text']);
    expect(liveParts(messages, cursor)?.parts.map((p) => p.part.toolName)).toEqual(['run_command']);

    // The tool finished: it moves into the transcript even though the message is still running
    messages = [messages[0], assistant('a', text('Let me check'), tool('run_command', 'c1', { output: 'v24' }))];
    expect(kinds(advanceTranscript(messages, false, noArtifacts, cursor))).toEqual(['tool']);
    expect(liveParts(messages, cursor)?.parts).toEqual([]);

    // Nothing is printed twice
    expect(advanceTranscript(messages, false, noArtifacts, cursor)).toEqual([]);
    expect(advanceTranscript(messages, true, noArtifacts, cursor)).toEqual([]);
  });

  it('only gives the first printed part of a message the message spacing', () => {
    const cursor = createCursor();
    const items = advanceTranscript(
      [assistant('a', { type: 'reasoning', text: 'hmm' }, text('one'), tool('read_file', 'c1', {}), text('two'))],
      true, new Map(), cursor,
    );
    expect(items.map((i) => ('startsMessage' in i ? i.startsMessage : undefined))).toEqual([true, false, false]);
  });

  it('treats a server tool that never ran (same step as a client tool) as skipped once later parts exist', () => {
    const cursor = createCursor();
    const pendingServerTool = tool('search_parameter_completions', 's1');

    // The client tool is still running: wait
    expect(advanceTranscript([assistant('a', tool('run_command', 'c1'), pendingServerTool)], false, new Map(), cursor)).toEqual([]);

    // After the continuation, later parts exist: the unanswered server call is done
    const items = advanceTranscript(
      [assistant('a', tool('run_command', 'c1', { output: 'v24' }), pendingServerTool, text('Next'))],
      false, new Map(), cursor,
    );
    expect(items.map((i) => (i.kind === 'tool' ? `${i.part.toolName}:${i.skipped}` : i.kind))).toEqual(['run_command:false', 'search_parameter_completions:true']);
  });

  it('prints codify_apply output as the reporter produces it, then the result', () => {
    const cursor = createCursor();
    const artifacts = new Map<null | string, unknown[]>([['apply-1', ['PLAN']]]);
    const running = assistant('a', text('Applying'), tool('codify_apply', 'apply-1'));

    expect(kinds(advanceTranscript([running], false, artifacts as any, cursor))).toEqual(['text', 'apply-header', 'node']);
    // The running call isn't rendered live again: its prompts come from the embedded reporter
    expect(liveParts([running], cursor)?.parts).toEqual([]);

    artifacts.set('apply-1', ['PLAN', 'APPLY COMPLETE']);
    const finished = assistant('a', text('Applying'), tool('codify_apply', 'apply-1', { status: 'applied' }));
    expect(kinds(advanceTranscript([finished], false, artifacts as any, cursor))).toEqual(['node', 'apply-result']);
  });

  it('prints everything, and a server error, once the run has settled', () => {
    const cursor = createCursor();
    const failed: MessageData = { ...assistant('a', text('Partial')), status: { type: 'incomplete', reason: 'error', error: 'Out of free prompts' } };
    const items = advanceTranscript([user('u', 'hi'), failed], true, new Map(), cursor);

    expect(kinds(items)).toEqual(['user', 'text', 'error']);
    expect(items.at(-1)).toMatchObject({ text: 'Out of free prompts' });
  });

  it('prints reporter output that is not tied to a codify_apply call', () => {
    const items = advanceTranscript([], true, new Map([[null, ['note']]]) as any, createCursor());
    expect(kinds(items)).toEqual(['node']);
  });
});
