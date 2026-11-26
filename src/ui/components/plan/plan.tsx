import { Box, Text } from 'ink';
import React from 'react';

import { Plan } from '../../../entities/plan.js';
import { prettyFormatResourcePlan } from '../../plan-pretty-printer.js';
import { AUTO_ADDED_COLOR, AUTO_ADDED_HINT, formatRequiredBy, requiredByOf } from '../../required-by.js';
import { templateOriginLabel } from '../../template-origin.js';
import { NoticeList } from '../widgets/NoticeList.js';
import { AutoAddedBadge } from './auto-added-badge.js';
import { ResourceText } from './resource-text.js';

export function PlanComponent(props: {
  plan: Plan,
}) {
  const filteredPlan = props.plan.filterNoopResources();
  const hasAutoAdded = filteredPlan.resources.some((p) => requiredByOf(props.plan, p).length > 0);

  return <Box flexDirection="column">
    <Box borderColor="green" borderStyle="round">
      <Text>Codify Plan</Text>
    </Box>
    <Text>{props.plan.project.templateName ? `Template: ${props.plan.project.templateName}` : `Path: ${props.plan.project.codifyFiles}`}</Text>
    <Text>The following actions will be performed: </Text>
    <Text> </Text>
    <Box flexDirection="column" marginLeft={1}>{
        filteredPlan.resources.map((p, idx) =>
          <Box flexDirection="column" key={idx} marginBottom={1}>
            <Box gap={1}>
              <ResourceText plan={p}/>
              {requiredByOf(props.plan, p).length > 0 && <AutoAddedBadge/>}
            </Box>
            {requiredByOf(props.plan, p).length > 0 && <Text>
              <Text color={AUTO_ADDED_COLOR}>{'  ↳ '}</Text>
              <Text dimColor>{formatRequiredBy(requiredByOf(props.plan, p))}</Text>
            </Text>}
            {templateOriginLabel(props.plan, p) && <Text dimColor>{templateOriginLabel(props.plan, p)}</Text>}
            {!(requiredByOf(props.plan, p).length > 0 && p.parameters.length === 0) && <Text>{prettyFormatResourcePlan(p)}</Text>}
          </Box>
        )
    }</Box>
    {hasAutoAdded && <Box marginBottom={1} marginLeft={1}>
      <Text><Text color={AUTO_ADDED_COLOR}>✦ </Text><Text dimColor>{AUTO_ADDED_HINT}</Text></Text>
    </Box>}
    {props.plan.warnings.length > 0 && <Box flexDirection="column" marginLeft={1}>
      <Text bold color="yellow">Warnings</Text>
      {props.plan.warnings.map((w, idx) => <Text color="yellow" key={idx}>- {w}</Text>)}
    </Box>}
    <NoticeList notices={props.plan.notices} />
  </Box>
}
