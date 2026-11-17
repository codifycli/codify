import type { UIMessage } from 'ai';

/** Tools the CLI executes locally. Their results have to be sent back to the agent. */
export const CLIENT_TOOL_NAMES = new Set(['read_file', 'list_directory', 'search_files', 'run_command', 'codify_plan', 'codify_apply']);

type Part = UIMessage['parts'][number];

function toolName(part: Part): string | undefined {
  if (part.type === 'dynamic-tool') return (part as { toolName: string }).toolName;
  return part.type.startsWith('tool-') ? part.type.slice('tool-'.length) : undefined;
}

function hasResult(part: Part): boolean {
  const state = (part as { state?: string }).state;
  return state === 'output-available' || state === 'output-error' || state === 'output-denied';
}

/**
 * Continue the run once every client tool call in the newest step has a result.
 *
 * - Server tools (registry lookups, `ask_question`) run on the server. A step with only those is finished, and
 *   `ask_question` in particular must wait for the user's answer instead of being resubmitted.
 * - When the model calls a client tool and a server tool in the same step, Mastra ends the run without running the
 *   server tool, so that call never gets a result. Only the client tools' results are needed to continue (Mastra
 *   leaves the unanswered call out of the model's next prompt).
 */
export function shouldSendToolResults({ messages }: { messages: UIMessage[] }): boolean {
  const last = messages.at(-1);
  if (last?.role !== 'assistant') return false;

  const lastStepStart = last.parts.map((p) => p.type).lastIndexOf('step-start');
  const lastStep = last.parts.slice(lastStepStart + 1).filter((p) => toolName(p) !== undefined);
  if (lastStep.some((p) => toolName(p) === 'ask_question')) return false;

  const clientCalls = lastStep.filter((p) => CLIENT_TOOL_NAMES.has(toolName(p)!));
  return clientCalls.length > 0 && clientCalls.every((p) => hasResult(p));
}
