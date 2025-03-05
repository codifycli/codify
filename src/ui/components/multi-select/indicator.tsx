import { Box, Text } from 'ink';
import React from 'react';

export function Indicator(props: { isHighlighted: boolean }) {
	const isHighlighted = props.isHighlighted ?? false;

	return <Box marginRight={1}>
		<Text color={isHighlighted ? 'blue' : undefined}>
			{isHighlighted ? '❯' : ' '}
		</Text>
	</Box>
}

export default Indicator;
