import { NoticeLevel } from '@codifycli/schemas';
import chalk from 'chalk';

import { type Notice } from '../notices/notice-evaluator.js';

export type NoticeStyle = {
  icon: string;
  // Ink / chalk color name
  color: 'cyan' | 'green' | 'yellow';
  // Used when the notice has no title
  defaultTitle: string;
}

export function noticeStyle(level: NoticeLevel): NoticeStyle {
  switch (level) {
    case NoticeLevel.INFO: {
      return { icon: 'ℹ', color: 'cyan', defaultTitle: 'Notice' };
    }

    case NoticeLevel.SUCCESS: {
      return { icon: '✔', color: 'green', defaultTitle: 'Success' };
    }

    case NoticeLevel.WARNING: {
      return { icon: '⚠', color: 'yellow', defaultTitle: 'Warning' };
    }
  }
}

export function noticeOriginLabel(notice: Notice): string | undefined {
  return notice.template ? `(from template ${notice.template})` : undefined;
}

/**
 * Splits a message into text and `code` parts. Unmatched backticks are kept as text.
 */
export function splitInlineCode(message: string): Array<{ code: boolean; text: string }> {
  const parts: Array<{ code: boolean; text: string }> = [];
  let last = 0;
  for (const match of message.matchAll(/`([^`\n]+)`/gu)) {
    if (match.index > last) {
      parts.push({ code: false, text: message.slice(last, match.index) });
    }

    parts.push({ code: true, text: match[1] });
    last = match.index + match[0].length;
  }

  if (last < message.length) {
    parts.push({ code: false, text: message.slice(last) });
  }

  return parts;
}

/** Notices as text (plain and debug reporters, plain plan output) */
export function formatNotices(notices: Notice[]): string {
  return notices.map((notice) => {
    const style = noticeStyle(notice.level);
    const color = chalk[style.color];
    const origin = noticeOriginLabel(notice);
    const header = `${color.bold(`${style.icon} ${notice.title ?? style.defaultTitle}`)}${origin ? ` ${chalk.dim(origin)}` : ''}`;
    const message = splitInlineCode(notice.message)
      .map((p) => (p.code ? chalk.cyan(p.text) : p.text))
      .join('');

    return [header, ...message.split('\n').map((line) => `  ${line}`)].join('\n');
  }).join('\n\n');
}
