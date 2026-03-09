const fs = require('fs')
const path = require('path')
const packageJson = require('../package.json')

function removeTarget(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true })
  }
}

removeTarget(path.resolve(__dirname, '..', 'dist'))
removeTarget(path.resolve(__dirname, '..', 'dist-electron'))
removeTarget(path.resolve(__dirname, '..', 'release', `v${packageJson.version}`))