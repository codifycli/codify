import { Box, Text } from 'ink';
import React from 'react';

import { type Notice } from '../../../notices/notice-evaluator.js';
import { noticeOriginLabel, noticeStyle, splitInlineCode } from '../../notice-formatter.js';

/** Notices of the config. Shown with the plan (stage plan) and after the apply (stage apply). */
export function NoticeList({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {notices.map((notice, idx) => {
        const style = noticeStyle(notice.level);
        const origin = noticeOriginLabel(notice);

        return (
          <Box flexDirection="column" key={idx} marginBottom={idx === notices.length - 1 ? 0 : 1}>
            <Box>
              <Text bold color={style.color}>{`${style.icon} ${notice.title ?? style.defaultTitle}`}</Text>
              {origin && <Text dimColor>{` ${origin}`}</Text>}
            </Box>
            <Box borderBottom={false} borderColor={style.color} borderRight={false} borderStyle="single" borderTop={false} marginLeft={1} paddingLeft={1}>
              <Text>{splitInlineCode(notice.message).map((part, i) => (
                part.code ? <Text color="cyan" key={i}>{part.text}</Text> : <Text key={i}>{part.text}</Text>
              ))}</Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
