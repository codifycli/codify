import { VariableValueType } from '@codifycli/schemas';

import type { VariablePromptRequest } from '../variables/variable-resolver.js';

import { formatVariableValue } from '../variables/variable-values.js';

/** Ex: projectName, or astro-blog › projectName for the variable of a template */
export function formatVariableLabel(request: Pick<VariablePromptRequest, 'name' | 'scope'>): string {
  return [...request.scope, request.name].join(' › ');
}

/** The question: the label, or the (qualified) name when there is no label */
export function formatVariableQuestion(request: Pick<VariablePromptRequest, 'label' | 'name' | 'scope'>): string {
  return request.label ?? formatVariableLabel(request);
}

/** Short description of what is expected. Ex: "number", "one of: blog, portfolio" */
export function formatVariableHint(request: VariablePromptRequest): string {
  switch (request.valueType) {
    case VariableValueType.BOOLEAN: {
      return 'yes or no';
    }

    case VariableValueType.ENUM: {
      return 'pick one';
    }

    case VariableValueType.MULTI_ENUM: {
      return 'pick any';
    }

    case VariableValueType.NUMBER: {
      return 'number';
    }

    default: {
      return 'text';
    }
  }
}

export function formatVariableDefault(request: VariablePromptRequest): string | undefined {
  if (request.default === undefined) {
    return undefined;
  }

  return request.sensitive ? '********' : formatVariableValue(request.default);
}
