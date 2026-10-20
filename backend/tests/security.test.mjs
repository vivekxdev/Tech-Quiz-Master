// Backend security-hardening tests (Step 10).
//
// Mounts the REAL production app wiring (backend/app.js) and checks the
// things that must hold for every response: security headers, CORS
// allow-listing, 405 handling for known paths, request body caps, and the
// trust-proxy configuration that rate limiting depends on.
//
// No database, no Clerk session and no JWKS are needed: every request below
// is answered by middleware, by a validation/auth guard, or by the centralised
// error handler.
//
// Run: node tests/security.test.mjs

import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(backendDir, '.env') })

const results = []
const check = async (name, fn) => {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`PASS: ${name}`)
  } catch (err) {
    results.push({ name, ok: false, err })
    console.error(`FAIL: ${name}`)
    console.error(`  ${err.message}`)
  }
}

const { createApp, buildAllowedOrigins, buildCorsOrigin } = await import('../app.js')
const { parseTrustProxy } = await import('../middleware/trustProxy.js')
const { readSizeLimit } = await import('../middleware/bodyLimit.js')

// ---------------------------------------------------------------------------
// 1. CORS allow-list comes from the environment
// ---------------------------------------------------------------------------
await check('buildAllowedOrigins: trims, drops blanks and rejects "*"', () => {
  const origins = buildAllowedOrigins({
    FRONTEND_URL: 'https://app.example',
    ADMIN_URL: '  ',
    CORS_EXTRA_ORIGINS: ' https://extra.example , *, ,https://second.example',
  })
  assert.deepEqual(origins, [
    'https://app.example',
    'https://extra.example',
    'https://second.example',
  ])
})

await check('buildAllowedOrigins: no configuration → empty list (fail closed)', () => {
  assert.deepEqual(buildAllowedOrigins({}), [])
})

// ---------------------------------------------------------------------------
// 2. trust proxy configuration (the key rate limiting is built on)
// ---------------------------------------------------------------------------
await check('parseTrustProxy: defaults to one hop, parses counts/IPs, refuses "true"', () => {
  assert.equal(parseTrustProxy({}), 1, 'default must trust the proxy in front of the app')
  assert.equal(parseTrustProxy({ TRUST_PROXY: '' }), 1)
  assert.equal(parseTrustProxy({ TRUST_PROXY: '2' }), 2)
  assert.equal(parseTrustProxy({ TRUST_PROXY: 'false' }), false)
  assert.equal(parseTrustProxy({ TRUST_PROXY: '0' }), false)
  assert.equal(parseTrustProxy({ TRUST_PROXY: '10.0.0.1, 10.0.0.2' }), '10.0.0.1, 10.0.0.2')
  assert.throws(() => parseTrustProxy({ TRUST_PROXY: 'true' }), /spoof/i)
})

// ---------------------------------------------------------------------------
// 2b. Body-size caps must never reach body-parser unparsed
// ---------------------------------------------------------------------------
await check('readSizeLimit: accepts valid sizes, refuses values that disable the cap', () => {
  assert.equal(readSizeLimit({}, 'JSON_BODY_LIMIT', '512kb'), '512kb', 'unset → default')
  assert.equal(readSizeLimit({ JSON_BODY_LIMIT: '2mb' }, 'JSON_BODY_LIMIT', '512kb'), '2mb')
  assert.equal(readSizeLimit({ JSON_BODY_LIMIT: '0.5 mb' }, 'JSON_BODY_LIMIT', '512kb'), '0.5 mb')
  // an empty value simply means "use the default"
  assert.equal(readSizeLimit({ JSON_BODY_LIMIT: '' }, 'JSON_BODY_LIMIT', '512kb'), '512kb')
  // body-parser would read these as "no limit" (or as a nonsense byte count)
  for (const bad of ['lots', '0kb', '-5mb', '512b', '512', '12 apples']) {
    assert.throws(
      () => readSizeLimit({ JSON_BODY_LIMIT: bad }, 'JSON_BODY_LIMIT', '512kb'),
      /not a valid size limit/,
      `expected "${bad}" to be rejected`
    )
  }
})

