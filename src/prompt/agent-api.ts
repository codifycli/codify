import type { UIMessage } from 'ai';

import { config } from '../config.js';
import type { AgentAuth } from './auth.js';

export interface AgentThread {
  id: string;
  title: string;
  updatedAt: Date;
}

export class AgentApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Thin client for the Mastra memory REST API used by `codify prompt`. CLI threads are tagged with
 * `metadata.namespace = 'cli'` so they stay separate from the dashboard's chat lists.
 */
export class AgentApi {
  constructor(private auth: AgentAuth, private baseUrl = config.agentUrl) {}

  chatUrl(): string {
    return `${this.baseUrl}/chat/${config.cliAgentId}`;
  }

  authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.auth.token}` };
  }

  async createThread(title: string): Promise<AgentThread> {
    const thread = await this.request<RawThread>(
      `/api/memory/threads?agentId=${config.cliAgentId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          resourceId: this.auth.userId,
          title,
          metadata: { namespace: config.cliThreadNamespace },
        }),
      },
    );
    return toThread(thread);
  }

  async listThreads(limit = 20): Promise<AgentThread[]> {
    const params = new URLSearchParams({
      agentId: config.cliAgentId,
      resourceId: this.auth.userId,
      metadata: JSON.stringify({ namespace: config.cliThreadNamespace }),
      perPage: String(limit),
      page: '0',
      orderBy: JSON.stringify({ field: 'updatedAt', direction: 'DESC' }),
    });
    const result = await this.request<{ threads?: RawThread[] } | RawThread[]>(`/api/memory/threads?${params}`);
    const threads = Array.isArray(result) ? result : result.threads ?? [];
    return threads.map(toThread);
  }

  async getMessages(threadId: string): Promise<UIMessage[]> {
    const params = new URLSearchParams({ agentId: config.cliAgentId, perPage: 'false' });
    const result = await this.request<{ messages?: RawMessage[] } | RawMessage[]>(
      `/api/memory/threads/${encodeURIComponent(threadId)}/messages?${params}`,
    );
    const messages = Array.isArray(result) ? result : result.messages ?? [];
    return toUIMessages(messages);
  }

  private async request<T>(pathAndQuery: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${pathAndQuery}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...this.authHeaders(), ...init.headers },
    });

    if (!res.ok) {
      throw new AgentApiError(res.status, `Codify agent request failed (${res.status}): ${await res.text()}`);
    }

    return await res.json() as T;
  }
}

interface RawThread {
  id: string;
  title?: null | string;
  updatedAt?: string;
  createdAt?: string;
}

interface RawMessage {
  id: string;
  role: string;
  createdAt?: string;
  content: unknown;
}

function toThread(raw: RawThread): AgentThread {
  return {
    id: raw.id,
    title: raw.title || 'New chat',
    updatedAt: new Date(raw.updatedAt ?? raw.createdAt ?? Date.now()),
  };
}

/**
 * Convert messages stored by Mastra memory (v2 format: `content.parts` with `tool-invocation` parts) into AI SDK UI
 * messages, the format the chat runtime is seeded with. Mirrors the dashboard's history adapter.
 */
export function toUIMessages(raw: RawMessage[]): UIMessage[] {
  return raw
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const content = m.content as unknown;
      const rawParts: unknown[] = Array.isArray(content)
        ? content
        : content && typeof content === 'object' && Array.isArray((content as { parts?: unknown[] }).parts)
          ? (content as { parts: unknown[] }).parts
          : typeof content === 'string'
            ? [{ type: 'text', text: content }]
            : [];

      const parts = rawParts.flatMap((p) => {
        const part = p as Record<string, unknown>;
        if (part.type === 'step-start') return [];
        if (part.type === 'tool-invocation' && part.toolInvocation) {
          const invocation = part.toolInvocation as Record<string, unknown>;
          const hasResult = invocation.state === 'result';
          return [{
            type: 'dynamic-tool',
            toolName: invocation.toolName,
            toolCallId: invocation.toolCallId,
            // A call that never got a result (e.g. the CLI was closed mid-run) is shown as finished with an error
            // rather than left pending, so resuming doesn't try to re-run it.
            state: hasResult ? 'output-available' : 'output-error',
            input: invocation.args,
            ...(hasResult ? { output: invocation.result } : { errorText: 'Interrupted' }),
          }];
        }

        if ((part.type === 'text' || part.type === 'reasoning') && typeof part.text !== 'string') {
          return part.text == null ? [] : [{ ...part, text: String(part.text) }];
        }

        return [part];
      });

      return { id: m.id, role: m.role as 'assistant' | 'user', parts } as UIMessage;
    })
    .filter((m) => m.parts.length > 0);
}
