import { Box, Text } from 'ink';
import React from 'react';

export function CheckBox(props: { isSelected: boolean }) {
	const isSelected = props.isSelected ?? false;

	return <Box marginRight={1}>
		<Text color="green">{isSelected ? '◉' : '◯'}</Text>
	</Box>
}

export default CheckBox;