await check('createApp refuses an invalid JSON_BODY_LIMIT instead of shipping no cap', () => {
  assert.throws(
    () => createApp({ env: { ...process.env, JSON_BODY_LIMIT: 'lots' } }),
    /JSON_BODY_LIMIT/
  )
})

await check('createApp refuses an invalid URLENCODED_BODY_LIMIT instead of shipping no cap', () => {
  assert.throws(
    () => createApp({ env: { ...process.env, URLENCODED_BODY_LIMIT: 'lots' } }),
    /URLENCODED_BODY_LIMIT/
  )
})

// ---------------------------------------------------------------------------
// 3. Build the app once, with deterministic CORS origins
// ---------------------------------------------------------------------------
const previousEnv = {
  FRONTEND_URL: process.env.FRONTEND_URL,
  ADMIN_URL: process.env.ADMIN_URL,
  CORS_EXTRA_ORIGINS: process.env.CORS_EXTRA_ORIGINS,
}
process.env.FRONTEND_URL = 'https://allowed.example'
process.env.ADMIN_URL = 'https://admin.example'
process.env.CORS_EXTRA_ORIGINS = 'https://extra.example'

const app = createApp()
const listener = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s))
})
const base = `http://127.0.0.1:${listener.address().port}`

const call = (method, urlPath, { headers = {}, body, contentType } = {}) => {
  const finalHeaders = { ...headers }
  if (body !== undefined) finalHeaders['Content-Type'] = contentType || 'application/json'
  return fetch(`${base}${urlPath}`, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? body : undefined,
  })
}

const expectErrorBody = async (res, status) => {
  assert.equal(res.status, status, `expected ${status}, got ${res.status}`)
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`expected JSON body, got: ${text.slice(0, 200)}`)
  }
  assert.equal(body.success, false, `expected success:false, got ${text.slice(0, 200)}`)
  assert.equal(typeof body.message, 'string')
  const haystack = text.toLowerCase()
  for (const leak of ['    at ', 'node_modules', 'mongodb://', 'entity too large']) {
    assert.ok(!haystack.includes(leak), `error body leaked "${leak}": ${text.slice(0, 300)}`)
  }
  return body
}

// ---------------------------------------------------------------------------
// 4. Security headers on a real response
// ---------------------------------------------------------------------------
await check('security headers: helmet set on every response, X-Powered-By hidden', async () => {
  const res = await call('GET', '/')
  assert.equal(res.status, 200)

  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin')
  assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin')
  assert.ok(res.headers.get('content-security-policy'), 'Content-Security-Policy missing')
  assert.ok(res.headers.get('strict-transport-security'), 'Strict-Transport-Security missing')
  assert.ok(res.headers.get('x-frame-options'), 'X-Frame-Options missing')
  assert.ok(res.headers.get('referrer-policy'), 'Referrer-Policy missing')
  assert.equal(res.headers.get('x-xss-protection'), '0')
  assert.equal(res.headers.get('x-powered-by'), null, 'X-Powered-By must not be exposed')
})

await check('trust proxy is applied to the app instance', () => {
  assert.equal(app.get('trust proxy'), 1)
})

// ---------------------------------------------------------------------------
// 5. CORS
// ---------------------------------------------------------------------------
await check('CORS: configured origin is echoed with credentials', async () => {
  const res = await call('GET', '/', { headers: { Origin: 'https://allowed.example' } })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://allowed.example')
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true')
  assert.match(res.headers.get('vary') || '', /Origin/i)
})

await check('CORS: extra configured origin is allowed too', async () => {
  const res = await call('GET', '/', { headers: { Origin: 'https://extra.example' } })
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://extra.example')
})

