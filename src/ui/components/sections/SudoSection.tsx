import { Box } from 'ink';
import { RenderEvent } from '../../reporters/reporter.js';
import React from 'react';
import { PasswordInput } from '@inkjs/ui';

export function SudoSection() {
  return <Box flexDirection="column">
    <Text>Password:</Text>
    {/* Use sudoAttemptCount as a hack to reset password input between attempts */}
    <PasswordInput key={sudoAttemptCount} onSubmit={(password) => {
      emitter.emit(RenderEvent.PROMPT_SUDO_RESULT, password);
    }}/>
  </Box>

}
