import chalk from 'chalk';
import { ParameterOperation, PlanResponseData, ResourceOperation } from 'codify-schemas';

import { Plan, ResourcePlan } from '../entities/plan.js';

export function prettyFormatPlan(plan: Plan) {
  const builder = [
    '',
    '',
    chalk.bold('Codify Plan'),
    `Path: ${plan.project.path}`,
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
    // TODO: Add support for object types as well in the future
    if ((Array.isArray(parameter.previousValue) || parameter.previousValue === null)
      && (Array.isArray(parameter.newValue) || parameter.newValue === null)
      && !(parameter.previousValue === null && parameter.newValue === null)
      && !parameter.isSensitive
    ) {
      const line = formatArray(parameter);
      builder.push(line);
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
        : `"${parameter.name}": ${value},`
    }

    case ParameterOperation.ADD: {
      const value = parameter.isSensitive ? '[Sensitive]' : parameter.newValue;

      return typeof parameter.newValue === 'string'
        ? chalk.green(`"${parameter.name}": "${escapeNewlines(value as string)}",`)
        : chalk.green(`"${parameter.name}": ${value},`)
    }

    case ParameterOperation.REMOVE: {
      const value = parameter.isSensitive ? '[Sensitive]' : parameter.previousValue;

      return typeof parameter.previousValue === 'string'
        ? chalk.red(`"${parameter.name}": "${escapeNewlines(value as string)}",`)
        : chalk.red(`"${parameter.name}": ${value},`)
    }

    case ParameterOperation.MODIFY: {
      const newValue = parameter.isSensitive ? '[Sensitive]' : parameter.newValue;
      const previousValue = parameter.isSensitive ? '[Sensitive]' : parameter.previousValue;

      return typeof parameter.newValue === 'string' && typeof parameter.previousValue === 'string'
        ? `"${parameter.name}": "${escapeNewlines(previousValue as string)}" -> "${escapeNewlines(newValue as string)}",`
        : `"${parameter.name}": ${previousValue} -> ${newValue},`
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
