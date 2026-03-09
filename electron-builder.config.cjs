const packageJson = require('./package.json')

const version = packageJson.version

module.exports = {
  appId: 'com.openagent.app',
  productName: 'OpenAgent',
  copyright: 'Copyright © 2026 年华',
  directories: {
    output: `release/v${version}`,
    buildResources: 'build'
  },
  files: [
    'dist/**/*',
    'dist-electron/**/*'
  ],
  extraResources: [
    {
      from: 'build/icon.png',
      to: 'icon.png'
    },
    {
      from: 'build/live2d-models',
      to: 'live2d-models'
    }
  ],
  artifactName: '${productName}-${version}-${arch}-${target}.${ext}',
  publish: [
    {
      provider: 'github',
      owner: 'nianhua666',
      repo: 'OpenAgent'
    }
  ],
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      },
      {
        target: 'portable',
        arch: ['x64']
      }
    ],
    icon: 'build/icon.ico',
    publisherName: ['年华'],
    verifyUpdateCodeSignature: false,
    signAndEditExecutable: false
  },
  nsis: {
    artifactName: '${productName} Setup ${version}.${ext}',
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    unicode: true,
    installerIcon: 'build/icon.ico',
    uninstallerIcon: 'build/icon.ico',
    installerHeaderIcon: 'build/icon.ico',
    deleteAppDataOnUninstall: false,
    perMachine: false
  },
  portable: {
    artifactName: '${productName} Portable ${version}.${ext}'
  }
}