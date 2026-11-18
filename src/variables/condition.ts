import { type Condition, type FlatCondition, type VariableMatch, type VariableValue } from '@codifycli/schemas';

/** The value of a variable as seen by a condition. Undefined if the variable was not asked (its when didn't match). */
export type ConditionValues = Map<string, { value: undefined | VariableValue; multi: boolean }>;

const ANY = 'any';

/** Names of the variables a condition references. */
export function conditionReferences(condition: Condition | undefined): string[] {
  if (!condition) {
    return [];
  }

  const names = Object.keys(condition).filter((k) => k !== ANY);
  for (const alternative of condition.any ?? []) {
    names.push(...Object.keys(alternative));
  }

  return [...new Set(names)];
}

/**
 * True if every key of the condition matches. `any` matches if at least one of its conditions matches. A condition on
 * a variable without a value never matches (with `not` as well).
 */
export function evaluateCondition(condition: Condition | undefined, values: ConditionValues): boolean {
  if (!condition) {
    return true;
  }

  const { any, ...rest } = condition;
  if (!matchesAll(rest as FlatCondition, values)) {
    return false;
  }

  return !any || any.some((alternative) => matchesAll(alternative, values));
}

function matchesAll(condition: FlatCondition, values: ConditionValues): boolean {
  return Object.entries(condition).every(([name, match]) => matches(values.get(name), match));
}

function matches(variable: undefined | { value: undefined | VariableValue; multi: boolean }, match: VariableMatch): boolean {
  if (variable?.value === undefined) {
    return false;
  }

  if (match !== null && typeof match === 'object' && !Array.isArray(match)) {
    return !matches(variable, match.not);
  }

  const expected = (Array.isArray(match) ? match : [match]).map(String);
  const actual = (Array.isArray(variable.value) ? variable.value : [variable.value]).map(String);

  // multiEnum: includes (one of) the values. Others: equals (one of) the values
  return variable.multi
    ? expected.some((e) => actual.includes(e))
    : actual.length === 1 && expected.includes(actual[0]);
}
