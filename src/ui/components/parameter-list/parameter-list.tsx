import { Box, Text, useInput } from 'ink';
import React, { useMemo, useState } from 'react';

import { setValueAtPath } from '../../../utils/missing-parameters.js';

export interface ParameterListField {
  /** Location of the value inside the resource. Strings are object keys, numbers are array indices. */
  path: Array<number | string>;
  /** JSON schema type. Used for the input hint and basic validation. */
  type?: string;
  /** JSON schema type of the array items (if type is 'array'). Used for the list example. */
  itemsType?: string;
  /** Only shown for the focused field */
  description?: string;
  /** Mask the typed value */
  sensitive?: boolean;
}

export interface ParameterListResource {
  /** Fully qualified resource id (ex: git-repository.work). Rendered in bold above the resource. */
  id: string;
  /** The resource as it is written in the config (type, name, parameters). Rendered around the fields for context. */
  config: Record<string, unknown>;
  /** Top level keys whose existing values are masked. '*' masks every value. */
  sensitiveKeys?: string[];
  fields: ParameterListField[];
}

export interface ParameterListProps {
  title?: string;
  subtitle?: string;
  resources: ParameterListResource[];
  /** Values are returned as typed (strings), one per field, in the order of the resources and their fields */
  onSubmit: (values: string[]) => void;
  onCancel: () => void;
  /** Lines shown at once. The list scrolls to keep the focused field visible. Defaults to fit the terminal. */
  maxVisibleLines?: number;
}

type Line =
  | { fieldIdx: number; indent: number; key: string; kind: 'field'; prefix: string; suffix: string }
  | { bold?: boolean; color?: string; dim?: boolean; indent: number; isHeader?: boolean; key: string; kind: 'text'; text: string };

// Marks where a field goes while the resource is laid out. Never shown.
const FIELD_MARKER = '\u0000codify-field\u0000';
const INDENT = '  ';
const MAX_INLINE_VALUE_LENGTH = 60;

/**
 * Every resource that needs values is shown in full (as JSON) with the missing values as inline fields, so the user
 * sees what each value is for. Resources are stacked vertically: ↑/↓ move between every field, typing edits the
 * focused field, Enter moves to the next field and submits from the last one. Esc cancels.
 */
export function ParameterList(props: ParameterListProps) {
  const { title, subtitle, resources, onSubmit, onCancel } = props;
  const maxVisibleLines = props.maxVisibleLines ?? Math.max(8, (process.stdout.rows ?? 24) - 8);

  const fields = useMemo(() => resources.flatMap((r) => r.fields), [resources]);
  const layout = useMemo(() => layoutResources(resources), [resources]);

  const [focused, setFocused] = useState(0);
  const [values, setValues] = useState<string[]>(() => fields.map(() => ''));
  const [errors, setErrors] = useState<Array<string | undefined>>(() => fields.map(() => undefined));

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
      setFocused((prev) => Math.min(fields.length - 1, prev + 1));
      return;
    }

    if (key.return) {
      const error = validateField(fields[focused], values[focused]);
      if (error) {
        setErrors((prev) => prev.map((e, i) => (i === focused ? error : e)));
        return;
      }

      if (focused < fields.length - 1) {
        setFocused(focused + 1);
        return;
      }

      // Last field: validate everything and jump to the first problem
      const allErrors = fields.map((field, idx) => validateField(field, values[idx]));
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

  // The focused field shows its description and what to enter (or its error) right below it
  const lines = layout.flatMap((line): Line[] => {
    if (line.kind !== 'field' || line.fieldIdx !== focused) {
      return [line];
    }

    const field = fields[focused];
    const error = errors[focused];
    const indent = line.indent + 2;
    return [
      line,
      ...(field.description ? [{ kind: 'text', key: `${line.key}-description`, indent, text: field.description, dim: true } as Line] : []),
      error
        ? { kind: 'text', key: `${line.key}-error`, indent, text: error, color: 'red' }
        : { kind: 'text', key: `${line.key}-hint`, indent, text: inputHint(field), dim: true },
    ];
  });

  const focusedLine = lines.findIndex((l) => l.kind === 'field' && l.fieldIdx === focused);
  const { start, end } = visibleWindow(lines, focusedLine, maxVisibleLines);

  return (
    <Box flexDirection="column">
      {title && <Text bold>{title}</Text>}
      {subtitle && <Text dimColor>{subtitle}</Text>}

      <Box flexDirection="column" marginTop={title || subtitle ? 1 : 0}>
        {start > 0 && <Text dimColor>  ↑ {start} more lines</Text>}
        {lines.slice(start, end).map((line) => (
          <LineView
            error={line.kind === 'field' ? errors[line.fieldIdx] : undefined}
            field={line.kind === 'field' ? fields[line.fieldIdx] : undefined}
            isFocused={line.kind === 'field' && line.fieldIdx === focused}
            key={line.key}
            line={line}
            value={line.kind === 'field' ? values[line.fieldIdx] : undefined}
          />
        ))}
        {end < lines.length && <Text dimColor>  ↓ {lines.length - end} more lines</Text>}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑/↓ to move between values · Enter for the next value (submits on the last one) · Esc to cancel</Text>
      </Box>
    </Box>
  );
}

