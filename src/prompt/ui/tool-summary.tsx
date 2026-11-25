import { Box, Text } from 'ink';
import React from 'react';

import { type Notice } from '../../notices/notice-evaluator.js';
import { NoticeList } from '../../ui/components/widgets/NoticeList.js';

/** One line per tool call: what the agent is doing, and whether it finished */
export function ToolCallSummary(props: { args: unknown; isError?: boolean; result: unknown; skipped?: boolean; toolName: string; }) {
  const args = (props.args ?? {}) as Record<string, unknown>;
  if (props.skipped) {
    // A call the agent made but that never ran (e.g. a lookup in the same step as a local tool). It retries if needed.
    return <Text dimColor>{'– '}{describeToolCall(props.toolName, args)} (skipped)</Text>;
  }

  const done = props.result !== undefined;
  const failed = props.isError || hasError(props.result);
  const declined = isRecord(props.result) && typeof props.result.declined === 'string';

  const marker = !done ? '○' : failed || declined ? '✗' : '●';
  const color = !done ? 'gray' : failed ? 'red' : declined ? 'yellow' : 'green';

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={color}>{marker} </Text>
        <Text dimColor={done}>{describeToolCall(props.toolName, args)}</Text>
      </Text>
      {done && <ToolCallDetail result={props.result} toolName={props.toolName} />}
    </Box>
  );
}

function ToolCallDetail(props: { result: unknown; toolName: string }) {
  const result = props.result;
  if (!isRecord(result)) return null;

  if (typeof result.declined === 'string') {
    return <Text color="yellow">{'  ⎿ '}{result.declined}</Text>;
  }

  if (typeof result.error === 'string') {
    return <Text color="red">{'  ⎿ '}{firstLine(result.error)}</Text>;
  }

  switch (props.toolName) {
    case 'run_command': {
      const output = typeof result.output === 'string' ? result.output.trim() : '';
      const lines = output.split('\n').filter(Boolean);
      return (
        <Text dimColor>
          {'  ⎿ '}{lines.length === 0 ? `exit ${result.exitCode}` : lines.slice(0, 3).join('\n    ')}{lines.length > 3 ? `\n    … ${lines.length - 3} more lines` : ''}
        </Text>
      );
    }

    case 'codify_inspect': {
      const installed = Array.isArray(result.installed) ? result.installed as Array<{ name?: string; type: string }> : [];
      const missing = Array.isArray(result.notInstalled) ? result.notInstalled as string[] : [];
      const parts = [
        installed.length > 0 ? `Found ${[...new Set(installed.map((r) => r.type))].join(', ')}` : 'Nothing found',
        missing.length > 0 ? `not installed: ${missing.join(', ')}` : '',
      ].filter(Boolean);
      return <Text dimColor>{'  ⎿ '}{parts.join('; ')}</Text>;
    }

    case 'codify_plan': {
      if (result.status === 'no-changes') return <Text dimColor>{'  ⎿ '}No changes needed</Text>;
      const resources = Array.isArray(result.resources) ? result.resources as Array<{ id: string; operation: string }> : [];
      return <Text dimColor>{'  ⎿ '}{resources.map((r) => `${r.id} (${r.operation.toLowerCase()})`).join(', ')}</Text>;
    }

    default: {
      return null;
    }
  }
}

/** Outcome line under a codify_apply card */
export function ApplyResultSummary(props: { result: unknown }) {
  const result = props.result;
  if (!isRecord(result)) return null;

  switch (result.status) {
    case 'declined': {
      return <Text color="yellow">Not applied.</Text>;
    }

    case 'no-changes': {
      // With changes, the notices are part of the apply output. Without, they are only in the result.
      const notices = Array.isArray(result.notices) ? result.notices as Notice[] : [];
      return (
        <Box flexDirection="column">
          <Text color="green">Already up to date. Nothing to apply.</Text>
          <NoticeList notices={notices} />
        </Box>
      );
    }

    case 'error': {
      return <Text color="red">Apply failed: {String(result.error ?? '')}</Text>;
    }

    default: {
      return typeof result.configPath === 'string' ? <Text dimColor>Config saved to {result.configPath}</Text> : null;
    }
  }
}

export function describeToolCall(toolName: string, args: Record<string, unknown>): string {
  const str = (key: string) => (typeof args[key] === 'string' ? args[key] as string : '');
  // A list argument (ex: get_resource_schema's `types`), falling back to the older single-value argument.
  const list = (key: string, fallback: string) => (Array.isArray(args[key]) ? (args[key] as unknown[]).map(String).join(', ') : str(fallback));

  switch (toolName) {
    case 'read_file': { return `Read ${str('path')}`; }
    case 'list_directory': { return `List ${str('path')}`; }
    case 'search_files': { return `Search ${str('path')} for /${str('pattern')}/`; }
    case 'run_command': { return `Run ${str('command')}`; }
    case 'codify_inspect': {
      const types = Array.isArray(args.types) ? (args.types as unknown[]).map(String) : [];
      return types.length > 0 ? `Check what's installed: ${types.join(', ')}` : "Check what's installed on this machine";
    }

    case 'codify_plan': { return 'Check the plan against this machine'; }
    case 'codify_apply': { return str('summary') || 'Apply changes'; }
    case 'search_resources': { return `Search resources: ${list('queries', 'query')}`; }
    case 'get_resource_schema': { return `Look up ${list('types', 'type') || str('resourceType')}`; }
    case 'search_templates': { return `Search templates: ${str('query')}`; }
    case 'search_parameter_completions': { return 'Look up available versions'; }
    case 'web_search': { return `Search the web: ${str('query')}`; }
    case 'validate_codify_config': { return 'Validate the config'; }
    case 'ask_question': { return str('question'); }
    default: { return toolName; }
  }
}

function hasError(result: unknown): boolean {
  return isRecord(result) && (typeof result.error === 'string' || result.status === 'error');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function firstLine(text: string): string {
  return text.split('\n')[0];
}
