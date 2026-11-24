/**
 * Environment variables added to every shell Codify starts (the shell check, commands run by the CLI and plugins).
 *
 * Codify starts interactive shells in a pty, so rc files behave as they would in a terminal. Some of them stop
 * for input or print output when they think a person is there:
 * - oh-my-zsh checks for updates on startup (every 13 days by default). The default `prompt` mode asks
 *   "[oh-my-zsh] Would you like to update? [Y/n]" and waits for a key, so the shell never finishes. In `auto` mode it
 *   prints the update log. `DISABLE_AUTO_UPDATE=true` turns the check off, unless the rc file sets
 *   `zstyle ':omz:update' mode` itself (that setting wins over the variable).
 */
export const CODIFY_SHELL_ENV: Record<string, string> = {
  DISABLE_AUTO_UPDATE: 'true',
};
