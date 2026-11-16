import * as path from 'node:path';

import { expandHome, isBlockedPath } from './path-guard.js';

/**
 * Decides whether a shell command proposed by the agent may run without asking the user.
 *
 * Deny by default: a command runs automatically only when every part of it is a known read-only program used in a
 * read-only way. Everything else needs the user's approval. This is a convenience filter for obviously safe
 * inspection commands, not a sandbox; anything it isn't sure about goes to the user.
 */
export type CommandDecision =
  | { kind: 'auto' }
  | { kind: 'approval'; reason: string }
  | { kind: 'denied'; reason: string }
  /** A single command prefixed with `sudo`: always needs approval, then runs as root with the user's password */
  | { command: string; kind: 'sudo' };

type ArgsCheck = (args: string[]) => boolean;

// Env var names whose values shouldn't be printed to the model without asking
const SECRET_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|PASS|KEY|AUTH|CREDENTIAL|COOKIE|SESSION)/i;

const any: ArgsCheck = () => true;
const versionOnly: ArgsCheck = (args) => args.length > 0 && args.every((a) => ['--version', '-V', '-v', '-version', 'version'].includes(a));
const subcommands = (allowed: string[], extra: ArgsCheck = any): ArgsCheck =>
  (args) => args.length > 0 && allowed.includes(args[0]) && extra(args.slice(1));
const noFlags = (...denied: string[]): ArgsCheck =>
  (args) => !args.some((a) => denied.some((d) => a === d || a.startsWith(d + '=')));
const either = (...checks: ArgsCheck[]): ArgsCheck => (args) => checks.some((check) => check(args));

