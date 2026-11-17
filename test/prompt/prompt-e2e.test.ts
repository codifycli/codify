import xterm from '@xterm/headless';
import * as pty from 'node-pty';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ScriptChunk, startFakeAgent } from './fixtures/fake-agent.js';

/*
 * End-to-end: runs the real CLI (`bin/dev.js prompt`) in a pseudo terminal against a fake agent server, and drives it
 * by waiting for text on the rendered screen. Plans and applies go through a real plugin process
 * (fixtures/plugin.ts), so the embedded plan / confirmation / apply UI is exercised too.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PLUGIN = path.join(ROOT, 'test/prompt/fixtures/plugin.ts');
const CONFIG = JSON.stringify([
  { type: 'project', plugins: { default: PLUGIN } },
  { type: 'mock', propA: 'abc', propB: 123, directory: '/home' },
]);

class Terminal {
  private term: xterm.Terminal;
  private process: pty.IPty;
  readonly exited: Promise<number>;

  constructor(args: string[], env: Record<string, string>, size = { cols: 100, rows: 50 }) {
    this.term = new xterm.Terminal({ allowProposedApi: true, ...size, scrollback: 5000 });
    this.process = pty.spawn(path.join(ROOT, 'node_modules/.bin/tsx'), ['--no-warnings=ExperimentalWarning', path.join(ROOT, 'bin/dev.js'), ...args], {
      ...size, cwd: ROOT, env: { ...process.env, ...env, FORCE_COLOR: '0' } as Record<string, string>,
    });
    this.process.onData((data) => this.term.write(data));
    this.exited = new Promise((resolve) => this.process.onExit(({ exitCode }) => resolve(exitCode)));
  }

  screen(): string {
    const buffer = this.term.buffer.active;
    const lines: string[] = [];
    for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)!.translateToString(true));
    return lines.join('\n');
  }

  async waitFor(text: string, timeoutMs = 60_000): Promise<void> {
    const start = Date.now();
    while (!this.screen().includes(text)) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timed out waiting for "${text}". Screen:\n${this.screen()}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Give the prompt that just rendered a moment to start listening for input
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  write(keys: string): void {
    this.process.write(keys);
  }

  kill(): void {
    this.process.kill();
  }
}

const ENTER = '\r';
const DOWN = '\u001B[B';
const CTRL_C = '\u0003';

describe('codify prompt (end to end)', { timeout: 240_000 }, () => {
  let home: string;
  let terminal: Terminal | undefined;
  let agent: Awaited<ReturnType<typeof startFakeAgent>> | undefined;

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-prompt-e2e-'));
  });

  afterEach(async () => {
    terminal?.kill();
    await agent?.close();
    await fs.rm(home, { recursive: true, force: true });
  });

  async function start(script: ScriptChunk[][], args: string[] = [], size?: { cols: number; rows: number }) {
    agent = await startFakeAgent(script);
    terminal = new Terminal(args, { HOME: home, CODIFY_AGENT_URL: agent.url, CODIFY_SUPABASE_URL: agent.url }, size);
    return { agent, terminal };
  }

  it('inspects the machine, respects approvals and blocked paths, then plans and applies', async () => {
    const notes = path.join(home, 'notes.txt');
    await fs.writeFile(notes, 'node 20 is pinned here\n');
    const forbidden = path.join(home, 'should-not-exist');

    const { agent, terminal } = await start([
      [{ type: 'text', text: 'Let me look at your machine first.' }, { type: 'tool', id: 'c1', name: 'run_command', input: { command: 'echo hello-from-shell' } }],
      [{ type: 'tool', id: 'c2', name: 'read_file', input: { path: notes } }],
      [{ type: 'tool', id: 'c3', name: 'run_command', input: { command: `touch ${forbidden}` } }],
      [{ type: 'tool', id: 'c4', name: 'read_file', input: { path: '~/.ssh/id_rsa' } }],
      [{ type: 'tool', id: 'c5', name: 'codify_plan', input: { config: CONFIG } }],
      [{ type: 'tool', id: 'c6', name: 'codify_apply', input: { config: CONFIG, summary: 'Install the mock resource' } }],
      [{ type: 'text', text: 'All done: the mock resource is installed.' }],
    ]);

    // `codify` with no arguments starts the chat. The first launch transpiles the whole CLI, so allow it longer.
    await terminal.waitFor('Describe a change', 120_000);
    terminal.write('install the mock resource');
    await terminal.waitFor('install the mock resource');
    terminal.write(ENTER);

    // Not on the read-only list: the user is asked, and declines
    await terminal.waitFor('Allow this command?');
    terminal.write(DOWN);
    await terminal.waitFor('> No');
    terminal.write(ENTER);

    // codify_apply shows the regular plan and confirmation
    await terminal.waitFor('Do you want to continue?');
    terminal.write(ENTER);

    await terminal.waitFor('All done: the mock resource is installed.');
    const screen = terminal.screen();
    expect(screen).toContain('● Run echo hello-from-shell');
    expect(screen).toContain('hello-from-shell');
    expect(screen).toContain('The user declined to run this command.');
    expect(screen).toContain('Access to ~/.ssh/id_rsa is blocked');
    expect(screen).toContain('mock (create)');
    expect(screen).toContain('Codify Plan');
    expect(screen).toContain('Finished applying');
    await expect(fs.access(forbidden)).rejects.toThrow();

    // Requests: anonymous session, a CLI-namespaced thread, then one chat request per turn with tool results
    expect(agent.requests[0]).toMatchObject({ url: '/auth/v1/signup', apikey: expect.stringMatching(/^sb_publishable_/) });
    expect(agent.requests[1].body).toEqual({ resourceId: 'anon-user', title: 'install the mock resource', metadata: { namespace: 'cli' } });

    const chats = agent.chatRequests();
    expect(chats).toHaveLength(7);
    for (const chat of chats) {
      expect(chat.authorization).toMatch(/^Bearer /);
      expect(chat.body.memory).toEqual({ thread: 'thread-e2e', resource: 'anon-user' });
      expect(chat.body.messages).toHaveLength(1);
    }

    const toolOutput = (request: number, toolCallId: string) => chats[request].body.messages[0].parts
      .find((p: { toolCallId?: string }) => p.toolCallId === toolCallId)?.output;
    expect(toolOutput(1, 'c1')).toMatchObject({ exitCode: 0, output: 'hello-from-shell' });
    expect(toolOutput(2, 'c2')).toMatchObject({ content: expect.stringContaining('node 20') });
    expect(toolOutput(3, 'c3')).toMatchObject({ declined: expect.stringContaining('declined') });
    expect(toolOutput(4, 'c4')).toMatchObject({ error: expect.stringContaining('blocked') });
    expect(toolOutput(5, 'c5')).toMatchObject({ status: 'changes', resources: [{ id: 'mock', operation: 'create' }] });
    expect(toolOutput(6, 'c6')).toMatchObject({ status: 'applied', resources: [{ id: 'mock', result: 'installed' }] });

    // The applied config is kept with the conversation, not in a project file
    const configPath = toolOutput(6, 'c6').configPath as string;
    expect(configPath.startsWith(path.join(home, '.codify', 'sessions', 'thread-e2e'))).toBe(true);
    expect(JSON.parse(await fs.readFile(configPath, 'utf8'))).toEqual(JSON.parse(CONFIG));

    terminal.write(CTRL_C);
    await terminal.exited;
  });

  it('waits for the answer to ask_question, and shows server errors', async () => {
    const { agent, terminal } = await start([
      [
        { type: 'text', text: 'Which version do you want?' },
        { type: 'server-tool', id: 'q1', name: 'ask_question', input: { question: 'Which Node.js version?', options: [{ label: 'Node 22 (LTS)', value: '22' }, { label: 'Node 20', value: '20' }] } },
      ],
      [{ type: 'error', text: 'You\'ve used all 5 free prompts. Run `codify login` to keep going.' }],
    ], ['prompt', 'upgrade node']);

    // The prompt given on the command line is sent right away
    await terminal.waitFor('Which Node.js version?', 120_000);
    await terminal.waitFor('Node 20');
    // ask_question's server-side result must not trigger an automatic resubmit
    expect(agent.chatRequests()).toHaveLength(1);

    terminal.write(DOWN);
    await terminal.waitFor('> Node 20');
    terminal.write(ENTER);
    await terminal.waitFor('free prompts');

    const chats = agent.chatRequests();
    expect(chats).toHaveLength(2);
    expect(chats[1].body.messages[0]).toMatchObject({ role: 'user', parts: [{ type: 'text', text: 'Node 20' }] });
    expect(terminal.screen().match(/used all 5 free prompts/g)).toHaveLength(1);

    terminal.write(CTRL_C);
    await terminal.exited;
  });
  it('prints each line once in a short terminal, and continues past a server tool skipped in a mixed step', async () => {
    // In a terminal shorter than the running message, Ink used to leave a copy of every frame in the scrollback.
    // The live area now only holds the part in progress.
    const { agent, terminal } = await start([
      [
        { type: 'text', text: 'Let me check what is installed.' },
        { type: 'tool', id: 'c1', name: 'run_command', input: { command: 'echo first-check' } },
        // Mastra doesn't run a server tool requested in the same step as a client tool: it never gets a result
        { type: 'tool', id: 's1', name: 'search_parameter_completions', input: {} },
      ],
      [{ type: 'text', text: 'Looking further.' }, { type: 'tool', id: 'c2', name: 'run_command', input: { command: 'echo second-check' } }],
      [{ type: 'tool', id: 'c3', name: 'run_command', input: { command: 'echo third-check' } }],
      [{ type: 'text', text: 'Everything is checked.' }],
    ], ['prompt', 'check my machine'], { cols: 100, rows: 10 });

    await terminal.waitFor('Everything is checked.', 120_000);
    const screen = terminal.screen();
    for (const line of ['Let me check what is installed.', '● Run echo first-check', 'Look up available versions (skipped)', 'Looking further.', '● Run echo second-check', '● Run echo third-check', 'Everything is checked.']) {
      expect(screen.split(line).length - 1, line).toBe(1);
    }

    // Continued automatically after the client tool's result, without waiting on the skipped server tool
    expect(agent.chatRequests()).toHaveLength(4);

    terminal.write(CTRL_C);
    await terminal.exited;
  });
});
