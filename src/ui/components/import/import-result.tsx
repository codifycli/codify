import { Box, Text } from 'ink';
import React from 'react';

import { ImportResult } from '../../../orchestrators/import.js';

export function ImportResultComponent(props: {
  importResult: ImportResult
}) {
  const { result, errors } = props.importResult
  
  return <Box flexDirection="column">
    <Box borderColor="green" borderStyle="round">
      <Text>Codify Import</Text>
    </Box>
    <br/>
    <Text>{ JSON.stringify(result, null, 2)}</Text>
    <Text bold={true} color={'red'}>The following configs failed to import:</Text>
    <br/>
    {
      errors.map((e, idx) => <Box key={idx}>
        <Text color={'red'}>{e}</Text>
        <br/>
        <br/>
      </Box>)
    }
  </Box>
}
