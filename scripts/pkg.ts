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
  fs.cp('./bin', './.build/bin/', { recursive: true }),
  fs.cp('README.md', './.build/README.md'),
]);

console.log(chalk.magenta('Filter package.json and remove all dependencies'))
const packageJson = JSON.parse(await fs.readFile('./package.json', { encoding: 'utf8' }))
const filteredPackageJson = Object.fromEntries(
  Object.entries(packageJson)
    .filter(([k]) => !([
        'dependencies',
        'devDependencies',
        'peerDependencies',
        'types'
      ].includes(k))
    )
)
await fs.writeFile('./.build/package.json', JSON.stringify(filteredPackageJson, null, 2), 'utf8')

console.log(chalk.magenta('Esbuild src'))
execSync('tsx esbuild.ts', { shell: 'zsh' })

console.log(chalk.magenta('Running npm shrinkwrap'))
execSync('npm shrinkwrap', { shell: 'zsh', cwd: './.build' });

// console.log(chalk.magenta('Re-name ./.build/src folder'))
// await fs.rename('./.build/src/', './.build/dist/')

console.log(chalk.magenta('Running oclif pkg macos'))
execSync('oclif pack macos -r .', { cwd: './.build', shell: 'zsh' })
execSync('oclif pack tarballs -r . -t darwin-arm64,darwin-x64', { cwd: './.build', shell: 'zsh' })

console.log(chalk.magenta('Copy files back'))
await Promise.all([
  fs.cp('./.build/dist/', './dist/', { recursive: true }),
  fs.cp('./.build/README.md', './README.md'),
]);

async function ignoreError(fn: () => Promise<any> | any): Promise<void> {
  try {
    await fn();
  } catch {
  }
}
