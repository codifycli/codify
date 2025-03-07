import { Box, Text, useInput, useStdin } from 'ink';
import React, { useLayoutEffect, useState } from 'react';

import Checkbox from './Checkbox.js';
import Indicator from './Indicator.js';
import { Item } from './Item.js';
import { arrRotate } from './utils.js';

interface Item {
	key?: string;
	value: string;
	label: string;
}

interface Props {
	items: Array<Item>;
	selected?: Array<Item>;
	defaultSelected?: Array<Item>;
	defaultHighlightedIndex?: number;
	focus?: boolean;
	initialIndex?: number;
	limit?: number
	onSelect?: (item: Item) => void;
	onUnselect?: (item: Item) => void;
	onSubmit?: (result: Item[]) => void;
	onHighlight?: (item: Item) => void;
}


export function MultiSelect(props: Props) {
	const [rotateIndex, setRotateIndex] = useState(0);
	const [highlightedIndex, setHighlightedIndex] = useState(props.defaultHighlightedIndex ?? 0);
	const [selected, setSelected] = useState<Array<Item>>(props.selected ?? props.defaultSelected ?? []);
	const { setRawMode } = useStdin();

	const isSelected = (value: string) => {
		const newlySelected = props.selected || selected

		return newlySelected.map(({ value }) => value).includes(
			value
		);
	}

	useLayoutEffect(() => {
		setRawMode(true);

		return () => { setRawMode(false) }
			}, []);

	useInput((input, key) => {
		const { items, onHighlight, onSubmit } = props;
		const newlySelected = props.selected ?? selected;

		if (key.upArrow || input === 'k') {
			const lastIndex = (hasLimit() ? limit() : items.length) - 1;
			const atFirstIndex = highlightedIndex === 0;
			const nextIndex = (hasLimit() ? highlightedIndex : lastIndex);
			const nextRotateIndex = atFirstIndex ? rotateIndex + 1 : rotateIndex;
			const nextHighlightedIndex = atFirstIndex ? nextIndex : highlightedIndex - 1;

			setRotateIndex(nextRotateIndex);
			setHighlightedIndex(nextHighlightedIndex);

			const slicedItems = hasLimit() ? arrRotate(items, nextRotateIndex).slice(0, limit()) : items;
			onHighlight?.(slicedItems[nextHighlightedIndex]);
		}

		if (key.downArrow || input === 'j') {
			const atLastIndex = highlightedIndex === (hasLimit() ? limit() : items.length) - 1;
			const nextIndex = (hasLimit() ? highlightedIndex : 0);
			const nextRotateIndex = atLastIndex ? rotateIndex - 1 : rotateIndex;
			const nextHighlightedIndex = atLastIndex ? nextIndex : highlightedIndex + 1;

			setRotateIndex(nextRotateIndex);
			setHighlightedIndex(nextHighlightedIndex);

			const slicedItems = hasLimit() ? arrRotate(items, nextRotateIndex).slice(0, limit()) : items;
			onHighlight?.(slicedItems[nextHighlightedIndex]);
		}

		if (input === ' ') {
			const slicedItems = hasLimit() ? arrRotate(items, rotateIndex).slice(0, limit()) : items;
			const selectedItem = slicedItems[highlightedIndex];

			setSelected(selectItem(selectedItem))
		}

		if (key.return) {
			onSubmit?.(newlySelected);
		}

		if (input === 'a') {
			setSelected(items);
		}

		if (input === 'd') {
			setSelected([]);
		}
	})

	const hasLimit = () => {
		const { limit, items } = props;
		return items.length > (limit ?? items.length);
	}

	const limit = () => {
		const { limit, items } = props;

		if (hasLimit()) {
			return Math.min(limit ?? items.length, items.length);
		}

		return items.length;
	}

	const selectItem = (item: Item) => {
		const { onSelect, onUnselect } = props;
		const newSelected = props.selected ?? selected;

		if (isSelected(item.value)) {
			onUnselect?.(item);

			return newSelected.filter(({ value }) => value !== item.value);
		}

		onSelect?.(item);
		return [...newSelected, item];
	}

	const slicedItems = hasLimit() ? arrRotate(props.items, rotateIndex).slice(0, limit()) : props.items;

	return (
		<Box flexDirection='column'>
			<Box flexDirection="column">
				{slicedItems.map((item, index) => {
					const key = item.key ?? item.value;
					const isHighlighted = index === highlightedIndex;

					return (
						<Box key={key}>
							<Indicator isHighlighted={isHighlighted} />
							<Checkbox isSelected={isSelected(item.value)} />
							<Item {...item} isHighlighted={isHighlighted} />
						</Box>
					);
				})}
			</Box>
			<Text color='gray' dimColor>{'Use <space> to select and <return> to submit.'}</Text>
			<Text color='gray' dimColor>{'Use <a> to select all items and <d> to de-select all items.'}</Text>
		</Box>

	);
}
