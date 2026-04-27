import { Box, Static, Text } from 'ink';
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
        .map((e) => new ResourcePlan((e.errorData.data as any).plan))
    : [];

  const genericErrors = isPartial
    ? result.errors
        .filter((e) => e.errorData.errorType !== 'apply_validation')
        .map((e) => e.message)
    : [];

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

      {validationErrors.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {validationErrors.map((resourcePlan) => (
            <Box key={resourcePlan.id} flexDirection="column">
              <Text color="red" bold>
                {`Apply failed: resource "${resourcePlan.id}" did not reach its desired state.`}
              </Text>
              <Text> </Text>
              <Text bold backgroundColor={'red'}>Changes still needed:</Text>
              <Text>{prettyFormatResourcePlan(resourcePlan)}</Text>
              <Text> </Text>
            </Box>
          ))}
          <Text color="red" bold>Potential fixes:</Text>
          <Text color="red" bold>{'  1. Re-run the command again'}</Text>
          <Text color="red" bold>{'  2. Manually install the resource and retry'}</Text>
          <Text color="red" bold>{'  3. Reach out to support at https://github.com/codifycli/default-plugin/issues'}</Text>
        </Box>
      )}

      {genericErrors.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {genericErrors.map((msg, i) => <Text key={i} color="red">{msg}</Text>)}
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
