import { describe, expect, it } from 'vitest';

import type { MessageData } from '../../src/prompt/ui/message-view.js';
import { browseFrom, promptHistory, stepHistory } from '../../src/prompt/ui/prompt-history.js';

const user = (text: string): MessageData => ({ id: text, role: 'user', content: [{ type: 'text', text }] });
const assistant = (text: string): MessageData => ({ id: `a-${text}`, role: 'assistant', content: [{ type: 'text', text }] });

describe('promptHistory', () => {
  it('keeps only user prompts, oldest first, without consecutive repeats or blanks', () => {
    const messages = [user('install node'), assistant('ok'), user('install node'), user('  '), assistant('hi'), user('add git')];
    expect(promptHistory(messages)).toEqual(['install node', 'add git']);
  });

  it('keeps non-consecutive repeats', () => {
    expect(promptHistory([user('a'), user('b'), user('a')])).toEqual(['a', 'b', 'a']);
  });
});

describe('stepHistory', () => {
  const history = ['first', 'second', 'third'];

  it('walks up from the fresh prompt to the oldest entry and stops there', () => {
    expect(stepHistory(history, null, 'up')).toEqual({ index: 2, text: 'third' });
    expect(stepHistory(history, 2, 'up')).toEqual({ index: 1, text: 'second' });
    expect(stepHistory(history, 1, 'up')).toEqual({ index: 0, text: 'first' });
    expect(stepHistory(history, 0, 'up')).toBeUndefined();
  });

  it('walks down and returns to an empty prompt past the newest entry', () => {
    expect(stepHistory(history, 0, 'down')).toEqual({ index: 1, text: 'second' });
    expect(stepHistory(history, 2, 'down')).toEqual({ index: null, text: '' });
    expect(stepHistory(history, null, 'down')).toBeUndefined();
  });

  it('does nothing without history', () => {
    expect(stepHistory([], null, 'up')).toBeUndefined();
  });
});

describe('browseFrom', () => {
  const history = ['first', 'second'];

  it('browses from an empty prompt', () => {
    expect(browseFrom(history, null, '')).toBeNull();
    // The user cleared a recalled entry: start over from the newest
    expect(browseFrom(history, 0, '')).toBeNull();
  });

  it('keeps browsing while the recalled entry is unchanged', () => {
    expect(browseFrom(history, 0, 'first')).toBe(0);
  });

  it('leaves typed or edited text alone', () => {
    expect(browseFrom(history, null, 'upgrade')).toBeUndefined();
    expect(browseFrom(history, 0, 'first!')).toBeUndefined();
  });
});
