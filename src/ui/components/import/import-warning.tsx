import { Box, Static, Text } from 'ink';
import React from 'react';
import { RenderEvent } from '../../reporters/reporter.js';
import SelectInput from 'ink-select-input';
import EventEmitter from 'node:events';


export function ImportWarning({
  renderData,
  emitter,
}: {
  renderData: { noParametersRequired: string[], requiresParameters: string[] };
  emitter: EventEmitter
}) {
  return <Box flexDirection="column">
    <Static items={[renderData]}>{
      (data, idx) => <Box flexDirection='column' key={idx}>
        <Text> </Text>
        <Text bold>Additional information is required to continue import</Text>
        <Text>Some of the resources specified in the import support multiple instances. Additional information is required to identify the specific instance to import. If importing multiple instances is desired (for ex: multiple git clones) additional imports can be added in the prompt.</Text>
        {
          data.noParametersRequired.length > 0 && (<Box flexDirection='column'>
            <Text> </Text>
            <Text bold color='green'>Resources that can be imported automatically:</Text>
            <Text color='green'>{data.noParametersRequired.join(', ')}</Text>
          </Box>)
        }
        <Text> </Text>
        <Text bold color='yellow'>Resources that require additional information:</Text>
        <Text color='yellow'>{data.requiresParameters.join(', ')}</Text>
      </Box>
    }</Static>
    <Box marginTop={1}>
      <SelectInput items={[
        { label: 'Continue to prompt', value: '' },
      ]} onSelect={() => emitter.emit(RenderEvent.PROMPT_RESULT, true)}/>
    </Box>
  </Box>
  
}