await check('CORS: configured admin origin is allowed', async () => {
  const res = await call('GET', '/api/admin/quiz/not-an-id', {
    headers: { Origin: 'https://admin.example' },
  })
  assert.equal(res.status, 400, 'admin API answered (validation, no DB needed)')
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://admin.example')
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true')
})

await check('CORS: unknown origin gets no allow-origin header (blocked by the browser)', async () => {
  const res = await call('GET', '/', { headers: { Origin: 'https://evil.example' } })
  assert.equal(res.status, 200, 'the request still runs; CORS is enforced by the browser')
  assert.equal(res.headers.get('access-control-allow-origin'), null)
})

await check('CORS: preflight OPTIONS is answered by the cors middleware', async () => {
  const res = await call('OPTIONS', '/api/admin/quizzes', {
    headers: {
      Origin: 'https://allowed.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://allowed.example')
  assert.equal(res.headers.get('access-control-allow-methods'), 'GET,HEAD,PUT,PATCH,POST,DELETE')
})

await check('CORS: loopback origins on any port are allowed outside production', async () => {
  const res = await call('OPTIONS', '/api/admin/quizzes', {
    headers: {
      Origin: 'http://localhost:5175',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  })
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5175')
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true')
})

await check('CORS: production does not implicitly allow loopback origins', () => {
  const allow = (env, origin) => {
    let result
    buildCorsOrigin(env)(origin, (err, allowed) => {
      assert.equal(err, null)
      result = allowed
    })
    return result
  }
  const env = { NODE_ENV: 'production', FRONTEND_URL: 'https://app.example' }
  assert.equal(allow(env, 'https://app.example'), true)
  assert.equal(allow(env, 'http://localhost:5175'), false)
  assert.equal(allow({ ...env, NODE_ENV: 'development' }, 'http://localhost:5175'), true)
})

// ---------------------------------------------------------------------------
// 6. 405 for known paths, 404 for unknown ones
// ---------------------------------------------------------------------------
await check('405: unmatched method on a known path returns Allow + JSON contract', async () => {
  const cases = [
    ['PUT', '/api/admin/upload-quiz', 'POST'],
    ['POST', '/api/admin/stats', 'GET'],
    ['POST', '/api/admin/quizzes', 'GET'],
    ['DELETE', '/api/results/create', 'POST'],
    ['PATCH', '/api/results/my-results', 'GET'],
    ['GET', '/api/users/webhook/clerk', 'POST'],
    ['PUT', '/api/admin/quiz/64b000000000000000000000', 'GET, DELETE'],
  ]
  for (const [method, urlPath, allow] of cases) {
    const res = await call(method, urlPath)
    const body = await expectErrorBody(res, 405)
    assert.equal(res.headers.get('allow'), allow, `${method} ${urlPath} Allow header`)
    assert.match(body.message, new RegExp(method))
  }
})

await check('405: authentication is not required to learn the allowed methods', async () => {
  const res = await call('PUT', '/api/admin/upload-quiz')
  assert.equal(res.status, 405)
  assert.equal(res.headers.get('allow'), 'POST')
})

await check('OPTIONS never falls through to 405 (the cors middleware answers it)', async () => {
  const res = await call('OPTIONS', '/api/admin/upload-quiz')
  assert.equal(res.status, 204)
  assert.equal(res.headers.get('allow'), null)
})

await check('unknown route still returns 404 with the JSON error contract', async () => {
  const res = await call('GET', '/api/does-not-exist')
  const body = await expectErrorBody(res, 404)
  assert.match(body.message, /not found/i)
})

await check('unknown path on a known router still returns 404 (not 405)', async () => {
  const res = await call('POST', '/api/admin/does-not-exist')
  await expectErrorBody(res, 404)
})

// ---------------------------------------------------------------------------
// 7. Request body caps
// ---------------------------------------------------------------------------
await check('oversized JSON body → 413 with a stable message', async () => {
  const payload = JSON.stringify({ technology: 'x'.repeat(600 * 1024) })
  const res = await call('POST', '/api/results/create', { body: payload })
  const body = await expectErrorBody(res, 413)
  assert.equal(body.message, 'Request payload is too large')
})

await check('oversized webhook body → 413 before any signature verification', async () => {
  const res = await call('POST', '/api/users/webhook/clerk', {
    body: 'y'.repeat(200 * 1024),
  })
  const body = await expectErrorBody(res, 413)
  assert.equal(body.message, 'Request payload is too large')
})

await check('body just under the JSON cap is still parsed', async () => {
  const payload = JSON.stringify({ technology: 'x'.repeat(400 * 1024) })
  const res = await call('POST', '/api/results/create', { body: payload })
  // 401 comes from the controller: the body was accepted and parsed.
  assert.equal(res.status, 401, `expected 401, got ${res.status}`)
})

await check('oversized urlencoded body → 413, server stays alive', async () => {
  const payload = `technology=${'x'.repeat(200 * 1024)}`
  const res = await call('POST', '/api/results/create', {
    body: payload,
    contentType: 'application/x-www-form-urlencoded',
  })
  await expectErrorBody(res, 413)

  // The same app must still answer normally afterwards.
  const alive = await call('GET', '/')
  assert.equal(alive.status, 200, 'server did not survive the oversized request')
})

await check('normal urlencoded body is rejected with a safe 4xx (never 5xx)', async () => {
  const res = await call('POST', '/api/results/create', {
    body: 'technology=java&level=Basic',
    contentType: 'application/x-www-form-urlencoded',
  })
  assert.ok(res.status >= 400 && res.status < 500, `expected a 4xx, got ${res.status}`)
  await expectErrorBody(res, res.status)

  const alive = await call('GET', '/')
  assert.equal(alive.status, 200, 'server did not survive the urlencoded request')
})

await check('server stays alive after malformed JSON, oversized JSON and bad ObjectIds', async () => {
  const malformed = await call('POST', '/api/results/create', { body: '{bad json' })
  await expectErrorBody(malformed, 400)

  const oversized = await call('POST', '/api/results/create', {
    body: JSON.stringify({ technology: 'x'.repeat(600 * 1024) }),
  })
  await expectErrorBody(oversized, 413)

  const badId = await call('GET', '/api/admin/quiz/not-an-id')
  await expectErrorBody(badId, 400)

  const alive = await call('GET', '/')
  assert.equal(alive.status, 200, 'server did not survive the abuse sequence')
  const stillServing = await call('GET', '/api/does-not-exist')
  assert.equal(stillServing.status, 404, 'routing still works after the abuse sequence')
})

// ---------------------------------------------------------------------------
// 8. Production logging: 4xx stay out of the log, 5xx stay in it
// ---------------------------------------------------------------------------
await check('error logging: 4xx warnings only outside production', async () => {
  const originalWarn = console.warn
  const warnings = []
  console.warn = (...args) => warnings.push(args.join(' '))

  const previousEnv = process.env.NODE_ENV
  try {
    // A malformed body is one of the few 4xx that reaches the centralised
    // error handler (controllers answer most 4xx directly).
    process.env.NODE_ENV = 'development'
    const dev = await call('POST', '/api/results/create', { body: '{bad json' })
    assert.equal(dev.status, 400)
    assert.equal(warnings.length, 1, 'development must log the 4xx')
    assert.match(warnings[0], /\[400\]/)

    warnings.length = 0
    process.env.NODE_ENV = 'production'
    const prod = await call('POST', '/api/results/create', { body: '{bad json' })
    assert.equal(prod.status, 400)
    assert.equal(warnings.length, 0, 'production must not log one line per 4xx')
  } finally {
    console.warn = originalWarn
    if (previousEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousEnv
  }
})

// ---------------------------------------------------------------------------
// 9. Teardown
// ---------------------------------------------------------------------------
await new Promise((resolve) => listener.close(resolve))
for (const [key, value] of Object.entries(previousEnv)) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.error('FAILED:')
  failed.forEach((f) => console.error(` - ${f.name}`))
  process.exit(1)
}
