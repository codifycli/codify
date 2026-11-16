import type { CommandRequestData } from '@codifycli/schemas';
import type { ReactNode } from 'react';

import { DefaultReporter } from '../ui/reporters/default-reporter.js';
import { codifyApplyTool, codifyPlanTool } from './tools/codify-tools.js';
import { listDirectoryTool, readFileTool, searchFilesTool } from './tools/fs-tools.js';
import { runCommandTool } from './tools/run-command.js';

/** Minimal observable value for useSyncExternalStore */
export class Store<T> {
  private listeners = new Set<() => void>();

  constructor(private value: T) {}

  get = (): T => this.value;

  set(value: T): void {
    this.value = value;
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export interface ApprovalRequest {
  command: string;
  reason: string;
  asRoot: boolean;
  resolve: (approved: boolean) => void;
}

/**
 * Everything the chat's client tools need from the CLI: the embedded reporter (plan/apply UI, sudo prompts), the
 * current thread, and UI state the tools wait on (command approvals). It also collects the reporter's permanent
 * output (the plan and apply results) per codify_apply call so the chat can show it inside that tool's card.
 */
export class ToolHost {
  readonly approval = new Store<ApprovalRequest | null>(null);
  /** True while a tool that takes over the screen (codify_apply) is running */
  readonly busy = new Store(false);
  /** Reporter output per tool call id. `null` key: output not tied to a tool call. */
  readonly artifacts = new Store<ReadonlyMap<null | string, readonly ReactNode[]>>(new Map());

  threadId: null | string = null;
  private artifactTarget: null | string = null;

  readonly reporter: DefaultReporter;

  constructor(reporter?: DefaultReporter) {
    this.reporter = reporter ?? new DefaultReporter({
      embedded: true,
      onStaticOutput: (node) => this.addArtifact(node),
    });
  }

  private requireThread(): string {
    if (!this.threadId) throw new Error('No active conversation');
    return this.threadId;
  }

  addArtifact(node: ReactNode): void {
    const next = new Map(this.artifacts.get());
    next.set(this.artifactTarget, [...(next.get(this.artifactTarget) ?? []), node]);
    this.artifacts.set(next);
  }

  readFile = (args: { limit?: number; offset?: number; path: string; }) => readFileTool(args);
  listDirectory = (args: { path: string }) => listDirectoryTool(args);
  searchFiles = (args: { glob?: string; path: string; pattern: string; }) => searchFilesTool(args);

  runCommand = (args: { command: string; reason?: string }) => runCommandTool(args, {
    requestApproval: (request) => new Promise<boolean>((resolve) => {
      this.approval.set({
        ...request,
        resolve: (approved) => {
          this.approval.set(null);
          resolve(approved);
        },
      });
    }),
    getSudoPassword: (command) => this.reporter.promptSudo('codify agent', {
      command,
      options: { requiresRoot: true },
    } as unknown as CommandRequestData),
    setReporterSilent: (silent) => { this.reporter.silent = silent; },
  });

  // The reporter's step-by-step log lines ("Codify plan started", ...) duplicate the progress UI and would print
  // above the chat transcript, so they are muted while the agent plans and applies.
  codifyPlan = async (args: { config: string }) => {
    this.reporter.silent = true;
    try {
      return await codifyPlanTool(args, { threadId: this.requireThread() });
    } finally {
      this.reporter.silent = false;
    }
  };

  codifyApply = async (args: { config: string }, toolCallId: string) => {
    this.busy.set(true);
    this.artifactTarget = toolCallId;
    this.reporter.silent = true;
    try {
      return await codifyApplyTool(args, { reporter: this.reporter, threadId: this.requireThread() });
    } finally {
      this.reporter.silent = false;
      this.artifactTarget = null;
      this.busy.set(false);
    }
  };
}
