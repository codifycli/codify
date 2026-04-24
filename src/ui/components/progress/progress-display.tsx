import { PasswordInput } from '@inkjs/ui';
import { Box, Text, useInput } from 'ink';
import { useAtom } from 'jotai';
import { EventEmitter } from 'node:events';
import React, { useLayoutEffect, useState } from 'react';

import { ProcessName } from '../../../events/context.js';
import { RenderEvent } from '../../reporters/reporter.js';
import { store } from '../../store/index.js';
import Spinner from './spinner.js';

export enum ProgressStatus {
  IN_PROGRESS,
  FINISHED,
}

export interface ProgressState {
  name: string,
  label: string;
  status: ProgressStatus;
  subProgresses: Array<{
    name: string,
    label: string;
    status: ProgressStatus;
  }> | null;
}

export function ProgressDisplay(props: { emitter: EventEmitter }) {
  const { emitter } = props;
  const [progress] = useAtom(store.progressState);
  const [isVerbose, setIsVerbose] = useState(false);
  const [isEnteringPassword, setIsEnteringPassword] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [passwordAttempts, setPasswordAttempts] = useState(0);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordInputKey, setPasswordInputKey] = useState(0);

  const isApplyOrDestroy = progress?.name === ProcessName.APPLY || progress?.name === ProcessName.DESTROY;

  useLayoutEffect(() => {
    const onResult = ({ success }: { success: boolean }) => {
      if (success) {
        setPasswordSaved(true);
        setIsEnteringPassword(false);
        setPasswordError(false);
        setPasswordAttempts(0);
      } else {
        setPasswordAttempts((prev) => {
          const next = prev + 1;
          if (next >= 3) {
            setIsEnteringPassword(false);
            setPasswordError(false);
            return 0;
          }
          setPasswordError(true);
          setPasswordInputKey((k) => k + 1);
          return next;
        });
      }
    };

    const onPreSupplied = () => setPasswordSaved(true);

    emitter.on(RenderEvent.SUDO_PASSWORD_RESULT, onResult);
    emitter.on(RenderEvent.SUDO_PASSWORD_PRE_SUPPLIED, onPreSupplied);

    return () => {
      emitter.off(RenderEvent.SUDO_PASSWORD_RESULT, onResult);
      emitter.off(RenderEvent.SUDO_PASSWORD_PRE_SUPPLIED, onPreSupplied);
    };
  }, []);

  useInput((input) => {
    if (!isApplyOrDestroy) return;
    if (input === 'v') {
      setIsVerbose((prev) => !prev);
      emitter.emit(RenderEvent.TOGGLE_VERBOSITY);
    }
    if (input === 'p' && !passwordSaved) {
      setIsEnteringPassword((prev) => !prev);
      setPasswordError(false);
      setPasswordAttempts(0);
      setPasswordInputKey((k) => k + 1);
    }
  });

  if (!progress) {
    return;
  }

  const { label, status, subProgresses } = progress;

  return <Box flexDirection="column">
    {
      status === ProgressStatus.IN_PROGRESS
        ? <Spinner label={label} type="dots" />
        : <Text><Text color='greenBright'>✔</Text> {label}</Text>
    }

    {!isEnteringPassword && (
      <Box flexDirection="column" marginLeft={2}>
        <SubProgressDisplay subProgresses={subProgresses}/>
      </Box>
    )}

    {isEnteringPassword && (
      <Box flexDirection="column" marginTop={1}>
        <Text color={passwordError ? 'red' : 'cyan'}>{'─'.repeat(40)}</Text>
        <Box>
          <Text> Password: </Text>
          <PasswordInput key={passwordInputKey} onSubmit={(pw) => emitter.emit(RenderEvent.SUDO_PASSWORD_SUBMITTED, pw)} />
        </Box>
        {passwordError && (
          <Text color="red">{` Incorrect password, try again (${passwordAttempts}/3)`}</Text>
        )}
        <Text color={passwordError ? 'red' : 'cyan'}>{'─'.repeat(40)}</Text>
      </Box>
    )}

    {isApplyOrDestroy && (
      <Box flexDirection="column">
        <Text dimColor>{isVerbose ? '[v] Hide verbose logs' : '[v] Show verbose logs'}</Text>
        {passwordSaved
          ? <Text color="green">✓ sudo password</Text>
          : <Text dimColor>{isEnteringPassword ? '[p] Cancel' : '[p] Enter sudo password'}</Text>
        }
      </Box>
    )}
  </Box>
}

export function SubProgressDisplay(
  props: {
    subProgresses: ProgressState['subProgresses'],
  }
) {
  const { subProgresses } = props;

  return <>{
    subProgresses && subProgresses
      // Sort the subprocesses so that in progress ones are always at the bottom
      .sort((a, b) => a.status === ProgressStatus.IN_PROGRESS ? 1 : -1)
      // Limit the max number of subprocesses to 5. Too many doesn't look good and causes a wasm memory access error (yoga)
      .slice(Math.max(0, subProgresses.length - 5), subProgresses.length)
      .map((s, idx) =>
        s.status === ProgressStatus.IN_PROGRESS
          ? <Spinner key={idx} label={s.label} type="dots" />
          : <Text key={idx}><Text color='greenBright'>✔</Text> {s.label}</Text>
      )
  }</>
}
