import * as fs from 'fs';
import * as https from 'https';
import * as child_process from 'child_process';

describe('temp tests', async () => {
  it('downloads and forks from s3', (done) => {
    fs.mkdirSync('/Library/Caches/codify/plugins', { recursive: true })

    //fs.writeFileSync('/Library/Caches/codify/plugins/core-plugin.js', '')
    const file = fs.createWriteStream('/Library/Caches/codify/plugins/core-plugin.js')

    file.on('open', () => {
      https.get('https://codify-plugin-library.s3.amazonaws.com/codify-core/index.js', (res) => {
        res.pipe(file)
      })
    })

    file.on('finish', async () => {
      file.close()
      console.log('Download complete')

      console.log('Starting child_process')
      const child = child_process.fork('/Library/Caches/codify/plugins/core-plugin.js')
      child.send({
        cmd: 'plan',
        data: {
          type: 'abc',
          name: 'nae'
        }
      })

      let sleep = async (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      await sleep(5000)

      done()
    })
  })
})
