import { OrderedList } from '@inkjs/ui';
import { PlanResponseData, ResourceOperation } from 'codify-schemas';
import { Box, Text } from 'ink';
import React from 'react';

import { ResourceText } from './resource-text.js';

export function PlanComponent(props: {
  plan: PlanResponseData[]
}) {
  const filteredPlan = props.plan.filter((p) => p.operation !== ResourceOperation.NOOP);
  // console.log(JSON.stringify(props.plan, null, 2));

  return <Box flexDirection="column">
    <Box borderStyle="round" borderColor="green">
      <Text>Codify Plan</Text>
    </Box>
    <Text>The following actions will be performed: </Text>
    <Text> </Text>
    <Box marginLeft={1}>
      <OrderedList>{
        filteredPlan.map((p, idx) =>
          <OrderedList.Item key={idx}>
            <Box flexDirection="column" marginBottom={1}>
              <ResourceText plan={p}/>
              <Text>
                <Text>Parameters: </Text>
                <Text>{JSON.stringify(p.parameters, null, 2)}</Text>
                {/* <Box flexDirection='column' marginLeft={2} width={300}>{ */}
                {/*   p.parameters.map((parameter, idx2) => */}
                {/*     <Box flexDirection = 'row' justifyContent='space-between' key={idx2}> */}
                {/*       <ParameterOperationSymbol parameterOperation={parameter.operation}/> */}
                {/*       <Text>{parameter.name}</Text> */}
                {/*       <Text> */}
                {/*         <Text>{JSON.stringify(parameter.previousValue, null, 2)}</Text> */}
                {/*         <Text>{' -> '}</Text> */}
                {/*         <Text>{JSON.stringify(parameter.newValue, null, 2)}</Text> */}
                {/*       </Text> */}
                {/*       /!* <Text>{JSON.stringify(parameter, null, 2)}</Text> *!/ */}
                {/*     </Box> */}
                {/*   ) */}
                {/* }</Box> */}
              </Text>
            </Box>
          </OrderedList.Item>
        )
      }</OrderedList>
    </Box>
  </Box>
}
