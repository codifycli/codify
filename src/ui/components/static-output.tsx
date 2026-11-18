import { Static, type StaticProps } from 'ink';
import React, { createContext, type ReactNode, useContext, useLayoutEffect, useRef } from 'react';

/**
 * When set, permanent output goes to the host instead of Ink's <Static>.
 *
 * Ink renders a single <Static> region per app (the first one in the tree), and silently drops the items of any
 * other. `codify prompt` embeds the DefaultReporter's UI inside its own chat app, which owns the <Static> transcript,
 * so in that mode the reporter hands each permanent element (plan, apply result, ...) to the chat to place in the
 * transcript itself.
 */
export const StaticSinkContext = createContext<((node: ReactNode) => void) | null>(null);

export function StaticOutput<T>(props: {
  children: (item: T, index: number) => ReactNode;
  items: T[];
  style?: StaticProps<T>['style'];
}) {
  const sink = useContext(StaticSinkContext);
  const emitted = useRef(0);

  useLayoutEffect(() => {
    if (!sink) return;
    for (; emitted.current < props.items.length; emitted.current++) {
      sink(props.children(props.items[emitted.current], emitted.current));
    }
  });

  if (sink) return null;

  return <Static items={props.items} style={props.style}>{props.children}</Static>;
}
