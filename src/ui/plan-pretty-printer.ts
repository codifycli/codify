import chalk from 'chalk';
import { ParameterOperation, PlanResponseData, ResourceOperation } from '@codifycli/schemas';

import { Plan, ResourcePlan } from '../entities/plan.js';

export function prettyFormatPlan(plan: Plan) {
  const builder = [
    '',
    '',
    chalk.bold('Codify Plan'),
    `Path: ${plan.project.codifyFiles}`,
    'The following actions will be performed',
    '',
  ];

  for (const resourcePlan of plan) {
    const formattedPlan = prettyFormatResourcePlan(resourcePlan);

    builder.push(chalk.bold(resourcePlan.id + ' will ' + resourceOperationText(resourcePlan.operation), formattedPlan));
  }

  return builder.join('\n')
}

export function prettyFormatResourcePlan(plan: ResourcePlan): string {
  switch (plan.operation) {
    case ResourceOperation.CREATE: {
      return prettyFormatCreatePlan(plan);
    }

    case ResourceOperation.DESTROY: {
      return prettyFormatDestroyPlan(plan);
    }

    case ResourceOperation.MODIFY:
    case ResourceOperation.RECREATE: {
      return prettyFormatModifyPlan(plan);
    }
  }

  return '';
}

function prettyFormatCreatePlan(plan: ResourcePlan): string {
  const parameters = plan.parameters
    .reduce((result, parameter) => {
      if (parameter.newValue === null || parameter.newValue === undefined) {
        return result;
      }

      const value = parameter.isSensitive ? '[Sensitive]' : parameter.newValue;
      result[parameter.name] = typeof parameter.newValue === 'string'
        ? escapeNewlines(value as string)
        : value;

      return result;
    }, {} as Record<string, unknown>)

  const json = JSON.stringify(parameters, null, 4)
    .split(/\n/g)
    .map((l) => ` ${l}`)
    .join('\n')
  return chalk.green(json);
}

function prettyFormatDestroyPlan(plan: ResourcePlan): string {
  const parameters = plan.parameters
    .reduce((result, parameter) => {
      if (parameter.previousValue === null || parameter.previousValue === undefined) {
        return result;
      }

      const value = parameter.isSensitive ? '[Sensitive]' : parameter.previousValue;
      result[parameter.name] = typeof parameter.previousValue === 'string'
        ? escapeNewlines(value as string)
        : value;

      return result;
    }, {} as Record<string, unknown>)

  const json = JSON.stringify(parameters, null, 4)
    .split(/\n/g)
    .map((l) => ` ${l}`)
    .join('\n')
  return chalk.red(json);
}

function prettyFormatModifyPlan(plan: ResourcePlan): string {
  const builder = [
    ' {'
  ];

  for (const parameter of plan.parameters) {
    if ((Array.isArray(parameter.previousValue) || parameter.previousValue === null)
      && (Array.isArray(parameter.newValue) || parameter.newValue === null)
      && !(parameter.previousValue === null && parameter.newValue === null)
      && !parameter.isSensitive
    ) {
      builder.push(formatArray(parameter));
    } else if (
      !parameter.isSensitive
      && isPlainObject(parameter.previousValue)
      && isPlainObject(parameter.newValue)
      && parameter.operation === ParameterOperation.MODIFY
    ) {
      builder.push(formatObjectDiff(parameter.name, parameter.previousValue, parameter.newValue));
    } else if (
      !parameter.isSensitive
      && isPlainObject(parameter.newValue)
      && (parameter.operation === ParameterOperation.ADD || parameter.operation === ParameterOperation.NOOP)
    ) {
      builder.push(formatObjectSingleSide(parameter.name, parameter.newValue, parameter.operation));
    } else if (
      !parameter.isSensitive
      && isPlainObject(parameter.previousValue)
      && parameter.operation === ParameterOperation.REMOVE
    ) {
      builder.push(formatObjectSingleSide(parameter.name, parameter.previousValue, parameter.operation));
    } else {
      const formattedParameter = formatParameter(parameter);

      const line = formattedParameter.split(/\n/g)
        .map((l) => `    ${l}`)
        .map((l, idx) => idx === 0 ? operationSymbol(parameter.operation) + l : ` ${l}`)
        .join('\n')

      builder.push(line);
    }
  }

  builder.push(' }')
  return builder.join('\n');
}

