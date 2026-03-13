const http = require('http')
const { once } = require('events')

function parseArgs(argv) {
  const options = {
    baseUrl: '',
    apiKey: 'sk-openagent-smoke',
    model: 'gpt-5.4',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const nextValue = argv[index + 1]

    if (token === '--base-url' && nextValue) {
      options.baseUrl = nextValue.trim()
      index += 1
      continue
    }

    if (token === '--api-key' && nextValue) {
      options.apiKey = nextValue.trim()
      index += 1
      continue
    }

    if (token === '--model' && nextValue) {
      options.model = nextValue.trim()
      index += 1
    }
  }

  return options
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '')
}

function resolveOpenAIBaseUrl(baseUrl) {
  const normalized = trimTrailingSlash(baseUrl)
  if (!normalized) {
    return ''
  }

  return /\/v1$/i.test(normalized) ? normalized : `${normalized}/v1`
}

function isResponsesOnlyCompatibility(status, text) {
  const normalized = String(text || '').toLowerCase()
  return (
    status === 400
    && (
      normalized.includes('please use /v1/responses')
      || normalized.includes('/v1/chat/completions is not supported')
      || (normalized.includes('legacy protocol') && normalized.includes('/v1/responses'))
    )
  )
}

function buildHeaders(apiKey) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
  }
}

async function startMockSub2ApiServer(model) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')

    if (request.method === 'GET' && url.pathname === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        object: 'list',
        data: [{
          id: model,
          object: 'model',
          owned_by: 'openagent-mock',
        }],
      }))
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/responses') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        id: 'resp_mock',
        model,
        status: 'completed',
        output: [{
          id: 'msg_mock',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'pong' }],
        }],
      }))
      return
    }

    if (request.method === 'POST' && url.pathname === '/v1/chat/completions') {
      response.writeHead(400, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        error: {
          message: 'Legacy protocol is disabled. Please use /v1/responses instead.',
        },
      }))
      return
    }

    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      error: {
        message: `Unhandled route: ${request.method} ${url.pathname}`,
      },
    }))
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Failed to acquire mock Sub2API server address.')
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  }
}

async function readJson(response) {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { rawText: text }
  }
}

async function checkModels(baseUrl, headers) {
  const response = await fetch(`${baseUrl}/models`, {
    method: 'GET',
    headers,
  })
  const payload = await readJson(response)
  const models = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : []

  return {
    ok: response.ok && models.length > 0,
    status: response.status,
    count: models.length,
    payload,
  }
}

async function checkResponses(baseUrl, headers, model) {
  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1,
      input: 'ping',
    }),
  })
  const payload = await readJson(response)
  const outputItems = Array.isArray(payload?.output) ? payload.output : []

  return {
    ok: response.ok && outputItems.length > 0,
    status: response.status,
    payload,
  }
}

async function checkLegacyChat(baseUrl, headers, model) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      stream: false,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    }),
  })
  const payload = await readJson(response)
  const message = payload?.error?.message || payload?.rawText || ''
  const compatibility = isResponsesOnlyCompatibility(response.status, message)

  return {
    ok: response.ok || compatibility,
    compatibility,
    status: response.status,
    payload,
  }
}

function printSummary(title, result) {
  const state = result.ok ? 'OK' : 'FAIL'
  console.log(`${state} ${title}`)
  console.log(JSON.stringify(result, null, 2))
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  let serverHandle = null
  let gatewayRoot = options.baseUrl

  if (!gatewayRoot) {
    serverHandle = await startMockSub2ApiServer(options.model)
    gatewayRoot = serverHandle.baseUrl
    console.log(`Using mock Sub2API gateway: ${gatewayRoot}`)
  }

  const openaiBaseUrl = resolveOpenAIBaseUrl(gatewayRoot)
  if (!openaiBaseUrl) {
    throw new Error('Missing Sub2API base URL.')
  }

  const headers = buildHeaders(options.apiKey)
  const modelsResult = await checkModels(openaiBaseUrl, headers)
  printSummary('Sub2API models contract', modelsResult)

  const responsesResult = await checkResponses(openaiBaseUrl, headers, options.model)
  printSummary('Sub2API responses contract', responsesResult)

  const legacyChatResult = await checkLegacyChat(openaiBaseUrl, headers, options.model)
  printSummary('Sub2API legacy chat compatibility', legacyChatResult)

  if (serverHandle?.server) {
    await new Promise((resolve, reject) => {
      serverHandle.server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  }

  if (!modelsResult.ok || !responsesResult.ok || !legacyChatResult.ok) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exit(1)
})
