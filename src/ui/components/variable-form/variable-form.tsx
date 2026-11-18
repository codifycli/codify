import { VariableValueType } from '@codifycli/schemas';
import { Box, Text, useInput } from 'ink';
import React, { useMemo, useState } from 'react';

import type { VariableForm, VariableFormField } from '../../../variables/variable-resolver.js';
import { formatVariableValue } from '../../../variables/variable-values.js';

const ACCENT = 'cyan';
const GUTTER = 'gray';

type Answers = Record<string, unknown>;

/**
 * Asks for all the variables of a file on one screen, in the style of an onboarding wizard:
 *
 *   ╭  Configure  codify.jsonc
 *   │
 *   ◇  siteType  blog
 *   │
 *   ◆  projectName
 *   │  The name of the project
 *   │  my-site█
 *   │
 *   ○  port  3000
 *   │
 *   ╰  ↑↓ move  enter next  esc cancel
 *
 * Answered fields collapse to one line and can be edited again at any time. Fields appear and disappear as the answers
 * change their when conditions, and defaults that reference other variables follow the answers.
 */
export function VariableFormPrompt({ form, onSubmit, onCancel }: {
  form: VariableForm;
  onSubmit: (answers: Answers) => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<Answers>({});
  const [focusedName, setFocusedName] = useState<string | undefined>(undefined);
  // The highlighted option of each select field (enum, boolean, multiEnum)
  const [cursors, setCursors] = useState<Record<string, number>>({});
  // Fields that were left once: their errors are shown
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  const fields = useMemo(() => form.fields(answers), [form, answers]);
  const focusedIndex = Math.max(0, fields.findIndex((f) => f.name === focusedName));
  const focused = fields[focusedIndex];

  const errorOf = (field: VariableFormField, current: Answers = answers) => form.validate(field.name, current[field.name], current);
  const showsError = (field: VariableFormField) => (submitted || visited.has(field.name)) && errorOf(field) !== undefined;

  /** Selecting fields without an answer or a default take the highlighted option when they are left */
  const withSelection = (current: Answers): Answers => {
    if (!focused || current[focused.name] !== undefined || focused.default !== undefined) {
      return current;
    }

    const options = selectOptions(focused);
    if (!options || focused.valueType === VariableValueType.MULTI_ENUM) {
      return current;
    }

    return { ...current, [focused.name]: options[cursors[focused.name] ?? 0].value };
  };

  const moveTo = (index: number, current: Answers) => {
    const next = form.fields(current);
    const target = next[Math.min(Math.max(index, 0), next.length - 1)];
    if (focused) {
      setVisited(new Set([...visited, focused.name]));
    }

    setAnswers(current);
    setFocusedName(target?.name);
  };

  const submit = (current: Answers) => {
    const finalFields = form.fields(current);
    const invalid = finalFields.find((f) => form.validate(f.name, current[f.name], current) !== undefined);
    setSubmitted(true);
    setAnswers(current);

    if (invalid) {
      setFocusedName(invalid.name);
      return;
    }

    // Only the answers of the fields that are still shown
    onSubmit(Object.fromEntries(finalFields.filter((f) => current[f.name] !== undefined).map((f) => [f.name, current[f.name]])));
  };

  useInput((input, key) => {
    if (!focused) {
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    if (key.upArrow || (key.tab && key.shift)) {
      moveTo(focusedIndex - 1, withSelection(answers));
      return;
    }

    if (key.downArrow || key.tab) {
      moveTo(focusedIndex + 1, withSelection(answers));
      return;
    }

    if (key.return) {
      const current = withSelection(answers);
      if (focusedIndex === fields.length - 1) {
        submit(current);
      } else {
        moveTo(focusedIndex + 1, current);
      }

      return;
    }

    const options = selectOptions(focused);
    if (options) {
      const cursor = cursors[focused.name] ?? defaultCursor(focused, options);
      if (key.leftArrow || key.rightArrow) {
        const next = (cursor + (key.rightArrow ? 1 : -1) + options.length) % options.length;
        setCursors({ ...cursors, [focused.name]: next });
        // Single choice: moving selects. Multiple choice: space toggles.
        if (focused.valueType !== VariableValueType.MULTI_ENUM) {
          setAnswers({ ...answers, [focused.name]: options[next].value });
        }
      } else if (input === ' ' && focused.valueType === VariableValueType.MULTI_ENUM) {
        const selected = multiValue(focused, answers);
        const option = String(options[cursor].value);
        setAnswers({
          ...answers,
          [focused.name]: selected.includes(option) ? selected.filter((s) => s !== option) : [...selected, option],
        });
      }

      return;
    }

    // Text and numbers
    const text = answers[focused.name] === undefined ? '' : String(answers[focused.name]);
    if (key.backspace || key.delete) {
      setAnswers({ ...answers, [focused.name]: text.slice(0, -1) });
    } else if (input && !key.ctrl && !key.meta) {
      setAnswers({ ...answers, [focused.name]: text + input });
    }
  });

  const isLast = focusedIndex === fields.length - 1;

  return (
    <Box flexDirection='column' paddingTop={1}>
      <Text>
        <Text color={GUTTER}>╭  </Text>
        <Text bold>Configure</Text>
        <Text dimColor>  {form.scope.length > 0 ? `${form.scope.join(' › ')}  ·  ${form.location}` : form.location}</Text>
      </Text>
      <Gutter/>

      {fields.map((field, idx) => (
        <FieldRow
          answers={answers}
          cursor={cursors[field.name]}
          error={showsError(field) ? errorOf(field) : undefined}
          field={field}
          isFocused={idx === focusedIndex}
          key={field.name}
        />
      ))}

      <Text>
        <Text color={GUTTER}>╰  </Text>
        <Text dimColor>{hints(focused, isLast)}</Text>
      </Text>
    </Box>
  );
}

function FieldRow({ field, answers, isFocused, cursor, error }: {
  field: VariableFormField;
  answers: Answers;
  isFocused: boolean;
  cursor?: number;
  error?: string;
}) {
  const answer = answers[field.name];
  const hasAnswer = answer !== undefined && answer !== '' && !(Array.isArray(answer) && answer.length === 0 && field.default === undefined);
  const marker = error ? '▲' : isFocused ? '◆' : hasAnswer || field.default !== undefined ? '◇' : '○';
  const markerColor = error ? 'red' : isFocused ? ACCENT : hasAnswer ? 'green' : GUTTER;

  return (
    <Box flexDirection='column'>
      <Text>
        <Text color={markerColor}>{marker}  </Text>
        <Text bold={isFocused} color={isFocused ? undefined : hasAnswer ? undefined : 'gray'}>{field.name}</Text>
        {!isFocused && <Text>  {summary(field, answer)}</Text>}
        {isFocused && field.valueType !== VariableValueType.TEXT && <Text dimColor>  {typeLabel(field)}</Text>}
      </Text>

      {isFocused && (field.description || field.implicit) && (
        <Text>
          <Text color={GUTTER}>│  </Text>
          <Text dimColor>{field.description ?? 'Used in the config without a variable block'}</Text>
        </Text>
      )}

      {isFocused && (
        <Text>
          <Text color={GUTTER}>│  </Text>
          <FieldInput answers={answers} cursor={cursor} field={field}/>
        </Text>
      )}

      {error && (
        <Text>
          <Text color={GUTTER}>│  </Text>
          <Text color='red'>{error}</Text>
        </Text>
      )}

      <Gutter/>
    </Box>
  );
}

function FieldInput({ field, answers, cursor }: { field: VariableFormField; answers: Answers; cursor?: number }) {
  const options = selectOptions(field);
  if (options) {
    const highlighted = cursor ?? defaultCursor(field, options);
    // Single choice: the highlighted option is the one that is picked when the field is left
    const selected = field.valueType === VariableValueType.MULTI_ENUM
      ? multiValue(field, answers)
      : [String(answers[field.name] ?? field.default ?? options[highlighted].value)];

    return (
      <Text>
        {options.map((option, idx) => {
          const isSelected = selected.includes(String(option.value));
          const isHighlighted = idx === highlighted;
          const symbol = field.valueType === VariableValueType.MULTI_ENUM
            ? (isSelected ? '■' : '□')
            : (isSelected ? '●' : '○');
          return (
            <Text key={option.label}>
              <Text color={isSelected ? ACCENT : GUTTER}>{symbol} </Text>
              <Text bold={isHighlighted} color={isHighlighted ? ACCENT : undefined} underline={isHighlighted && field.valueType === VariableValueType.MULTI_ENUM}>
                {option.label}
              </Text>
              {idx < options.length - 1 && <Text>   </Text>}
            </Text>
          );
        })}
      </Text>
    );
  }

  const text = answers[field.name] === undefined ? '' : String(answers[field.name]);
  if (text === '') {
    return (
      <Text>
        <Text inverse> </Text>
        {field.default !== undefined && <Text dimColor>{displayValue(field, field.default)}</Text>}
      </Text>
    );
  }

  return (
    <Text>
      <Text color={ACCENT}>{field.sensitive ? '•'.repeat(text.length) : text}</Text>
      <Text inverse> </Text>
    </Text>
  );
}

function Gutter() {
  return <Text color={GUTTER}>│</Text>;
}

/** The value of a field that isn't focused: the answer, the default (dimmed) or nothing yet */
function summary(field: VariableFormField, answer: unknown): React.ReactNode {
  const isEmpty = answer === undefined || answer === '' || (Array.isArray(answer) && answer.length === 0);
  if (!isEmpty) {
    return <Text color={ACCENT}>{displayValue(field, answer)}</Text>;
  }

  if (field.default !== undefined) {
    return <Text dimColor>{displayValue(field, field.default)}</Text>;
  }

  return <Text dimColor>—</Text>;
}

function displayValue(field: VariableFormField, value: unknown): string {
  if (field.sensitive) {
    return '••••••••';
  }

  if (field.valueType === VariableValueType.BOOLEAN) {
    return value === true || value === 'true' ? 'Yes' : 'No';
  }

  const text = formatVariableValue(value as never);
  return text === '' ? 'none' : text;
}

function typeLabel(field: VariableFormField): string {
  switch (field.valueType) {
    case VariableValueType.MULTI_ENUM: {
      return 'pick any';
    }

    case VariableValueType.NUMBER: {
      return 'number';
    }

    default: {
      return '';
    }
  }
}

function hints(field: VariableFormField | undefined, isLast: boolean): string {
  const next = isLast ? 'enter continue' : 'enter next';
  switch (field?.valueType) {
    case VariableValueType.ENUM:
    case VariableValueType.BOOLEAN: {
      return `←→ choose  ↑↓ move  ${next}  esc cancel`;
    }

    case VariableValueType.MULTI_ENUM: {
      return `←→ move  space select  ↑↓ next field  ${next}  esc cancel`;
    }

    default: {
      return `↑↓ move  ${next}  esc cancel`;
    }
  }
}

function selectOptions(field: VariableFormField): Array<{ label: string; value: unknown }> | null {
  if (field.valueType === VariableValueType.BOOLEAN) {
    return [{ label: 'Yes', value: true }, { label: 'No', value: false }];
  }

  if (field.valueType === VariableValueType.ENUM || field.valueType === VariableValueType.MULTI_ENUM) {
    return (field.options ?? []).map((o) => ({ label: o, value: o }));
  }

  return null;
}

function defaultCursor(field: VariableFormField, options: Array<{ value: unknown }>): number {
  const defaultValue = Array.isArray(field.default) ? field.default[0] : field.default;
  return Math.max(0, options.findIndex((o) => String(o.value) === String(defaultValue)));
}

function multiValue(field: VariableFormField, answers: Answers): string[] {
  const answer = answers[field.name];
  if (Array.isArray(answer)) {
    return answer.map(String);
  }

  return Array.isArray(field.default) ? field.default.map(String) : [];
}