const READ_ONLY_COMMANDS: Record<string, ArgsCheck> = {
  // Files and text
  ls: any, cat: any, head: any, tail: noFlags('-f', '-F', '--follow'), wc: any, file: any, stat: any,
  readlink: any, realpath: any, dirname: any, basename: any, grep: any, egrep: any, fgrep: any, rg: any,
  sort: noFlags('-o', '--output'), uniq: (args) => args.filter((a) => !a.startsWith('-')).length <= 1,
  cut: any, tr: any, column: any, nl: any, diff: any, cmp: any, jq: any, md5: any, md5sum: any, shasum: any,
  sha256sum: any, tree: any, du: any, df: any,
  find: noFlags('-delete', '-exec', '-execdir', '-ok', '-okdir', '-fprint', '-fprint0', '-fprintf', '-fls'),
  echo: any, printf: any, test: any, '[': any, true: any, false: any,
  printenv: (args) => args.length > 0 && args.every((a) => !SECRET_NAME.test(a)),

  // System info
  pwd: any, whoami: any, id: any, groups: any, uname: any, hostname: (args) => args.length === 0, date: (args) => args.every((a) => !a.startsWith('-s') && a !== '--set'),
  uptime: any, ps: any, pgrep: any, lsof: any, which: any, whereis: any, type: any, command: (args) => args[0] === '-v' || args[0] === '-V',
  sw_vers: any, system_profiler: any, lsb_release: any, arch: any, nproc: any, locale: any,
  sysctl: (args) => !args.some((a) => a === '-w' || a.includes('=')),
  defaults: subcommands(['read', 'read-type', 'domains']),
  launchctl: subcommands(['list', 'print', 'print-disabled']),
  systemctl: subcommands(['status', 'is-active', 'is-enabled', 'is-failed', 'list-units', 'list-unit-files', 'show', 'cat']),
  journalctl: noFlags('-f', '--follow', '--vacuum-size', '--vacuum-time', '--rotate', '--flush'),
  'xcode-select': (args) => args.every((a) => ['-p', '--print-path', '-v', '--version'].includes(a)),
  xcrun: (args) => args.every((a) => ['--show-sdk-path', '--show-sdk-version', '--version', '--find', '-f'].includes(a) || !a.startsWith('-')) && ['--show-sdk-path', '--show-sdk-version', '--version', '--find', '-f'].includes(args[0]),

  // Package managers (read-only subcommands)
  brew: subcommands(['list', 'ls', 'info', 'config', 'doctor', '--prefix', '--version', '--cellar', '--repository', 'outdated', 'deps', 'leaves', 'search', 'desc', 'uses', 'tap', 'services'], (rest) => rest.length === 0 || !['tap', 'services'].includes(rest[0])),
  npm: either(versionOnly, subcommands(['ls', 'list', 'view', 'info', 'outdated', 'root', 'prefix', 'explain', 'why', 'bin']), (args) => args[0] === 'config' && ['get', 'list', 'ls'].includes(args[1])),
  pnpm: either(versionOnly, subcommands(['ls', 'list', 'outdated', 'why', 'root'])),
  yarn: either(versionOnly, subcommands(['list', 'info', 'why'])),
  pip: either(versionOnly, subcommands(['list', 'show', 'freeze', 'check'])),
  pip3: either(versionOnly, subcommands(['list', 'show', 'freeze', 'check'])),
  pipx: subcommands(['list']),
  gem: either(versionOnly, subcommands(['list', 'env', 'info', 'which'])),
  cargo: either(versionOnly, (args) => args[0] === 'install' && args[1] === '--list'),
  apt: subcommands(['list', 'show', 'policy', 'search']),
  'apt-cache': any,
  dpkg: (args) => args.length > 0 && ['-l', '-s', '-L', '-S', '--list', '--status', '--listfiles', '--search', '--print-architecture'].includes(args[0]),
  'dpkg-query': any,
  rpm: (args) => args.length > 0 && args[0].startsWith('-q'),
  dnf: subcommands(['list', 'info', 'repolist', 'search']),
  yum: subcommands(['list', 'info', 'repolist', 'search']),
  snap: subcommands(['list', 'info', 'version']),
  flatpak: subcommands(['list', 'info']),
  mas: subcommands(['list', 'outdated']),

  // Runtimes and version managers
  node: versionOnly, deno: versionOnly, bun: versionOnly, python: versionOnly, python3: versionOnly, ruby: versionOnly,
  perl: versionOnly, php: versionOnly, java: versionOnly, javac: versionOnly, rustc: versionOnly, swift: versionOnly,
  kotlin: versionOnly, dotnet: either(versionOnly, (args) => args.length === 1 && ['--info', '--list-sdks', '--list-runtimes'].includes(args[0])),
  go: either(subcommands(['version']), (args) => args[0] === 'env' && args.every((a) => a !== '-w' && a !== '-u')),
  nvm: subcommands(['ls', 'list', 'current', 'version', 'which', '--version']),
  pyenv: subcommands(['versions', 'version', 'which', 'root', '--version']),
  rbenv: subcommands(['versions', 'version', 'which', 'root', '--version']),
  asdf: subcommands(['list', 'current', 'where', 'which', 'version', '--version']),
  mise: subcommands(['ls', 'list', 'current', 'where', 'which', 'version', '--version', 'doctor']),

  // Dev tools
  git: either(
    versionOnly,
    subcommands(['status', 'log', 'diff', 'show', 'rev-parse', 'ls-files', 'describe', 'shortlog', 'blame', 'remote'], (rest) => rest.length === 0 || ['-v', '--verbose', 'show', 'get-url'].includes(rest[0]) || !['add', 'remove', 'rm', 'rename', 'set-url', 'prune', 'update'].includes(rest[0])),
    (args) => args[0] === 'branch' && args.slice(1).every((a) => ['-a', '-r', '-v', '-vv', '--list', '--show-current', '-l'].includes(a)),
    (args) => args[0] === 'tag' && args.slice(1).every((a) => ['-l', '--list'].includes(a) || !a.startsWith('-')) && args.slice(1).some((a) => a === '-l' || a === '--list'),
    (args) => args[0] === 'config' && args.slice(1).some((a) => ['--get', '--get-all', '--get-regexp', '--list', '-l', '--show-origin'].includes(a)),
  ),
  docker: either(versionOnly, subcommands(['version', 'info', 'ps', 'images']), (args) => args[0] === 'context' && args[1] === 'ls'),
  kubectl: (args) => args[0] === 'version' && args.includes('--client'),
  terraform: either(versionOnly, subcommands(['version'])),
  code: (args) => args.length > 0 && args.every((a) => ['--version', '--list-extensions', '--show-versions'].includes(a)),
  gh: either(versionOnly, (args) => args[0] === 'auth' && args[1] === 'status'),
};

// Env var names whose values shouldn't be printed to the model without asking
const SECRET_VARIABLE = /\$\{?[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|PASSWD|PASS|KEY|AUTH|CREDENTIAL|COOKIE|SESSION)[A-Z0-9_]*\}?/i;

// Harmless redirections that only discard or merge output
const SAFE_REDIRECTS = /(?:^|\s)(?:[12]?>\s*\/dev\/null|&>\s*\/dev\/null|2>&1|1>&2)(?=\s|$)/g;

