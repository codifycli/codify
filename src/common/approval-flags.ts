import { Flags } from '@oclif/core';

/**
 * --auto-approve-all (or -yy) approves everything, including commands that come from templates. A single -y never
 * approves commands from templates.
 */
export const autoApproveAllFlag = Flags.boolean({
  description: 'Approve everything without prompting, including commands (actions) that come from templates. Same as -yy. Only use this with templates you trust.',
  default: false,
});

/** True if --auto-approve-all was passed or -y was passed twice (-yy or -y -y). */
export function isAutoApproveAll(
  flags: { 'auto-approve-all'?: boolean },
  raw: Array<{ flag?: string; type: string }>,
): boolean {
  const yesCount = raw.filter((token) => token.type === 'flag' && token.flag === 'yes').length;
  return Boolean(flags['auto-approve-all']) || yesCount >= 2;
}
