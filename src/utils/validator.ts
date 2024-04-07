import { valid as semverValid } from 'semver';

import { ResourceParameterType } from '../config-compiler/language-definition.js';

//******************
// Regex
//******************

const urlRegex = /[\w#%+.:=@~-]{1,256}\.[\d()a-z]{1,6}\b([\w#%&()+./:=?@~-]*)/gi;
const nameRegex = /^[$_a-z][\w$]*$/gi;

//*****************
// Validators
//*****************

export function validateTypeString(actual: unknown): actual is string {
  return typeof actual === 'string';
}

export function validateTypeBoolean(actual: unknown): actual is boolean {
  return typeof actual === 'boolean';
}

export function validateTypeArray(actual: unknown): actual is [] {
  return Array.isArray(actual);
}

export function validateTypeNumber(actual: unknown): actual is number {
  return typeof actual === 'number';
}

export function validateTypeRecordStringUnknown(actual: unknown): actual is Record<string, unknown> | never {
  return typeof actual === 'object';
}

export function validateTypeRecordStringString(actual: unknown): actual is Record<string, string> {
  if (!validateTypeRecordStringUnknown(actual)) {
    return false;
  }

  for (const value of Object.values(actual)) {
    if (typeof value !== 'string') {
      return false;
    }
  }

  return true;
}

export function validateTypeResourceParameterType(actual: unknown): actual is ResourceParameterType {
  return validateTypeString(actual) && Object.values(ResourceParameterType).includes(actual as ResourceParameterType);
}

export function validateStringEq(actual: unknown, expected: string): actual is string {
  return actual === expected;
}

export function validateNameString(actual: unknown): actual is string {
  return validateTypeString(actual) && actual.match(nameRegex) !== null;
}

export function validateUrl(actual: unknown): actual is string {
  return validateTypeString(actual) && actual.match(urlRegex) !== null;
}

export function validateSemver(actual: unknown): actual is string {
  return validateTypeString(actual) && semverValid(actual) !== null;
}

export function validateAllowedObjectKeys(actual: unknown, allowedKeys: string[]): actual is Record<string, unknown> {
  const keySet = new Set(allowedKeys);

  return validateTypeRecordStringUnknown(actual) && Object.keys(actual).every((k) => keySet.has(k));
}

export function validateResourceParameterType(actual: unknown, type: ResourceParameterType): boolean {

  /* eslint-disable unicorn/switch-case-braces */
  switch (type) {
    case ResourceParameterType.ARRAY:
      return validateTypeArray(actual);
    case ResourceParameterType.STRING:
      return validateTypeString(actual);
    case ResourceParameterType.BOOLEAN:
      return validateTypeBoolean(actual);
    case ResourceParameterType.NUMBER:
      return validateTypeNumber(actual);
    case ResourceParameterType.OBJECT:
      return validateTypeRecordStringUnknown(actual);
    default:
      return false;
  }
  /* eslint-enable unicorn/switch-case-braces */
}


