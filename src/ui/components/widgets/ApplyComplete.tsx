import { Box, Text } from 'ink';
import React from 'react';

import { ApplyResult } from '../../../entities/apply-result.js';
import { ResourcePlan } from '../../../entities/plan.js';
import { applyEntryInkColor, applyEntryLabel } from '../../apply-result-formatter.js';
import { prettyFormatResourcePlan } from '../../plan-pretty-printer.js';

export function ApplyComplete({ result }: { result: ApplyResult }) {
  const isPartial = result.isPartialFailure();

  const validationErrors = isPartial
    ? result.errors
      .filter((e) => e.errorData.errorType === 'apply_validation')
      .map((e) => ({
        plan: new ResourcePlan((e.errorData.data as any).plan),
        logs: ((e.errorData.data as any).logs ?? []) as string[],
      }))
    : [];

  const genericErrors = isPartial
    ? result.errors
      .filter((e) => e.errorData.errorType !== 'apply_validation')
      .map((e) => e.message)
    : [];

  return (
    <Box flexDirection="column" marginTop={1}>

      {validationErrors.map((entry) => (
        <Box key={entry.plan.id} flexDirection="column" marginBottom={1}>
          <Box>
            <Text color="red" bold>{'● FAILED  '}</Text>
            <Text bold>{entry.plan.id}</Text>
          </Box>
          <Box flexDirection="column" borderStyle="single" borderColor="red" borderRight={false} borderTop={false} borderBottom={false} paddingLeft={1} marginLeft={1} marginTop={1}>
            <Text dimColor>Resource did not reach its desired state after apply.</Text>
            <Box flexDirection="column" marginTop={1}>
              <Text bold>Changes still needed:</Text>
              <Text>{prettyFormatResourcePlan(entry.plan)}</Text>
            </Box>
            {entry.logs.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Text bold>Apply output:</Text>
                <Text dimColor>{entry.logs.join('\n')}</Text>
              </Box>
            )}
          </Box>
        </Box>
      ))}

      {genericErrors.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {genericErrors.map((msg, i) => (
            <Box key={i}>
              <Text color="red" bold>{'● ERROR  '}</Text>
              <Text>{msg}</Text>
            </Box>
          ))}
        </Box>
      )}

      {isPartial && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="red" bold>Potential fixes:</Text>
          <Text color="red">{'  1. Re-run with verbose logging (--verbose or press \'v\' during apply)'}</Text>
          <Text color="red">{'  2. Manually install the failed resource and retry'}</Text>
          <Text color="red">{'  3. Reach out to support at https://github.com/codifycli/default-plugin/issues'}</Text>
        </Box>
      )}

      <Text dimColor>{'─'.repeat(40)}</Text>

      <Box marginTop={1}>
        <Text bold color={isPartial ? 'red' : 'green'}>
          {isPartial ? '⚠ Apply completed with errors' : '🎉 Finished applying 🎉'}
        </Text>
      </Box>

      {result.entries.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {result.entries.map((entry) => (
            <Box key={entry.id}>
              <Text dimColor={entry.status === 'skipped'}>{entry.id.padEnd(30)}</Text>
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
