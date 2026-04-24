import { Text, useInput } from 'ink';
import React, { useState } from 'react';

export function TextInput(props: {
  onSubmit: (value: string) => void;
  placeholder?: string;
}) {
  const { onSubmit, placeholder } = props;
  const [value, setValue] = useState('');

  useInput((input, key) => {
    if (key.return) {
      onSubmit(value);
      return;
    }

    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setValue((prev) => prev + input);
    }
  });

  const showPlaceholder = value.length === 0 && placeholder;

  return (
    <Text>
      {showPlaceholder
        ? <Text dimColor>{placeholder}<Text inverse> </Text></Text>
        : <Text>{value}<Text inverse> </Text></Text>
      }
    </Text>
  );
}
