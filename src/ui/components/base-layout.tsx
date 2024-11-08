import { Box, useStdout } from 'ink';
import React, { ReactNode } from 'react';

export function BaseLayout(props: { children?: any }){
  
  const { stdout } = useStdout()
  
  const displayWidth = stdout.columns;
  const displayHeight = stdout.rows - 3;

  return <Box height={displayHeight} width={displayWidth} overflow="hidden">
    { props.children }
  </Box>
}
