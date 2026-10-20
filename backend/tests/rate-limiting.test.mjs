// Backend rate-limiting tests (Step 10).
//
// Mounts the REAL production wiring (backend/app.js) once per limiter, with
// only the budget lowered through the environment, then proves that the
// limit triggers: the RFC 6585 Retry-After header, the IETF RateLimit /
// RateLimit-Policy headers, the API's own { success: false, message } body,
// that each budget is scoped to its own endpoints, and that two app
// instances never share counters.
//
// Every endpoint used here is answered by middleware, by an auth guard or by
// signature verification — none of them touch the database.
//
// Run: node tests/rate-limiting.test.mjs

import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(backendDir, '.env') })

// svix rejects an empty secret with a plain Error (which would surface as a
// 500 before signature verification), so guarantee one without depending on
// the contents of the local .env.
process.env.CLERK_WEBHOOK_SECRET ||=
  'whsec_' + Buffer.from('rate-limit-test-secret-32-bytes!!').toString('base64')

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

const { createApp } = await import('../app.js')

const listeners = []
const startApp = async (overrides = {}) => {
  const app = createApp({ env: { ...process.env, ...overrides } })
  const listener = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  listeners.push(listener)
  return `http://127.0.0.1:${listener.address().port}`
}

const call = (base, method, urlPath, { body, contentType } = {}) => {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = contentType || 'application/json'
  return fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? body : undefined,
  })
}

// express-rate-limit's draft-7 headers are the combined IETF field
// `RateLimit: limit=3, remaining=2, reset=900` plus `RateLimit-Policy`.
const rateLimitOf = (res) => {
  const raw = res.headers.get('ratelimit')
  assert.ok(raw, 'RateLimit header missing')
  return Object.fromEntries(
    raw
      .split(',')
      .map((part) => part.trim().split('='))
      .filter((pair) => pair.length === 2)
  )
}

const expect429 = async (res, expectedLimit) => {
  assert.equal(res.status, 429, `expected 429, got ${res.status}`)
  const body = await res.json()
  assert.deepEqual(body, { success: false, message: 'Too many requests' })

  const retryAfter = res.headers.get('retry-after')
  assert.ok(retryAfter, 'Retry-After header missing')
  assert.ok(Number.isInteger(Number(retryAfter)), `Retry-After not a number: ${retryAfter}`)
  assert.ok(Number(retryAfter) >= 1, `Retry-After must be >= 1, got ${retryAfter}`)
  assert.equal(res.headers.get('x-ratelimit-limit'), null, 'legacy X-RateLimit-* must be off')

  const rate = rateLimitOf(res)
  assert.equal(rate.limit, expectedLimit, 'RateLimit-Limit must reflect the configured budget')
  assert.equal(rate.remaining, '0')
  assert.match(res.headers.get('ratelimit-policy') || '', new RegExp(`^${expectedLimit};w=900$`))
  return rate
}

// ---------------------------------------------------------------------------
// 1. General budget over /api
// ---------------------------------------------------------------------------
await check('general: budget from RATE_LIMIT_GENERAL_MAX, 429 on the next request', async () => {
  const base = await startApp({ RATE_LIMIT_GENERAL_MAX: '3' })

  for (const expectedRemaining of ['2', '1', '0']) {
    const res = await call(base, 'GET', '/api/does-not-exist')
    assert.equal(res.status, 404, 'under budget the route is still served')
    const rate = rateLimitOf(res)
    assert.equal(rate.limit, '3', 'configured limit must be used')
    assert.equal(rate.remaining, expectedRemaining)
    assert.equal(rate.reset, '900', 'default 15 minute window')
  }

  const res = await call(base, 'GET', '/api/does-not-exist')
  const rate = await expect429(res, '3')
  assert.equal(rate.limit, '3')
})

await check('general: only /api routes are counted', async () => {
  const base = await startApp({ RATE_LIMIT_GENERAL_MAX: '1' })

  await call(base, 'GET', '/api/first')
  const blocked = await call(base, 'GET', '/api/second')
  assert.equal(blocked.status, 429)

  const health = await call(base, 'GET', '/')
  assert.equal(health.status, 200, 'the health route is outside /api')
})

// ---------------------------------------------------------------------------
// 2. Result submission budget
// ---------------------------------------------------------------------------
await check('submission: POST /api/results/create has its own tighter budget', async () => {
  const base = await startApp({ RATE_LIMIT_SUBMIT_MAX: '2' })

  for (let i = 0; i < 2; i += 1) {
    const res = await call(base, 'POST', '/api/results/create', { body: '{}' })
    assert.equal(res.status, 401, 'no session: answered by the controller, not the limiter')
    assert.equal(rateLimitOf(res).limit, '2')
  }

  const res = await call(base, 'POST', '/api/results/create', { body: '{}' })
  await expect429(res, '2')
})

