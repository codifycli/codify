import { type VariableValue, VariableValueType } from '@codifycli/schemas';

import { type VariableConfig } from '../entities/variable-config.js';

const TRUE_VALUES = new Set(['1', 'true', 'y', 'yes']);
const FALSE_VALUES = new Set(['0', 'false', 'n', 'no']);

/**
 * Converts a value (an answer, a --var flag, a value passed to a template or a default) to the type of the variable.
 * @throws Error with a message that can be shown to the user if the value is not valid
 */
export function coerceVariableValue(variable: VariableConfig, value: unknown): VariableValue {
  switch (variable.valueType) {
    case VariableValueType.BOOLEAN: {
      if (typeof value === 'boolean') {
        return value;
      }

      const text = String(value).trim().toLowerCase();
      if (TRUE_VALUES.has(text)) return true;
      if (FALSE_VALUES.has(text)) return false;
      throw new Error(`"${value}" is not a boolean (true or false)`);
    }

    case VariableValueType.ENUM: {
      const text = String(value).trim();
      if (!variable.options?.includes(text)) {
        throw new Error(`"${text}" is not one of the options: ${variable.options?.join(', ')}`);
      }

      return text;
    }

    case VariableValueType.MULTI_ENUM: {
      const items = (Array.isArray(value) ? value : String(value).split(','))
        .map((item) => String(item).trim())
        .filter((item) => item !== '');
      const invalid = items.filter((item) => !variable.options?.includes(item));
      if (invalid.length > 0) {
        throw new Error(`${invalid.map((i) => `"${i}"`).join(', ')} ${invalid.length === 1 ? 'is' : 'are'} not one of the options: ${variable.options?.join(', ')}`);
      }

      return [...new Set(items)];
    }

    case VariableValueType.NUMBER: {
      const number = typeof value === 'number' ? value : Number(String(value).trim());
      if (String(value).trim() === '' || !Number.isFinite(number)) {
        throw new Error(`"${value}" is not a number`);
      }

      return number;
    }

    default: {
      if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
        throw new Error('A text variable can\'t be a list or an object');
      }

      const text = String(value ?? '');
      if (text === '') {
        throw new Error('A value is required');
      }

      return text;
    }
  }
}

/** The value of a variable as text. Used to show defaults and values. */
export function formatVariableValue(value: undefined | VariableValue): string {
  if (value === undefined) {
    return '';
  }

  return Array.isArray(value) ? value.join(', ') : String(value);
}