function LineView(props: { error?: string; field?: ParameterListField; isFocused: boolean; line: Line; value?: string; }) {
  const { line, isFocused, field, value = '', error } = props;
  const indent = INDENT.repeat(line.indent);

  if (line.kind === 'text') {
    return (
      <Text bold={line.bold} color={line.color} dimColor={line.dim}>{'  '}{indent}{line.text}</Text>
    );
  }

  const shown = field?.sensitive ? '*'.repeat(value.length) : value;
  return (
    <Box>
      <Text color="cyan">{isFocused ? '❯ ' : '  '}</Text>
      <Text>{indent}</Text>
      <Text color={error ? 'red' : undefined}>{line.prefix}</Text>
      {shown.length > 0 && <Text color={isFocused ? 'cyan' : undefined}>{shown}</Text>}
      {isFocused
        ? <Text inverse> </Text>
        : (shown.length === 0 && <Text color={error ? 'red' : 'yellow'}>___</Text>)}
      <Text dimColor>{line.suffix}</Text>
    </Box>
  );
}

/** Lays out every resource as JSON. Field lines are numbered across all resources in order. */
function layoutResources(resources: ParameterListResource[]): Line[] {
  const lines: Line[] = [];
  let fieldOffset = 0;

  for (const [resourceIdx, resource] of resources.entries()) {
    if (resourceIdx > 0) {
      lines.push({ kind: 'text', key: `${resource.id}-${resourceIdx}-spacer`, indent: 0, text: '' });
    }

    const count = resource.fields.length;
    lines.push({
      kind: 'text',
      key: `${resource.id}-${resourceIdx}-header`,
      indent: 0,
      text: `${resource.id} · ${count} ${count === 1 ? 'value' : 'values'} needed`,
      bold: true,
      isHeader: true,
    });

    // Insert a marker at every field path so missing keys show up in the right place
    const fieldIdxByPath = new Map(resource.fields.map((f, idx) => [pathKey(f.path), fieldOffset + idx]));
    const config = resource.fields.reduce<Record<string, unknown>>((result, field) => {
      const [key, ...rest] = field.path;
      return { ...result, [key]: setValueAtPath(result[key], rest, FIELD_MARKER) };
    }, structuredClone(resource.config));

    const context = {
      fieldIdxByPath,
      fieldPaths: resource.fields.map((f) => f.path),
      keyPrefix: `${resource.id}-${resourceIdx}`,
      sensitiveKeys: resource.sensitiveKeys ?? [],
    };
    layoutValue(config, [], 0, '', '', context, lines);

    fieldOffset += count;
  }

  return lines;
}

interface LayoutContext {
  fieldIdxByPath: Map<string, number>;
  fieldPaths: Array<Array<number | string>>;
  keyPrefix: string;
  sensitiveKeys: string[];
}

