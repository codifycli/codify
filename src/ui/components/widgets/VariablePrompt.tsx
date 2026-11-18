import { VariableValueType } from '@codifycli/schemas';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import React from 'react';

import type { VariablePromptRequest } from '../../../variables/variable-resolver.js';

import { formatVariableDefault, formatVariableHint, formatVariableLabel, formatVariableQuestion } from '../../variable-prompt-formatter.js';
import { MultiSelect } from '../multi-select/MultiSelect.js';
import { TextInput } from './TextInput.js';

/**
 * Asks for the value of a single variable. Submits the raw answer: text (an empty text uses the default), a boolean, an
 * option or a list of options.
 */
export function VariablePrompt({ request, onSubmit }: {
  request: VariablePromptRequest;
  onSubmit: (value: unknown) => void;
}) {
  const defaultText = formatVariableDefault(request);

  return (
    <Box flexDirection='column'>
      <Text>
        <Text bold>{formatVariableQuestion(request)}</Text>
        {/* With a label, the name is shown as well: it's what --var and the config use */}
        {request.label && <Text dimColor>  {formatVariableLabel(request)}</Text>}
        <Text dimColor> ({formatVariableHint(request)}{defaultText === undefined ? '' : `, default: ${defaultText}`})</Text>
      </Text>
      { request.description && <Text dimColor>{request.description}</Text> }
      { request.implicit && <Text dimColor>Used in the config but not declared as a variable</Text> }
      { request.error && <Text color='red'>{request.error}</Text> }
      <VariableInput onSubmit={onSubmit} request={request} />
    </Box>
  );
}

function VariableInput({ request, onSubmit }: { request: VariablePromptRequest; onSubmit: (value: unknown) => void }) {
  switch (request.valueType) {
    case VariableValueType.BOOLEAN: {
      const items = [{ label: 'Yes', value: true }, { label: 'No', value: false }];
      return <SelectInput
        initialIndex={request.default === false ? 1 : 0}
        items={items}
        onSelect={(item) => { onSubmit(item.value); }}
      />;
    }

    case VariableValueType.ENUM: {
      const options = request.options ?? [];
      const defaultIndex = options.indexOf(String(request.default));
      return <SelectInput
        initialIndex={Math.max(defaultIndex, 0)}
        items={options.map((o) => ({ label: o, value: o }))}
        limit={9}
        onSelect={(item) => { onSubmit(item.value); }}
      />;
    }

    case VariableValueType.MULTI_ENUM: {
      const items = (request.options ?? []).map((o) => ({ label: o, value: o }));
      const defaults = Array.isArray(request.default) ? request.default.map(String) : [];
      return (
        <Box flexDirection='column'>
          <Text dimColor>Space to select, enter to continue</Text>
          <MultiSelect
            defaultSelected={items.filter((i) => defaults.includes(i.value))}
            items={items}
            limit={9}
            onSubmit={(result) => { onSubmit(result.map((r) => r.value)); }}
          />
        </Box>
      );
    }

    default: {
      return <TextInput
        mask={request.sensitive}
        onSubmit={(value) => { onSubmit(value); }}
        placeholder={formatVariableDefault(request)}
      />;
    }
  }
}
