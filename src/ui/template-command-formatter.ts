import chalk from 'chalk';

import type { TemplateCommandApprovalRequest } from '../templates/template-command-approval.js';
import type { SecretsApprovalRequest } from '../variables/secrets-approval.js';

/** The message shown when commands from templates need to be approved. Shared by the reporters. */
export function formatTemplateCommandApproval(requests: TemplateCommandApprovalRequest[]): string {
  const onlyCommands = requests.every((r) => !r.reason);
  const builder = [
    chalk.bold.yellow(onlyCommands
      ? `Templates want to run ${requests.length === 1 ? 'the following command' : `the following ${requests.length} commands`} on your machine:`
      : `Templates want to make ${requests.length === 1 ? 'a change that needs' : `${requests.length} changes that need`} your approval:`),
    '',
  ];

  for (const [idx, request] of requests.entries()) {
    builder.push(chalk.bold(`[${idx + 1}] ${request.resourceId}`) + chalk.dim(` from template ${request.templates.join(', ')}`));
    if (request.reason) {
      builder.push(chalk.yellow(`      ${request.reason}`));
    }

    for (const { name, value } of request.parameters) {
      const formatted = typeof value === 'string' ? value : JSON.stringify(value);
      const line = `      ${(name + ':').padEnd(15)}${formatted}`;
      builder.push(name === 'requiresRoot' && value === true ? chalk.red(`${line}  (runs with sudo)`) : line);
    }

    builder.push('');
  }

  if (requests.some((r) => !r.reason)) {
    builder.push('The condition of an action runs while generating the plan, before any confirmation.');
  }

  builder.push(
    'Only approve templates you trust. Approvals are remembered until the template or the change is different.',
    '',
    chalk.bold(onlyCommands ? 'Allow these commands to run?' : 'Allow these changes?'),
  );

  return builder.join('\n');
}

/** The message shown when a run is about to use saved secrets. Shared by the reporters. */
export function formatSecretsApproval(requests: SecretsApprovalRequest[]): string {
  const builder = [
    chalk.bold.yellow(`This config uses ${requests.length === 1 ? 'a saved secret' : `${requests.length} saved secrets`}:`),
    '',
  ];

  for (const request of requests) {
    builder.push(`  ${chalk.bold(request.key)}${chalk.dim(` (${request.description})`)}`, chalk.dim(`      used by ${request.usedBy.join(', ')}`));
  }

  builder.push(
    '',
    'Their values are only used for this run and are hidden in the output. Approvals are remembered for this config.',
    '',
    chalk.bold('Allow this config to use these secrets?'),
  );

  return builder.join('\n');
}
