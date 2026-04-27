import { Box, Text } from 'ink';
import React from 'react';

import { ApplyResult } from '../../../entities/apply-result.js';
import { applyEntryInkColor, applyEntryLabel } from '../../apply-result-formatter.js';

export function ApplyComplete({ result }: { result: ApplyResult }) {
  const isPartial = result.isPartialFailure();
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color={isPartial ? 'red' : 'green'}>
        {isPartial ? '⚠ Apply completed with errors' : '🎉 Finished applying 🎉'}
      </Text>
      {result.entries.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {result.entries.map((entry) => (
            <Box key={entry.id}>
              <Text>{entry.id.padEnd(30)}</Text>
              <Text color={applyEntryInkColor(entry)}>{applyEntryLabel(entry)}</Text>
            </Box>
          ))}
        </Box>
      )}
      {!isPartial && (
        <Box marginTop={1}>
          <Text dimColor>Open a new terminal or source &apos;.zshrc&apos; for the new changes to be reflected</Text>
        </Box>
      )}
    </Box>
  );
}
