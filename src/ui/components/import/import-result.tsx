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
        <Box flexDirection="column">
          {result.map((r, idx) => (
            <Text key={idx} color={'green'}>{idx + 1}. {r.type}</Text>
          ))}
        </Box>
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
        <Box flexDirection="column">
          {errors.map((e, idx) => (
            <Text key={idx} color={'yellow'}>{idx + 1}. {e}</Text>
          ))}
        </Box>
      </Box>)
    }

  </Box>
}
