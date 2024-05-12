import { ParameterOperation, ResourceOperation } from 'codify-schemas';
import { Box, Text } from 'ink';
import React from 'react';

export function ResourceOperationSymbol(props: {
  resourceOperation: ResourceOperation
}) {
  switch (props.resourceOperation) {
    case ResourceOperation.NOOP: {
      return <Text></Text>
    }

    case ResourceOperation.CREATE: {
      return <Text color="green">+</Text>
    }

    case ResourceOperation.DESTROY: {
      return <Text color="red">-</Text>
    }

    case ResourceOperation.RECREATE: {
      return <Box>
        <Text color="red">-</Text><Text color="green">+</Text>
      </Box>
    }

    case ResourceOperation.MODIFY: {
      return <Text color="yellow">~</Text>
    }
  }
}

export function ParameterOperationSymbol(props: {
  parameterOperation: ParameterOperation
}) {
  switch (props.parameterOperation) {
    case ParameterOperation.NOOP: {
      return <Text></Text>
    }

    case ParameterOperation.ADD: {
      return <Text color="green">+</Text>
    }

    case ParameterOperation.REMOVE: {
      return <Text color="red">-</Text>
    }

    case ParameterOperation.MODIFY: {
      return <Text color="yellow">~</Text>
    }
  }
}
