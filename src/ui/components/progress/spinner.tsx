import { Text } from 'ink';
import React, { useEffect, useState } from 'react';

// The `dots` spinner from cli-spinners (MIT, Sindre Sorhus)
export const DOTS_SPINNER = {
  interval: 80,
  frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

const SPINNERS = { dots: DOTS_SPINNER };

type Props = {
    /**
     * Type of a spinner.
     *
     * @default dots
     */
    type?: keyof typeof SPINNERS;

    label?: string;
};

/**
 * Spinner.
 */
function Spinner({ type = 'dots', label }: Props) {
    const [frame, setFrame] = useState(0);
    const spinner = SPINNERS[type];

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