export function classifyCommand(input: string): CommandDecision {
  const command = input.trim();
  if (command.length === 0) {
    return { kind: 'denied', reason: 'The command is empty.' };
  }

  const tokens = tokenize(command);
  if (tokens === null) {
    return { kind: 'approval', reason: 'The command has unbalanced quotes.' };
  }

  // `sudo cmd`: a single command prefixed by sudo is run as root after the user approves it and enters a password
  const sudoIndexes = tokens.flatMap((t, i) => (t.type === 'word' && t.value === 'sudo' ? [i] : []));
  if (sudoIndexes.length > 0) {
    const isSingleLeadingSudo = sudoIndexes.length === 1 && sudoIndexes[0] === 0 && tokens.every((t) => t.type === 'word');
    if (!isSingleLeadingSudo || tokens.length < 2 || tokens[1].value.startsWith('-')) {
      return { kind: 'denied', reason: 'sudo is only supported at the start of a single command, without options (e.g. "sudo ls /var/root").' };
    }

    return { kind: 'sudo', command: command.replace(/^sudo\s+/, '') };
  }

  const unsafe = tokens.find((t) => t.type === 'unsafe');
  if (unsafe) {
    return { kind: 'approval', reason: unsafe.value };
  }

  if (SECRET_VARIABLE.test(command)) {
    return { kind: 'approval', reason: 'It reads an environment variable that may contain a secret.' };
  }

  const segments: string[][] = [[]];
  for (const token of tokens) {
    if (token.type === 'operator') {
      if (token.value === '&') {
        return { kind: 'approval', reason: 'It runs a command in the background.' };
      }

      segments.push([]);
    } else {
      segments.at(-1)!.push(token.value);
    }
  }

  for (const words of segments) {
    if (words.length === 0) continue;

    if (/^[A-Za-z_]\w*=/.test(words[0])) {
      return { kind: 'approval', reason: 'It sets environment variables for the command.' };
    }

    const program = path.basename(words[0]);
    const args = words.slice(1);
    if ((program === 'env' || program === 'printenv') && args.length === 0) {
      return { kind: 'approval', reason: 'It prints every environment variable, which may include secrets.' };
    }

    const check = READ_ONLY_COMMANDS[program];
    if (!check) {
      return { kind: 'approval', reason: `"${program}" is not on the list of read-only commands.` };
    }

    if (!check(args)) {
      return { kind: 'approval', reason: `"${[program, ...args].join(' ')}" may change something.` };
    }

    const blockedArg = args.find((arg) => looksLikePath(arg) && isBlockedPath(path.resolve(expandHome(arg))));
    if (blockedArg) {
      return { kind: 'approval', reason: `It reads ${blockedArg}, which may contain secrets.` };
    }
  }

  return { kind: 'auto' };
}

function looksLikePath(arg: string): boolean {
  return !arg.startsWith('-') && (arg.includes('/') || arg.startsWith('~') || arg.startsWith('.'));
}

type Token =
  | { type: 'operator'; value: string }
  | { type: 'unsafe'; value: string }
  | { type: 'word'; value: string };

/**
 * A small shell tokenizer: splits words (respecting quotes and escapes), command separators (| || && ; & newline),
 * and flags constructs that could do anything (redirections, command substitution, process substitution, globs into
 * other commands are fine). Returns null for unbalanced quotes.
 */
function tokenize(input: string): Token[] | null {
  const source = input.replaceAll(SAFE_REDIRECTS, ' ');
  const tokens: Token[] = [];
  let word = '';
  let inWord = false;
  const pushWord = () => {
    if (inWord) tokens.push({ type: 'word', value: word });
    word = '';
    inWord = false;
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (char === '\\') {
      word += next ?? '';
      inWord = true;
      i++;
      continue;
    }

    if (char === '\'') {
      const end = source.indexOf('\'', i + 1);
      if (end === -1) return null;
      word += source.slice(i + 1, end);
      inWord = true;
      i = end;
      continue;
    }

    if (char === '"') {
      let j = i + 1;
      let value = '';
      for (; j < source.length && source[j] !== '"'; j++) {
        if (source[j] === '\\' && j + 1 < source.length) {
          value += source[++j];
          continue;
        }

        if (source[j] === '`' || (source[j] === '$' && source[j + 1] === '(')) {
          tokens.push({ type: 'unsafe', value: 'It uses command substitution.' });
        }

        value += source[j];
      }

      if (j >= source.length) return null;
      word += value;
      inWord = true;
      i = j;
      continue;
    }

    if (char === '`' || (char === '$' && next === '(')) {
      tokens.push({ type: 'unsafe', value: 'It uses command substitution.' });
      word += char;
      inWord = true;
      continue;
    }

    if ((char === '<' || char === '>') && next === '(') {
      tokens.push({ type: 'unsafe', value: 'It uses process substitution.' });
      continue;
    }

    if (char === '>' || char === '<') {
      tokens.push({ type: 'unsafe', value: char === '>' ? 'It writes output to a file.' : 'It redirects input from a file.' });
      continue;
    }

    if (char === '|' || char === '&' || char === ';' || char === '\n') {
      pushWord();
      const doubled = (char === '|' || char === '&') && next === char;
      tokens.push({ type: 'operator', value: doubled ? char + char : char });
      if (doubled) i++;
      continue;
    }

    if (/\s/.test(char)) {
      pushWord();
      continue;
    }

    word += char;
    inWord = true;
  }

  pushWord();
  return tokens;
}
