import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

export interface ParameterListRow {
  /** Fully qualified resource id (ex: git-repository.work). Rendered in bold. */
  resource: string;
  /** Path of the parameter inside the resource (ex: hosts[0].HostName) */
  label: string;
  /** JSON schema type. Used for the placeholder hint and basic validation. */
  type?: string;
  /** Only shown for the focused row */
  description?: string;
  /** Mask the typed value */
  sensitive?: boolean;
}

export interface ParameterListProps {
  title?: string;
  subtitle?: string;
  rows: ParameterListRow[];
  /** Values are returned as typed (strings), one per row */
  onSubmit: (values: string[]) => void;
  onCancel: () => void;
  /** Rows shown at once. The list scrolls to keep the focused row visible. */
  maxVisibleRows?: number;
}

/**
 * A flat list of text inputs. ↑/↓ move between rows, typing edits the focused row, Enter moves to the next row and
 * submits from the last row. Esc cancels.
 */
export function ParameterList(props: ParameterListProps) {
  const { title, subtitle, rows, onSubmit, onCancel, maxVisibleRows = 10 } = props;

  const [focused, setFocused] = useState(0);
  const [values, setValues] = useState<string[]>(() => rows.map(() => ''));
  const [errors, setErrors] = useState<Array<string | undefined>>(() => rows.map(() => undefined));

  const setValue = (idx: number, update: (prev: string) => string) => {
    setValues((prev) => prev.map((v, i) => (i === idx ? update(v) : v)));
    setErrors((prev) => prev.map((e, i) => (i === idx ? undefined : e)));
  };

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.upArrow) {
      setFocused((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setFocused((prev) => Math.min(rows.length - 1, prev + 1));
      return;
    }

    if (key.return) {
      const error = validateRow(rows[focused], values[focused]);
      if (error) {
        setErrors((prev) => prev.map((e, i) => (i === focused ? error : e)));
        return;
      }

      if (focused < rows.length - 1) {
        setFocused(focused + 1);
        return;
      }

      // Last row: validate everything and jump to the first problem
      const allErrors = rows.map((row, idx) => validateRow(row, values[idx]));
      const firstError = allErrors.findIndex(Boolean);
      if (firstError !== -1) {
        setErrors(allErrors);
        setFocused(firstError);
        return;
      }

      onSubmit(values);
      return;
    }

    if (key.backspace || key.delete) {
      setValue(focused, (prev) => prev.slice(0, -1));
      return;
    }

    // Ignore other control keys. Pasted text can contain line breaks: drop them.
    if (input && !key.ctrl && !key.meta && !key.tab && !key.leftArrow && !key.rightArrow) {
      const text = input.replaceAll(/[\n\r]/g, '');
      if (text) {
        setValue(focused, (prev) => prev + text);
      }
    }
  });

  const nameWidth = Math.max(...rows.map((r) => r.resource.length + 1 + r.label.length));
  const { start, end } = visibleWindow(rows.length, focused, maxVisibleRows);

  return (
    <Box flexDirection="column">
      {title && <Text bold>{title}</Text>}
      {subtitle && <Text dimColor>{subtitle}</Text>}

      <Box flexDirection="column" marginTop={title || subtitle ? 1 : 0}>
        {start > 0 && <Text dimColor>  ↑ {start} more</Text>}
        {rows.slice(start, end).map((row, offset) => {
          const idx = start + offset;
          const isFocused = idx === focused;
          const value = values[idx];
          const error = errors[idx];
          const padding = ' '.repeat(nameWidth - row.resource.length - 1 - row.label.length);

          return (
            <Box flexDirection="column" key={`${row.resource}.${row.label}`}>
              <Box>
                <Text color="cyan">{isFocused ? '❯ ' : '  '}</Text>
                <Text bold color={error ? 'red' : undefined}>{row.resource}</Text>
                <Text dimColor>.</Text>
                <Text color={error ? 'red' : undefined}>{row.label}</Text>
                <Text>{padding}  </Text>
                {value.length > 0
                  ? <Text>{row.sensitive ? '*'.repeat(value.length) : value}</Text>
                  : <Text dimColor>{placeholderFor(row)}</Text>}
                {isFocused && <Text inverse> </Text>}
              </Box>
              {error && <Text color="red">{'    '}{error}</Text>}
              {isFocused && !error && row.description && <Text dimColor>{'    '}{row.description}</Text>}
            </Box>
          );
        })}
        {end < rows.length && <Text dimColor>  ↓ {rows.length - end} more</Text>}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑/↓ to move · Enter for the next value (submits on the last one) · Esc to cancel</Text>
      </Box>
    </Box>
  );
}

function validateRow(row: ParameterListRow, value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'A value is required';
  }

  if ((row.type === 'number' || row.type === 'integer') && Number.isNaN(Number(trimmed))) {
    return 'Must be a number';
  }

  if (row.type === 'integer' && !Number.isInteger(Number(trimmed))) {
    return 'Must be a whole number';
  }

  if (row.type === 'boolean' && !['false', 'n', 'no', 'true', 'y', 'yes'].includes(trimmed.toLowerCase())) {
    return 'Must be yes or no';
  }

  return undefined;
}

function placeholderFor(row: ParameterListRow): string {
  switch (row.type) {
    case 'boolean': { return 'yes / no'; }
    case 'array': { return 'comma separated values'; }
    case 'object': { return 'JSON object'; }
    case 'integer':
    case 'number': { return 'number'; }
    default: { return 'text'; }
  }
}

/** Keep the focused row roughly in the middle of the visible rows */
function visibleWindow(total: number, focused: number, size: number): { end: number; start: number } {
  if (total <= size) {
    return { start: 0, end: total };
  }

  const start = Math.min(Math.max(0, focused - Math.floor(size / 2)), total - size);
  return { start, end: start + size };
}
