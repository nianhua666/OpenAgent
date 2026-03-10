const fs = require('fs')
const https = require('https')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function withRetry(label, operation, maxAttempts = 3, baseDelayMilliseconds = 5000) {
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error
      if (attempt >= maxAttempts) {
        break
      }

      const message = error instanceof Error ? error.message : String(error)
      console.warn(`${label} failed on attempt ${attempt}/${maxAttempts}: ${message}`)
      await sleep(baseDelayMilliseconds * attempt)
    }
  }

  throw lastError
}

function parseArgs(argv) {
  const options = {
    version: '',
    repository: 'nianhua666/OpenAgent',
    targetCommitish: '',
    draft: false,
    prerelease: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--version' && argv[index + 1]) {
      options.version = argv[index + 1]
      index += 1
      continue
    }

    if (token === '--repository' && argv[index + 1]) {
      options.repository = argv[index + 1]
      index += 1
      continue
    }

    if (token === '--target-commitish' && argv[index + 1]) {
      options.targetCommitish = argv[index + 1]
      index += 1
      continue
    }

    if (token === '--draft') {
      options.draft = true
      continue
    }

    if (token === '--prerelease') {
      options.prerelease = true
    }
  }

  return options
}

function normalizeVersion(rawVersion) {
  const value = String(rawVersion || '').trim()
  if (!value) {
    throw new Error('No version was provided and package.json did not contain a valid version.')
  }

  return value.replace(/^v/, '')
}

function getRepositoryRoot() {
  return path.resolve(__dirname, '..')
}

function getPackageVersion(repositoryRoot) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))
  return String(packageJson.version || '')
}

function getReleaseNotes(repositoryRoot, version) {
  const changelogPath = path.join(repositoryRoot, 'CHANGELOG.md')
  if (!fs.existsSync(changelogPath)) {
    return `OpenAgent v${version}`
  }

  const lines = fs.readFileSync(changelogPath, 'utf8').split(/\r?\n/)
  const heading = `## ${version}`
  const startIndex = lines.findIndex(line => line.trim() === heading)
  if (startIndex === -1) {
    return `OpenAgent v${version}`
  }

  let endIndex = lines.length
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      endIndex = index
      break
    }
  }

  const notes = lines.slice(startIndex + 1, endIndex).join('\n').trim()
  return notes || `OpenAgent v${version}`
}

function resolveTargetCommitish(requestedTargetCommitish) {
  const explicitTarget = String(requestedTargetCommitish || '').trim()
  if (explicitTarget) {
    return explicitTarget
  }

  try {
    const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
    if (branch) {
      return branch
    }
  } catch {
    // Fall through to the current commit hash.
  }

  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function getGitHubToken(repository) {
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) {
    return process.env.GITHUB_TOKEN.trim()
  }

  if (process.env.GH_TOKEN && process.env.GH_TOKEN.trim()) {
    return process.env.GH_TOKEN.trim()
  }

  const request = `protocol=https\nhost=github.com\npath=${repository}.git\n\n`
  const credentialText = execFileSync('git', ['credential', 'fill'], {
    encoding: 'utf8',
    input: request
  })

  const entries = credentialText.split(/\r?\n/).filter(Boolean)
  const pairs = new Map()
  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = entry.slice(0, separatorIndex)
    const value = entry.slice(separatorIndex + 1)
    pairs.set(key, value)
  }

  const password = (pairs.get('password') || '').trim()
  if (!password) {
    throw new Error('Unable to resolve a GitHub token from environment variables or git credentials.')
  }

  return password
}

function getAssetDefinitions(repositoryRoot, version) {
  const releaseDir = path.join(repositoryRoot, 'release', `v${version}`)
  const assets = [
    { name: `OpenAgent Setup ${version}.exe`, path: path.join(releaseDir, `OpenAgent Setup ${version}.exe`), contentType: 'application/octet-stream' },
    { name: `OpenAgent Setup ${version}.exe.blockmap`, path: path.join(releaseDir, `OpenAgent Setup ${version}.exe.blockmap`), contentType: 'application/octet-stream' },
    { name: `OpenAgent Portable ${version}.exe`, path: path.join(releaseDir, `OpenAgent Portable ${version}.exe`), contentType: 'application/octet-stream' },
    { name: 'latest.yml', path: path.join(releaseDir, 'latest.yml'), contentType: 'text/yaml' }
  ]

  for (const asset of assets) {
    if (!fs.existsSync(asset.path)) {
      throw new Error(`Missing release asset: ${asset.path}`)
    }
  }

  return assets
}

function createUploadTempDirectory(version) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `openagent-release-v${version}-`))
}

function formatFileSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = Number(bytes) || 0
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function stageAssetForUpload(assetDefinition, uploadTempDirectory) {
  const stagedPath = path.join(uploadTempDirectory, path.basename(assetDefinition.path))

  // 先复制到临时文件再上传，避免原始构建产物被打包进程或安全软件占用。
  fs.copyFileSync(assetDefinition.path, stagedPath)

  return {
    ...assetDefinition,
    stagedPath,
    size: fs.statSync(stagedPath).size
  }
}

async function removeMatchingAssets(repository, token, releaseId, assetName) {
  const releaseApiBase = `https://api.github.com/repos/${repository}/releases`
  const release = await githubRequest(`${releaseApiBase}/${releaseId}`, token)
  const matchingAssets = findMatchingAssets(release.assets || [], assetName)

  for (const existingAsset of matchingAssets) {
    await githubRequest(`${releaseApiBase}/assets/${existingAsset.id}`, token, { method: 'DELETE' }, [204])
    console.log(`Deleted old asset: ${existingAsset.name}`)
  }
}

