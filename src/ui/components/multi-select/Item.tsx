import { Text } from 'ink';
import React from 'react';

export function Item(props: { isHighlighted: boolean, label: string }) {
	const isHighlighted = props.isHighlighted ?? false;

	return <Text color={isHighlighted ? 'blue' : undefined}>
		{props.label}
	</Text>
}
