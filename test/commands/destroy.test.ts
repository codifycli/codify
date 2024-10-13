import {runCommand} from '@oclif/test'
import {expect} from 'chai'

describe('destroy', () => {
  it('runs destroy cmd', async () => {
    const {stdout} = await runCommand('destroy')
    expect(stdout).to.contain('hello world')
  })

  it('runs destroy --name oclif', async () => {
    const {stdout} = await runCommand('destroy --name oclif')
    expect(stdout).to.contain('hello oclif')
  })
})
