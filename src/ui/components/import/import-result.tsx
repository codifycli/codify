import { OrderedList } from '@inkjs/ui';
import { Box, Text } from 'ink';
import React from 'react';

import { ImportResult } from '../../../orchestrators/import.js';

export function ImportResultComponent(props: {
  importResult: ImportResult;
  showConfigs: boolean
}) {
  const { result, errors } = props.importResult
  
  return <Box flexDirection="column">
    <Text> </Text>
    {
      result.length > 0 && !props.showConfigs && (<Box flexDirection="column">
        <Text bold={true} color={'green'}>Successfully imported the following configs:</Text>
        <OrderedList>
          {
            result.map((r, idx) => <OrderedList.Item key={idx}>
              <Text color={'green'}>{r.type}</Text>
            </OrderedList.Item>)
          }
        </OrderedList>
      </Box>)
    }
    {
      props.showConfigs && (
        <Box flexDirection="column">
          <Box borderColor="green" borderStyle="round">
            <Text>Codify Import</Text>
          </Box>
          <br/>
          <Text>{ JSON.stringify(result.map((r) => r.raw), null, 2)}</Text>
        </Box>
      )
    }
    <Text> </Text>
    {
      errors.length > 0 && (<Box flexDirection="column">
        <Text bold={true} color={'yellow'}>The following configs failed to import:</Text>
        <OrderedList>
          {
            errors.map((e, idx) => <OrderedList.Item key={idx}>
              <Text color={'yellow'}>{e}</Text>
            </OrderedList.Item>)
          }
        </OrderedList>
      </Box>)
    }

  </Box>
}