function escapeNewlines(str: string): string {
  return str.replaceAll('\n', '\\n');
}


function formatParameter(parameter: PlanResponseData['parameters'][0]): string {
  switch (parameter.operation) {
    case ParameterOperation.NOOP: {
      const value = parameter.isSensitive ? '[Sensitive]' : parameter.newValue;

      return typeof parameter.newValue === 'string'
        ? `"${parameter.name}": "${escapeNewlines(value as string)}",`
        : `"${parameter.name}": ${typeof value === 'object' ? JSON.stringify(value) : value},`
    }

    case ParameterOperation.ADD: {
      const value = parameter.isSensitive ? '[Sensitive]' : parameter.newValue;

      return typeof parameter.newValue === 'string'
        ? chalk.green(`"${parameter.name}": "${escapeNewlines(value as string)}",`)
        : chalk.green(`"${parameter.name}": ${typeof value === 'object' ? JSON.stringify(value) : value},`)
    }

    case ParameterOperation.REMOVE: {
      const value = parameter.isSensitive ? '[Sensitive]' : parameter.previousValue;

      return typeof parameter.previousValue === 'string'
        ? chalk.red(`"${parameter.name}": "${escapeNewlines(value as string)}",`)
        : chalk.red(`"${parameter.name}": ${typeof value === 'object' ? JSON.stringify(value) : value},`)
    }

    case ParameterOperation.MODIFY: {
      const newValue = parameter.isSensitive ? '[Sensitive]' : parameter.newValue;
      const previousValue = parameter.isSensitive ? '[Sensitive]' : parameter.previousValue;

      if (typeof parameter.newValue === 'string' && typeof parameter.previousValue === 'string') {
        return `"${parameter.name}": "${escapeNewlines(previousValue as string)}" -> "${escapeNewlines(newValue as string)}",`;
      }

      const prevFormatted = typeof previousValue === 'object' ? JSON.stringify(previousValue) : previousValue;
      const newFormatted = typeof newValue === 'object' ? JSON.stringify(newValue) : newValue;
      return `"${parameter.name}": ${prevFormatted} -> ${newFormatted},`;
    }
  }
}

function resourceOperationText(operation: ResourceOperation): string {
  switch (operation) {
    case ResourceOperation.CREATE: {
      return 'be created'
    }

    case ResourceOperation.MODIFY: {
      return 'be modified'
    }

    case ResourceOperation.RECREATE: {
      return 'be recreated'
    }

    case ResourceOperation.DESTROY: {
      return 'be destroyed'
    }

    case ResourceOperation.NOOP: {
      return 'not be changed'
    }
  }
}

function operationSymbol(operation: ParameterOperation): string {
  switch (operation) {
    case ParameterOperation.ADD: {
      return chalk.green('+')
    }

    case ParameterOperation.NOOP: {
      return ' '
    }

    case ParameterOperation.MODIFY: {
      return chalk.yellow('~')
    }

    case ParameterOperation.REMOVE: {
      return chalk.red('-')
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatObjectDiff(name: string, previousValue: Record<string, unknown>, newValue: Record<string, unknown>): string {
  const allKeys = Array.from(new Set([...Object.keys(previousValue), ...Object.keys(newValue)]));

  type Entry = { op: 'noop' | 'add' | 'remove' | 'modify'; key: string; prev?: unknown; next?: unknown };
  const entries: Entry[] = allKeys.map((key) => {
    const inPrev = Object.hasOwn(previousValue, key);
    const inNext = Object.hasOwn(newValue, key);
    if (!inPrev) return { op: 'add', key, next: newValue[key] };
    if (!inNext) return { op: 'remove', key, prev: previousValue[key] };
    if (JSON.stringify(previousValue[key]) === JSON.stringify(newValue[key])) {
      return { op: 'noop', key, next: newValue[key] };
    }
    return { op: 'modify', key, prev: previousValue[key], next: newValue[key] };
  });

  const CONTEXT = 2;
  const includedIndices = new Set<number>();
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].op !== 'noop') {
      for (let j = Math.max(0, i - CONTEXT); j <= Math.min(entries.length - 1, i + CONTEXT); j++) {
        includedIndices.add(j);
      }
    }
  }

  const resultLines: string[] = [`${chalk.yellow('~')}    "${name}": {`];
  let lastIncluded = -1;

  for (let i = 0; i < entries.length; i++) {
    if (!includedIndices.has(i)) continue;
    if (lastIncluded !== -1 && i > lastIncluded + 1) {
      resultLines.push('         ...');
    }
    lastIncluded = i;
    const { op, key, prev, next } = entries[i];

    if (op === 'noop') {
      resultLines.push(`       "${key}": ${formatValue(next)},`);
    } else if (op === 'add') {
      resultLines.push(`  ${chalk.green('+')}      ${chalk.green(`"${key}": ${formatValue(next)},`)}`);
    } else if (op === 'remove') {
      resultLines.push(`  ${chalk.red('-')}      ${chalk.red(`"${key}": ${formatValue(prev)},`)}`);
    } else {
      resultLines.push(`  ${chalk.yellow('~')}      "${key}": ${formatValue(prev)} -> ${formatValue(next)},`);
    }
  }

  resultLines.push('      },');
  return resultLines.join('\n');
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (value === null || value === undefined) return String(value);
  return JSON.stringify(value);
}

