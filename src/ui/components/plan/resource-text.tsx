import { PlanResponseData, ResourceOperation } from '@codifycli/schemas';
import { Box, Text } from 'ink';
import React from 'react';

import { ResourceOperationSymbol } from './operation-symbol.js';

export function ResourceText(props: {
  plan: PlanResponseData
}) {
  const { plan } = props;
  const { operation, resourceName, resourceType } = plan;

  const fullyQualifiedName = resourceType + (resourceName ? `.${resourceName}` : '');
  let backgroundColor = '';
  let operationName = '';

  switch (operation) {
    case ResourceOperation.NOOP: {
      backgroundColor = '#D3D3D3';
      operationName = 'not be modified'
      break;
    }

    case ResourceOperation.CREATE: {
      backgroundColor = 'green'
      operationName = 'be created'
      break;
    }

    case ResourceOperation.DESTROY: {
      backgroundColor = 'red'
      operationName = 'be destroyed'
      break;
    }

    case ResourceOperation.MODIFY: {
      backgroundColor = 'yellow'
      operationName = 'be modified'
      break;
    }

    case ResourceOperation.RECREATE: {
      backgroundColor = 'yellow'
      operationName = 'be re-created'
      break;
    }
  }

  return <Box>
    <Text backgroundColor={backgroundColor}>
      <ResourceOperationSymbol resourceOperation={operation}/>
      <Text> </Text>
      <Text bold>{fullyQualifiedName}</Text>
      <Text> will {operationName}</Text>
    </Text>
  </Box>
}
