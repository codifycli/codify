import { PlanResponseData, ResourceOperation } from 'codify-schemas';
import { Box, Text } from 'ink';
import React from 'react';

import { prettyFormatPlan } from '../../plan-pretty-printer.js';
import { ResourceText } from './resource-text.js';

export function PlanComponent(props: {
  plan: PlanResponseData[]
}) {
  const filteredPlan = props.plan.filter((p) => p.operation !== ResourceOperation.NOOP);

  return <Box flexDirection="column">
    <Box borderColor="green" borderStyle="round">
      <Text>Codify Plan</Text>
    </Box>
    <Text>The following actions will be performed: </Text>
    <Text> </Text>
    <Box flexDirection="column" marginLeft={1}>{
        filteredPlan.map((p, idx) =>
          <Box flexDirection="column" key={idx} marginBottom={1}>
            <ResourceText plan={p}/>
            <Text>{prettyFormatPlan(p)}</Text>
          </Box>
        )
    }</Box>
  </Box>
}
