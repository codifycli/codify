
import chalk from 'chalk'
import { ChildProcess, exec } from 'node:child_process'
import fs from 'node:fs/promises'

console.log(chalk.magenta('Removing ./dist folder'))
await fs.rm('../dist', {
  force: true,
  recursive: true,
})

console.log(chalk.magenta('Creating build directory'))
try {
  await fs.mkdir('../build', {});
} catch {
  console.error('Directory already exists')
}

await fs.cp('../src/', '../build')
await fs.cp('../package.json', '../build')


console.log(chalk.magenta('Running rollup'))
const rollupProcess = exec('rollup -c --file ');
addStdout(rollupProcess)

function addStdout(process: ChildProcess) {
  process.stdout!.on('data', (data) => {
    console.log(data)
  })
  process.stderr!.on('data', (data) => {
    console.log(data)
  })
}
