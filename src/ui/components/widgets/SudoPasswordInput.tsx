import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

import Spinner from '../progress/spinner.js';

export function SudoPasswordInput(props: {
  hasError: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const { hasError, onSubmit, onCancel } = props;
  const [value, setValue] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const borderColor = hasError ? 'red' : 'cyan';

  useInput((input, key) => {
    if (isChecking) return;

    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      setIsChecking(true);
      onSubmit(value);
      setValue('');
      return;
    }

    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    // Ignore non-printable characters
    if (input && !key.ctrl && !key.meta) {
      setValue((prev) => prev + input);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderTop={true}
      borderBottom={true}
      borderLeft={false}
      borderRight={false}
      borderColor={borderColor}
      marginTop={1}
    >
      {isChecking ? (
        <Spinner label="Checking password..." />
      ) : (
        <Box gap={1}>
          <Text bold color={borderColor}>Sudo Password:</Text>
          <Text>{value.replace(/./g, '*')}</Text>
          <Text inverse> </Text>
        </Box>
      )}
      {hasError && <Text color="red">Incorrect password, try again</Text>}
      {!isChecking && <Text dimColor>Enter to confirm · Esc to cancel</Text>}
    </Box>
  );
}
