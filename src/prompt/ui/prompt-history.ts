import type { MessageData } from './message-view.js';

/**
 * Shell-style prompt history: the user's previous prompts in this thread, oldest first. Includes messages loaded with
 * `--resume`. Consecutive repeats collapse into one entry, like HISTCONTROL=ignoredups.
 */
export function promptHistory(messages: readonly MessageData[]): string[] {
  const history: string[] = [];
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const text = message.content
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    if (text && history.at(-1) !== text) history.push(text);
  }

  return history;
}

/** Position in the history: an index into it, or null for the fresh (empty) prompt below the newest entry */
export type HistoryIndex = null | number;

/**
 * Moves through the history with the arrow keys. Returns the new position and the text to show, or undefined when
 * the key does nothing (no history, already at the oldest entry, or down on the fresh prompt).
 */
export function stepHistory(
  history: readonly string[],
  index: HistoryIndex,
  direction: 'down' | 'up',
): undefined | { index: HistoryIndex; text: string } {
  if (history.length === 0) return undefined;

  if (direction === 'up') {
    const next = index === null ? history.length - 1 : index - 1;
    if (next < 0) return undefined;
    return { index: next, text: history[next] };
  }

  if (index === null) return undefined;
  const next = index + 1;
  return next >= history.length ? { index: null, text: '' } : { index: next, text: history[next] };
}

/**
 * Arrow keys only browse while the prompt is empty or still shows the recalled entry unchanged, so they never wipe
 * out something the user typed. Returns the position to step from, or undefined to leave the key alone.
 */
export function browseFrom(history: readonly string[], index: HistoryIndex, composerText: string): HistoryIndex | undefined {
  if (index !== null && history[index] === composerText) return index;
  if (composerText === '') return null;
  return undefined;
}
