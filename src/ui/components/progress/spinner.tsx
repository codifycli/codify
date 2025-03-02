import type { SpinnerName } from 'cli-spinners';

import spinners from 'cli-spinners';
import { Box, Text } from 'ink';
import EventEmitter from 'node:events';
import React, { useLayoutEffect, useState } from 'react';

type Props = {
  /**
   * Type of a spinner.
   * See [cli-spinners](https://github.com/sindresorhus/cli-spinners) for available spinners.
   *
   * @default dots
   */
  type?: SpinnerName;

  eventEmitter: EventEmitter;

  eventType: string;

  label?: string;
};

/**
 * Spinner.
 */
function Spinner({ eventEmitter, eventType, type = 'dots', label }: Props) {
  const [frame, setFrame] = useState(0);
  const spinner = spinners[type];

  useLayoutEffect(() => {
    const listener = () => {
      setFrame(previousFrame => {
        const isLastFrame = previousFrame === spinner.frames.length - 1;
        return isLastFrame ? 0 : previousFrame + 1;
      });
    };

    eventEmitter.on(eventType, listener);

    return () => {
      eventEmitter.removeListener(eventType, listener);
    };
  }, [])

  return <Box gap={1}>
    <Text color="blue">{spinner.frames[frame]}</Text>
    {label && <Text>{label}</Text>}
  </Box>
}

export default Spinner;