const OBJECT_SINGLE_SIDE_MAX_LINES = 20;

function formatObjectSingleSide(name: string, value: object, operation: ParameterOperation): string {
  const json = JSON.stringify(value, null, 2);
  const lines = json.split('\n');
  const truncated = lines.length > OBJECT_SINGLE_SIDE_MAX_LINES;
  const visibleLines = truncated ? lines.slice(0, OBJECT_SINGLE_SIDE_MAX_LINES) : lines;

  const colorFn = operation === ParameterOperation.REMOVE ? chalk.red : chalk.green;
  const sym = operationSymbol(operation);

  const formatted = visibleLines
    .map((l, idx) => idx === 0 ? `"${name}": ${l}` : l)
    .map((l) => `    ${colorFn(l)}`)
    .map((l, idx) => idx === 0 ? sym + l : ` ${l}`)
    .join('\n');

  return truncated ? formatted + '\n         ...' : formatted + ',';
}

function formatArray(parameter: PlanResponseData['parameters'][0]): string {
  const { name, newValue, operation, previousValue } = parameter;
  const a = previousValue as null | unknown[];
  const b = newValue as null | unknown[];

  const mappedA = a?.map((l) =>
    typeof l === 'object' ? JSON.stringify(l) : l
  ) ?? [];
  const mappedB = b?.map((l) =>
    typeof l === 'object' ? JSON.stringify(l) : l
  ) ?? [];

  if (operation === ParameterOperation.ADD) {
    return JSON.stringify(mappedB, null, 4)
      .split(/\n/g)
      .map((l, idx) => idx === 0 ? `"${name}": ${l}` : l)
      .map((l) => `    ${chalk.green(l)}`)
      .map((l, idx) => idx === 0 ? operationSymbol(operation) + l : ` ${l}`)
      .join('\n') + ','
  }

  if (operation === ParameterOperation.REMOVE) {
    return JSON.stringify(mappedA, null, 4)
      .split(/\n/g)
      .map((l, idx) => idx === 0 ? `"${name}": ${l}` : l)
      .map((l) => `    ${chalk.red(l)}`)
      .map((l, idx) => idx === 0 ? operationSymbol(operation) + l : ` ${l}`)
      .join('\n') + ','
  }

  if (operation === ParameterOperation.NOOP) {
    return JSON.stringify(mappedB, null, 4)
      .split(/\n/g)
      .map((l, idx) => idx === 0 ? `"${name}": ${l}` : l)
      .map((l) => `    ${l}`)
      .join('\n') + ','
  }

  const noop = mappedA.filter((l) => mappedB.includes(l))
  const remove = mappedA.filter((l) => !mappedB.includes(l));
  const add = mappedB.filter((l) => !mappedA.includes(l));

  return [
    `${operationSymbol(operation)}    "${name}": [`,
    ...noop.map((l) => `         ${l},`),
    ...add.map((l) => `${operationSymbol(ParameterOperation.ADD)}        ${chalk.green(l + ',')}`),
    ...remove.map((l) => `${operationSymbol(ParameterOperation.REMOVE)}        ${chalk.red(l + ',')}`),
    '     ],'
  ].join('\n')
}
