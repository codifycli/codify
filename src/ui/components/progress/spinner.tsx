import type { SpinnerName } from 'cli-spinners';

import spinners from 'cli-spinners';
import { Text } from 'ink';
import React, { useEffect, useState } from 'react';

type Props = {
    /**
     * Type of a spinner.
     * See [cli-spinners](https://github.com/sindresorhus/cli-spinners) for available spinners.
     *
     * @default dots
     */
    type?: SpinnerName;

    label?: string;
};

/**
 * Spinner.
 */
function Spinner({ type = 'dots', label }: Props) {
    const [frame, setFrame] = useState(0);
    const spinner = spinners[type];

    useEffect(() => {
        const timer = setInterval(() => {
            setFrame(previousFrame => {
                const isLastFrame = previousFrame === spinner.frames.length - 1;
                return isLastFrame ? 0 : previousFrame + 1;
            });
        }, spinner.interval);

        return () => {
            clearInterval(timer);
        };
    }, [spinner]);

    return <Text><Text color='blue'>{spinner.frames[frame]}</Text> {label}</Text>;
}

export default Spinner;