function layoutValue(
  value: unknown,
  path: Array<number | string>,
  indent: number,
  prefix: string,
  suffix: string,
  context: LayoutContext,
  lines: Line[],
): void {
  const key = `${context.keyPrefix}-${pathKey(path)}`;

  const fieldIdx = context.fieldIdxByPath.get(pathKey(path));
  if (fieldIdx !== undefined && path.length > 0) {
    lines.push({ kind: 'field', key, indent, prefix, suffix, fieldIdx });
    return;
  }

  // Containers holding a field are expanded. Everything else is shown on one line.
  const containsField = context.fieldPaths.some((p) => p.length > path.length && path.every((k, i) => p[i] === k));
  if (containsField && typeof value === 'object' && value !== null) {
    const isArray = Array.isArray(value);
    const entries: Array<[number | string, unknown]> = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);

    lines.push({ kind: 'text', key: `${key}-open`, indent, text: `${prefix}${isArray ? '[' : '{'}`, dim: true });
    for (const [idx, [childKey, child]] of entries.entries()) {
      const childPrefix = isArray ? '' : `${JSON.stringify(childKey)}: `;
      const childSuffix = idx < entries.length - 1 ? ',' : '';
      layoutValue(child, [...path, childKey], indent + 1, childPrefix, childSuffix, context, lines);
    }

    lines.push({ kind: 'text', key: `${key}-close`, indent, text: `${isArray ? ']' : '}'}${suffix}`, dim: true });
    return;
  }

  const isSensitive = context.sensitiveKeys.includes('*') || context.sensitiveKeys.includes(String(path[0]));
  lines.push({ kind: 'text', key, indent, text: `${prefix}${isSensitive ? '"********"' : inlineValue(value)}${suffix}`, dim: true });
}

function inlineValue(value: unknown): string {
  const json = JSON.stringify(value) ?? String(value);
  return json.length > MAX_INLINE_VALUE_LENGTH ? `${json.slice(0, MAX_INLINE_VALUE_LENGTH - 1)}…` : json;
}

function pathKey(path: Array<number | string>): string {
  return JSON.stringify(path);
}

function validateField(field: ParameterListField, value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 'A value is required';
  }

  if ((field.type === 'number' || field.type === 'integer') && Number.isNaN(Number(trimmed))) {
    return 'Must be a number';
  }

  if (field.type === 'integer' && !Number.isInteger(Number(trimmed))) {
    return 'Must be a whole number';
  }

  if (field.type === 'boolean' && !['false', 'n', 'no', 'true', 'y', 'yes'].includes(trimmed.toLowerCase())) {
    return 'Must be yes or no';
  }

  return undefined;
}

/** What to type into the field */
function inputHint(field: ParameterListField): string {
  const hint = [expectedInput(field)];
  if (field.sensitive) {
    hint.push('hidden as you type');
  }

  return hint.join(' · ');
}

function expectedInput(field: ParameterListField): string {
  switch (field.type) {
    case 'boolean': { return 'Enter yes or no'; }
    case 'array': { return `Enter a comma-separated list, e.g. ${listExample(field.itemsType)}`; }
    case 'object': { return 'Enter a JSON object, e.g. {"key": "value"}'; }
    case 'integer': { return 'Enter a whole number'; }
    case 'number': { return 'Enter a number'; }
    default: { return 'Enter text'; }
  }
}

function listExample(itemsType?: string): string {
  switch (itemsType) {
    case 'integer':
    case 'number': { return '1, 2, 3'; }
    case 'boolean': { return 'yes, no'; }
    default: { return 'item1, item2, item3'; }
  }
}

/**
 * Keep the focused field visible with as much of its resource as possible: the whole resource (from its header to the
 * end of the block) if it fits, otherwise from the header down, otherwise centered on the focused field.
 */
function visibleWindow(lines: Line[], focused: number, size: number): { end: number; start: number } {
  const total = lines.length;
  if (total <= size) {
    return { start: 0, end: total };
  }

  let header = focused;
  while (header >= 0 && !(lines[header].kind === 'text' && (lines[header] as { isHeader?: boolean }).isHeader)) {
    header--;
  }

  const nextHeader = lines.findIndex((l, idx) => idx > focused && l.kind === 'text' && l.isHeader);
  const blockEnd = nextHeader === -1 ? total : nextHeader;
  // The description and hint lines come right after the focused field
  const focusedEnd = Math.min(total, focused + 3);

  let start: number;
  if (header !== -1 && blockEnd - header <= size) {
    start = header;
  } else if (header !== -1 && focusedEnd - header <= size) {
    start = header;
  } else {
    start = focused - Math.floor(size / 2);
  }

  start = Math.min(Math.max(0, start), total - size);
  return { start, end: start + size };
}
