import { Flags } from '@oclif/core';

import type { TargetKind } from '../parser/resolver.js';

/** --resource / --template: how the arguments of `codify apply` / `codify plan` are read */
export const targetFlags = {
  'resource': Flags.boolean({
    char: 'r',
    description: 'Read every argument as a resource type (ex: codify apply -r nvm pyenv).',
    exclusive: ['template'],
  }),
  'template': Flags.boolean({
    char: 't',
    description: 'Read the argument as a template name. Use this when a template has the same name as a resource type.',
    exclusive: ['resource'],
  }),
};

/**
 * The positional arguments and how to read them. The commands are not strict (any number of resource types), so the
 * arguments come from the raw tokens.
 */
export function parseTargets(
  flags: { path?: string; resource?: boolean; template?: boolean },
  raw: Array<{ input: string; type: string }>,
): { targetKind?: TargetKind; targets: string[] } {
  const targets = raw.filter((token) => token.type === 'arg').map((token) => token.input);

  if (flags.path && targets.length > 0) {
    throw new Error('Cannot specify both --path and path argument');
  }

  const targetKind: TargetKind | undefined = flags.resource ? 'resource' : (flags.template ? 'template' : undefined);
  if (targetKind && targets.length === 0) {
    throw new Error(`--${targetKind} needs at least one ${targetKind === 'resource' ? 'resource type' : 'template name'}. Ex: codify apply --${targetKind} nvm`);
  }

  return { targetKind, targets };
}
