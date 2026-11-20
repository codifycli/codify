import { Box, Text, useInput } from 'ink';
import { isDeepStrictEqual } from 'node:util';
import React, { useEffect, useRef, useState } from 'react';

// Port of ink-select-input (MIT, Vadim Demedes): a list of items, up/down (or k/j) to move, enter or 1-9 to select.
// With a `limit`, the list scrolls around (rotates) instead of showing every item.

export interface SelectItem<V> {
  key?: string;
  label: string;
  value: V;
}

interface Props<V> {
  initialIndex?: number;
  isFocused?: boolean;
  items: Array<SelectItem<V>>;
  /** Number of items shown at a time. */
  limit?: number;
  onHighlight?: (item: SelectItem<V>) => void;
  onSelect?: (item: SelectItem<V>) => void;
}

// Same as figures.pointer: the fallback is for terminals without unicode (the Linux console)
const POINTER = process.platform !== 'win32' && process.env.TERM !== 'linux' ? '❯' : '>';

export default function SelectInput<V>({
  initialIndex = 0,
  isFocused = true,
  items,
  limit: customLimit,
  onHighlight,
  onSelect,
}: Props<V>) {
  const hasLimit = typeof customLimit === 'number' && items.length > customLimit;
  const limit = hasLimit ? Math.min(customLimit, items.length) : items.length;
  const lastIndex = limit - 1;

  const [rotateIndex, setRotateIndex] = useState(initialIndex > lastIndex ? lastIndex - initialIndex : 0);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex > lastIndex ? lastIndex : initialIndex);

  // Start over when the items change
  const previousItems = useRef(items);
  useEffect(() => {
    if (!isDeepStrictEqual(previousItems.current.map((item) => item.value), items.map((item) => item.value))) {
      setRotateIndex(0);
      setSelectedIndex(0);
    }

    previousItems.current = items;
  }, [items]);

  const visibleItems = (rotate: number) => (hasLimit ? rotated(items, rotate).slice(0, limit) : items);

  useInput((input, key) => {
    if (input === 'k' || key.upArrow) {
      const atFirstIndex = selectedIndex === 0;
      const nextRotateIndex = atFirstIndex ? rotateIndex + 1 : rotateIndex;
      const nextSelectedIndex = atFirstIndex ? (hasLimit ? selectedIndex : items.length - 1) : selectedIndex - 1;
      setRotateIndex(nextRotateIndex);
      setSelectedIndex(nextSelectedIndex);
      onHighlight?.(visibleItems(nextRotateIndex)[nextSelectedIndex]);
    }

    if (input === 'j' || key.downArrow) {
      const atLastIndex = selectedIndex === (hasLimit ? limit : items.length) - 1;
      const nextRotateIndex = atLastIndex ? rotateIndex - 1 : rotateIndex;
      const nextSelectedIndex = atLastIndex ? (hasLimit ? selectedIndex : 0) : selectedIndex + 1;
      setRotateIndex(nextRotateIndex);
      setSelectedIndex(nextSelectedIndex);
      onHighlight?.(visibleItems(nextRotateIndex)[nextSelectedIndex]);
    }

    // Select directly with the number keys
    if (/^[1-9]$/.test(input)) {
      const item = visibleItems(rotateIndex)[Number.parseInt(input, 10) - 1];
      if (item) {
        onSelect?.(item);
      }
    }

    if (key.return) {
      const item = visibleItems(rotateIndex)[selectedIndex];
      if (item) {
        onSelect?.(item);
      }
    }
  }, { isActive: isFocused });

  return (
    <Box flexDirection='column'>
      {visibleItems(rotateIndex).map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={item.key ?? String(item.value)}>
            <Box marginRight={1}>{isSelected ? <Text color='blue'>{POINTER}</Text> : <Text> </Text>}</Box>
            <Text color={isSelected ? 'blue' : undefined}>{item.label}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

function rotated<T>(array: T[], steps: number): T[] {
  const { length } = array;
  const normalized = length === 0 ? 0 : ((steps % length) + length) % length;
  return normalized === 0 ? [...array] : [...array.slice(-normalized), ...array.slice(0, -normalized)];
}