await check('submission: exhausting it does not block other endpoints', async () => {
  const base = await startApp({ RATE_LIMIT_SUBMIT_MAX: '1' })

  await call(base, 'POST', '/api/results/create', { body: '{}' })
  const blocked = await call(base, 'POST', '/api/results/create', { body: '{}' })
  assert.equal(blocked.status, 429)

  const other = await call(base, 'GET', '/api/does-not-exist')
  assert.equal(other.status, 404, 'general budget must be untouched')
})

// ---------------------------------------------------------------------------
// 3. Admin budget (shared by upload / stats / delete)
// ---------------------------------------------------------------------------
await check('admin: upload, stats and delete share one budget', async () => {
  const base = await startApp({ RATE_LIMIT_ADMIN_MAX: '2' })

  const first = await call(base, 'POST', '/api/admin/upload-quiz', { body: '{}' })
  assert.equal(first.status, 401, 'no session: answered by protect, not the limiter')
  assert.equal(rateLimitOf(first).limit, '2')

  const second = await call(base, 'GET', '/api/admin/stats')
  assert.equal(second.status, 401, 'second request still under budget')

  const third = await call(base, 'POST', '/api/admin/upload-quiz', { body: '{}' })
  await expect429(third, '2')
})

await check('admin: other admin paths keep only the general budget', async () => {
  const base = await startApp({ RATE_LIMIT_ADMIN_MAX: '1' })

  await call(base, 'POST', '/api/admin/upload-quiz', { body: '{}' })
  const blocked = await call(base, 'POST', '/api/admin/upload-quiz', { body: '{}' })
  assert.equal(blocked.status, 429)

  const other = await call(base, 'POST', '/api/admin/does-not-exist')
  assert.equal(other.status, 404, 'the public catalogue routes are not admin-limited')
})

// ---------------------------------------------------------------------------
// 4. Webhook budget
// ---------------------------------------------------------------------------
await check('webhook: unverified deliveries are limited before SVIX work', async () => {
  const base = await startApp({ RATE_LIMIT_WEBHOOK_MAX: '2' })

  for (let i = 0; i < 2; i += 1) {
    const res = await call(base, 'POST', '/api/users/webhook/clerk', {
      body: '{}',
      contentType: 'application/json',
    })
    assert.equal(res.status, 400, 'missing SVIX headers → 400 from signature verification')
    assert.equal(rateLimitOf(res).limit, '2')
  }

  const res = await call(base, 'POST', '/api/users/webhook/clerk', {
    body: '{}',
    contentType: 'application/json',
  })
  await expect429(res, '2')
})

// ---------------------------------------------------------------------------
// 5. Defaults and instance isolation
// ---------------------------------------------------------------------------
await check('defaults apply when no RATE_LIMIT_* variable is set', async () => {
  const base = await startApp({})
  const res = await call(base, 'GET', '/api/does-not-exist')
  assert.equal(res.status, 404)
  assert.equal(rateLimitOf(res).limit, '600', 'default general budget')
})

await check('two app instances never share counters', async () => {
  const first = await startApp({ RATE_LIMIT_GENERAL_MAX: '1' })
  await call(first, 'GET', '/api/one')
  const blocked = await call(first, 'GET', '/api/two')
  assert.equal(blocked.status, 429)

  const second = await startApp({ RATE_LIMIT_GENERAL_MAX: '1' })
  const fresh = await call(second, 'GET', '/api/one')
  assert.equal(fresh.status, 404, 'a new app starts with a fresh window')
})

await check('server stays alive after a 429 rejection', async () => {
  const base = await startApp({ RATE_LIMIT_GENERAL_MAX: '1' })
  await call(base, 'GET', '/api/first')
  const blocked = await call(base, 'GET', '/api/second')
  assert.equal(blocked.status, 429)
  assert.deepEqual(await blocked.json(), { success: false, message: 'Too many requests' })

  const health = await call(base, 'GET', '/')
  assert.equal(health.status, 200, 'the health route still answers after a 429')
})

// ---------------------------------------------------------------------------
// 6. Teardown
// ---------------------------------------------------------------------------
await Promise.all(listeners.map((listener) => new Promise((resolve) => listener.close(resolve))))

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.error('FAILED:')
  failed.forEach((f) => console.error(` - ${f.name}`))
  process.exit(1)
}
