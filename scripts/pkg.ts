import chalk from 'chalk'
import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'

console.log(chalk.magenta('Removing ./dist and ./.build folder and create new'))
await Promise.all([
  ignoreError(() => fs.rm('./dist', { recursive: true })),
  ignoreError(() => fs.rm('.build', { recursive: true }))
]);

await Promise.all([
  fs.mkdir('./dist', { recursive: true }),
  fs.mkdir('./.build', { recursive: true })
]);

console.log(chalk.magenta('Copying files to .tmp'))
await Promise.all([
  fs.cp('package.json', './.build/package.json'),
  fs.cp('package-lock.json', './.build/package-lock.json'),
  fs.cp('./bin', './.build/bin/', { recursive: true }),
  fs.cp('README.md', './.build/README.md'),
]);

console.log(chalk.magenta('Esbuild src'))
execSync('esbuild src/commands/*.ts src/commands/**/index.ts src/index.ts ' +
  '--bundle ' +
  '--outdir=./.build/dist/ ' +
  '--platform=node ' +
  '--format=esm ' +
  '--packages=external ' +
  '--splitting ' +
  '--minify',
  { shell: 'zsh' }
)

console.log(chalk.magenta('Install production dependencies'))
execSync('npm install --production', { cwd: './.build', shell: 'zsh' })

console.log(chalk.magenta('Running oclif pkg'))
execSync('oclif pack macos -r .', { cwd: './.build', shell: 'zsh' })

console.log(chalk.magenta('Copy files back'))
await Promise.all([
  fs.cp('./.build/dist/', './dist/', { recursive: true }),
  fs.cp('./.build/README.md', './README.md'),
]);

async function ignoreError(fn: () => Promise<any> | any): Promise<void> {
  try {
    await fn();
  } catch {}
}
