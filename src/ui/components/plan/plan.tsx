import { Box, Text } from 'ink';
import React from 'react';

import { Plan } from '../../../entities/plan.js';
import { prettyFormatResourcePlan } from '../../plan-pretty-printer.js';
import { ResourceText } from './resource-text.js';

export function PlanComponent(props: {
  plan: Plan,
}) {
  const filteredPlan = props.plan.filterNoopResources();

  return <Box flexDirection="column">
    <Box borderColor="green" borderStyle="round">
      <Text>Codify Plan</Text>
    </Box>
    <Text>Path: {props.plan.project.codifyFiles}</Text>
    <Text>The following actions will be performed: </Text>
    <Text> </Text>
    <Box flexDirection="column" marginLeft={1}>{
        filteredPlan.resources.map((p, idx) =>
          <Box flexDirection="column" key={idx} marginBottom={1}>
            <ResourceText plan={p}/>
            <Text>{prettyFormatResourcePlan(p)}</Text>
          </Box>
        )
    }</Box>
  </Box>
}