function uploadAssetRequest(uploadUrl, token, assetDefinition, stagedAsset) {
  const targetUrl = new URL(`${uploadUrl}?name=${encodeURIComponent(assetDefinition.name)}`)

  return new Promise((resolve, reject) => {
    let uploadedBytes = 0
    let settled = false

    const request = https.request({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || 443,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'OpenAgent-Release',
        'Content-Type': assetDefinition.contentType,
        'Content-Length': String(stagedAsset.size)
      }
    }, (response) => {
      const chunks = []

      response.on('data', (chunk) => {
        chunks.push(chunk)
      })

      response.on('end', () => {
        if (settled) {
          return
        }

        settled = true
        const responseText = Buffer.concat(chunks).toString('utf8')
        if (response.statusCode !== 201) {
          reject(new Error(`GitHub asset upload failed: ${response.statusCode || 0} ${response.statusMessage || ''}\n${responseText}`.trim()))
          return
        }

        resolve(responseText)
      })
    })

    request.setTimeout(10 * 60 * 1000, () => {
      request.destroy(new Error(`Upload timed out for ${assetDefinition.name}`))
    })

    request.on('error', (error) => {
      if (settled) {
        return
      }

      settled = true
      reject(error)
    })

    const readStream = fs.createReadStream(stagedAsset.stagedPath)
    readStream.on('data', (chunk) => {
      uploadedBytes += chunk.length
    })

    const progressTimer = setInterval(() => {
      console.log(`Still uploading: ${assetDefinition.name} (${formatFileSize(uploadedBytes)}/${formatFileSize(stagedAsset.size)})`)
    }, 30000)

    readStream.on('error', (error) => {
      clearInterval(progressTimer)
      request.destroy(error)
    })

    request.on('close', () => {
      clearInterval(progressTimer)
    })

    readStream.pipe(request)
  })
}

async function githubRequest(url, token, options = {}, okStatuses = [200]) {
  const headers = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'OpenAgent-Release',
    ...(options.headers || {})
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body
  })

  if (!okStatuses.includes(response.status)) {
    const text = await response.text()
    const error = new Error(`GitHub API request failed: ${response.status} ${response.statusText}\n${text}`)
    error.status = response.status
    throw error
  }

  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.arrayBuffer()
}

function findMatchingAssets(assets, assetName) {
  const dottedName = assetName.replace(/ /g, '.')
  return assets.filter(asset => asset.name === assetName || asset.name === dottedName)
}

async function createOrLoadRelease(repository, token, payload) {
  const releasesApi = `https://api.github.com/repos/${repository}/releases`
  const releaseByTagApi = `${releasesApi}/tags/${payload.tag_name}`

  try {
    const existingRelease = await githubRequest(releaseByTagApi, token)
    console.log(`Release already exists: ${payload.tag_name}`)
    return existingRelease
  } catch (error) {
    if (error.status !== 404) {
      throw error
    }
  }

  const createdRelease = await githubRequest(releasesApi, token, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }, [201])

  console.log(`Created release: ${payload.tag_name}`)
  return createdRelease
}

async function uploadAsset(repository, token, releaseId, uploadUrl, assetDefinition, uploadTempDirectory) {
  const stagedAsset = stageAssetForUpload(assetDefinition, uploadTempDirectory)

  await withRetry(`Upload ${assetDefinition.name}`, async (attempt) => {
    await removeMatchingAssets(repository, token, releaseId, assetDefinition.name)

    if (attempt === 1) {
      console.log(`Uploading: ${assetDefinition.name} (${formatFileSize(stagedAsset.size)})`)
    } else {
      console.log(`Retrying upload ${attempt}/3: ${assetDefinition.name}`)
    }

    await uploadAssetRequest(uploadUrl, token, assetDefinition, stagedAsset)
  })

  console.log(`Uploaded: ${assetDefinition.name}`)
}

async function main() {
  const repositoryRoot = getRepositoryRoot()
  const options = parseArgs(process.argv.slice(2))
  const version = normalizeVersion(options.version || getPackageVersion(repositoryRoot))
  const token = getGitHubToken(options.repository)
  const targetCommitish = resolveTargetCommitish(options.targetCommitish)
  const releaseNotes = getReleaseNotes(repositoryRoot, version)
  const assetDefinitions = getAssetDefinitions(repositoryRoot, version)
  const uploadTempDirectory = createUploadTempDirectory(version)
  const releasePayload = {
    tag_name: `v${version}`,
    target_commitish: targetCommitish,
    name: `OpenAgent v${version}`,
    body: releaseNotes,
    draft: options.draft,
    prerelease: options.prerelease
  }

  try {
    const release = await createOrLoadRelease(options.repository, token, releasePayload)
    const uploadUrl = String(release.upload_url).replace(/\{\?name,label\}$/, '')

    for (const assetDefinition of assetDefinitions) {
      await uploadAsset(options.repository, token, release.id, uploadUrl, assetDefinition, uploadTempDirectory)
    }

    const finalRelease = await githubRequest(`https://api.github.com/repos/${options.repository}/releases/tags/v${version}`, token)
    console.log(`Release URL: ${finalRelease.html_url}`)
  } finally {
    fs.rmSync(uploadTempDirectory, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})