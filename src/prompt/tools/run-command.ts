import { classifyCommand } from './command-policy.js';
import { spawnSafe } from '../../utils/spawn.js';

const MAX_OUTPUT_CHARS = 20_000;
const DEFAULT_TIMEOUT_MS = 60_000;

export interface RunCommandResult {
  command: string;
  exitCode?: number;
  output?: string;
  /** Set when the command didn't run */
  declined?: string;
  truncated?: boolean;
}

export interface RunCommandHost {
  /** Ask the user whether to run a command the policy didn't allow automatically */
  requestApproval(request: { command: string; reason: string; asRoot: boolean }): Promise<boolean>;
  /** Ask for (or reuse) the sudo password. Undefined if the user cancels. */
  getSudoPassword(command: string): Promise<string | undefined>;
  /** Mute the embedded reporter's own "Running command" logs while the agent's command runs */
  setReporterSilent(silent: boolean): void;
}

export async function runCommandTool(
  args: { command: string; reason?: string },
  host: RunCommandHost,
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<RunCommandResult> {
  const decision = classifyCommand(args.command);

  if (decision.kind === 'denied') {
    return { command: args.command, declined: decision.reason };
  }

  if (decision.kind === 'approval' || decision.kind === 'sudo') {
    const approved = await host.requestApproval({
      command: args.command,
      reason: decision.kind === 'sudo' ? 'It runs as root (sudo).' : decision.reason,
      asRoot: decision.kind === 'sudo',
    });
    if (!approved) {
      return { command: args.command, declined: 'The user declined to run this command.' };
    }
  }

  let password: string | undefined;
  if (decision.kind === 'sudo') {
    password = await host.getSudoPassword(decision.command);
    if (!password) {
      return { command: args.command, declined: 'The user did not provide a sudo password.' };
    }
  }

  host.setReporterSilent(true);
  try {
    const result = await spawnSafe(
      decision.kind === 'sudo' ? decision.command : args.command,
      {
        cwd: options.cwd ?? process.cwd(),
        // Interactive so the user's rc files load (nvm, pyenv, PATH changes), like their own terminal
        interactive: true,
        requiresRoot: decision.kind === 'sudo',
        allowSudoInCommand: true,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      },
      undefined,
      password,
    );

    // Output comes from a pty: normalize its \r\n line endings for the model and for rendering
    const output = result.data.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    const truncated = output.length > MAX_OUTPUT_CHARS;
    return {
      command: args.command,
      exitCode: result.exitCode,
      // Keep the end of long output: errors and summaries usually come last
      output: truncated ? '…' + output.slice(-MAX_OUTPUT_CHARS) : output,
      ...(truncated ? { truncated } : {}),
    };
  } finally {
    host.setReporterSilent(false);
  }
}
