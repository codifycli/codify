import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

import Spinner from '../progress/spinner.js';

export function SudoPasswordInput(props: {
  title?: string;
  hasError: boolean;
  cancellable: boolean;
  savable: boolean;
  onSubmit: (password: string, save: boolean) => void;
  onCancel: () => void;
}) {
  const { title, hasError, cancellable, savable, onSubmit, onCancel } = props;
  const [value, setValue] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const borderColor = hasError ? 'red' : 'cyan';

  useInput((input, key) => {
    if (isChecking) return;

    if (key.escape && cancellable) {
      onCancel();
      return;
    }

    // Enter saves the password for the rest of the session (when savable). Tab submits without saving.
    if (key.return || (key.tab && savable)) {
      setIsChecking(true);
      onSubmit(value, savable && key.return);
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
      {title && <Text bold>{title}</Text>}
      {isChecking ? (
        <Spinner label="Checking password..." />
      ) : (
        <Box>
          <Text bold color={borderColor}>Sudo Password</Text>{cancellable && <Text dimColor color='gray'> (save for session)</Text>}<Text bold color={borderColor}>: </Text>
          <Text>{value.replace(/./g, '*')}</Text>
          <Text inverse> </Text>
        </Box>
      )}
      {hasError && <Text color="red">Incorrect password, try again</Text>}
      {!isChecking && (
        <Text dimColor>
          {savable ? 'Enter to confirm and save for this session · Tab to confirm without saving' : 'Enter to confirm'}
          {cancellable ? ' · Esc to cancel' : ''}
        </Text>
      )}
    </Box>
  );
}
