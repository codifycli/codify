import chalk from 'chalk';

import type { TemplateCommandApprovalRequest } from '../templates/template-command-approval.js';

/** The message shown when commands from templates need to be approved. Shared by the reporters. */
export function formatTemplateCommandApproval(requests: TemplateCommandApprovalRequest[]): string {
  const builder = [
    chalk.bold.yellow(`Templates want to run ${requests.length === 1 ? 'the following command' : `the following ${requests.length} commands`} on your machine:`),
    '',
  ];

  for (const [idx, request] of requests.entries()) {
    builder.push(chalk.bold(`[${idx + 1}] ${request.resourceId}`) + chalk.dim(` from template ${request.templates.join(', ')}`));

    for (const { name, value } of request.parameters) {
      const formatted = typeof value === 'string' ? value : JSON.stringify(value);
      const line = `      ${(name + ':').padEnd(15)}${formatted}`;
      builder.push(name === 'requiresRoot' && value === true ? chalk.red(`${line}  (runs with sudo)`) : line);
    }

    builder.push('');
  }

  builder.push(
    'The condition of an action runs while generating the plan, before any confirmation.',
    'Only approve commands from templates you trust. Approved commands are remembered until they change.',
    '',
    chalk.bold('Allow these commands to run?'),
  );

  return builder.join('\n');
}
