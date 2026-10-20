// End-to-end tests for the Clerk webhook middleware/order fix.
//
// Mirrors the server.js middleware order: webhook route (express.raw) is
// mounted before the Clerk auth middleware and express.json(), exactly as in
// production. Uses mongodb-memory-server because the project's Atlas cluster
// no longer resolves.
//
// Run: node tests/webhook.test.mjs

import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import { Webhook } from 'svix'

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(backendDir, '.env') })

// Test-controlled secrets: assigned after dotenv so they always win.
const TEST_WEBHOOK_SECRET = `whsec_${randomBytes(32).toString('base64')}`
process.env.CLERK_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET
const ADMIN_TEST_EMAIL = 'admin-webhook@test.local'
process.env.ADMIN_EMAIL = ADMIN_TEST_EMAIL

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

// ---------------------------------------------------------------------------
// Local MongoDB
// ---------------------------------------------------------------------------
const { MongoMemoryServer } = await import('mongodb-memory-server')
const mongod = await MongoMemoryServer.create()
process.env.MONGODB_URI = mongod.getUri('TechQuiz')

const { default: mongoose } = await import('mongoose')
await mongoose.connect(process.env.MONGODB_URI)
const { default: User } = await import('../model/User.js')

// ---------------------------------------------------------------------------
// App with the SAME middleware order as server.js (post-fix)
// ---------------------------------------------------------------------------
const { default: userRoutes } = await import('../routes/user.js')
const { default: adminRoutes } = await import('../routes/admin.js')

const app = express()
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true }))
// Webhook first: raw body + no user-session auth (see server.js comment).
app.use('/api/users', userRoutes)
const { ClerkExpressWithAuth } = await import('@clerk/clerk-sdk-node')
app.use(ClerkExpressWithAuth({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY }))
app.use(express.json())
app.use('/api/admin', adminRoutes)
app.get('/', (req, res) => res.send('API is running!'))

const listener = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s))
})
const base = `http://127.0.0.1:${listener.address().port}`

// ---------------------------------------------------------------------------
// Webhook request helper
// ---------------------------------------------------------------------------
const signer = new Webhook(TEST_WEBHOOK_SECRET)
const wrongSigner = new Webhook(`whsec_${randomBytes(32).toString('base64')}`)

const postWebhook = (payload, { headers = {}, signer: signerToUse = signer, rawBody } = {}) => {
  const body = rawBody ?? (typeof payload === 'string' ? payload : JSON.stringify(payload))
  const now = new Date()
  const msgId = randomUUID()
  const finalHeaders = {
    'content-type': 'application/json',
    'svix-id': msgId,
    'svix-timestamp': String(Math.floor(now.getTime() / 1000)),
    'svix-signature': signerToUse.sign(msgId, now, body),
    ...headers,
  }
  return fetch(`${base}/api/users/webhook/clerk`, {
    method: 'POST',
    headers: finalHeaders,
    body,
  })
}

// ---------------------------------------------------------------------------
// D + E: raw body + valid signature
// ---------------------------------------------------------------------------
await check('D/E: webhook receives the raw body — valid signature accepted → 200 (no user session required)', async () => {
  const res = await postWebhook({ type: 'ping.unused', data: {} })
  assert.equal(res.status, 200, `expected 200, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, true)
})

// ---------------------------------------------------------------------------
// F: invalid signatures
// ---------------------------------------------------------------------------
await check('F: tampered payload with previously valid signature → 400', async () => {
  const original = JSON.stringify({ type: 'ping.unused', data: {} })
  const tampered = JSON.stringify({ type: 'user.created', data: {} })
  const res = await postWebhook(null, { rawBody: tampered, headers: buildOldHeaders(original) })
  assert.equal(res.status, 400, `expected 400, got ${res.status}`)
})

await check('F: signature from wrong secret → 400', async () => {
  const res = await postWebhook({ type: 'ping.unused', data: {} }, { signer: wrongSigner })
  assert.equal(res.status, 400, `expected 400, got ${res.status}`)
})

await check('F: missing svix headers → 400', async () => {
  const res = await fetch(`${base}/api/users/webhook/clerk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'ping.unused', data: {} }),
  })
  assert.equal(res.status, 400, `expected 400, got ${res.status}`)
})

// helper used above: headers signed for `original`, sent with a different body
function buildOldHeaders(signedBody) {
  const now = new Date()
  const msgId = randomUUID()
  return {
    'svix-id': msgId,
    'svix-timestamp': String(Math.floor(now.getTime() / 1000)),
    'svix-signature': signer.sign(msgId, now, signedBody),
  }
}

// ---------------------------------------------------------------------------
// G: malformed requests must not crash the server
// ---------------------------------------------------------------------------
await check('G: malformed JSON body with signature → 400, server survives', async () => {
  const res = await postWebhook(null, { rawBody: '{not-valid-json{{' })
  assert.equal(res.status, 400, `expected 400, got ${res.status}`)
  const alive = await fetch(`${base}/`)
  assert.equal(alive.status, 200, 'server did not survive malformed webhook')
})

await check('G: non-JSON content type (raw parser skips) → 400, server survives', async () => {
  const res = await fetch(`${base}/api/users/webhook/clerk`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: 'hello',
  })
  assert.equal(res.status, 400, `expected 400, got ${res.status}`)
  const alive = await fetch(`${base}/`)
  assert.equal(alive.status, 200, 'server did not survive non-JSON webhook')
})

// ---------------------------------------------------------------------------
// H: existing event handlers still work
// ---------------------------------------------------------------------------
await check('H: user.created (normal email) → 200 and user stored with role "user"', async () => {
  const res = await postWebhook({
    type: 'user.created',
    data: {
      id: 'clerk_webhook_user1',
      first_name: 'Webhook',
      last_name: 'Tester',
      primary_email_address_id: 'email_1',
      email_addresses: [{ id: 'email_1', email_address: 'webhook-user@test.local' }],
    },
  })
  assert.equal(res.status, 200, `expected 200, got ${res.status}`)
  const user = await User.findOne({ clerkId: 'clerk_webhook_user1' })
  assert.ok(user, 'user not created')
  assert.equal(user.role, 'user')
  assert.equal(user.email, 'webhook-user@test.local')
})

await check('H: user.created (ADMIN_EMAIL) → 200 and user stored with role "admin"', async () => {
  const res = await postWebhook({
    type: 'user.created',
    data: {
      id: 'clerk_webhook_admin1',
      first_name: 'Admin',
      last_name: 'Tester',
      primary_email_address_id: 'email_2',
      email_addresses: [{ id: 'email_2', email_address: ADMIN_TEST_EMAIL }],
    },
  })
  assert.equal(res.status, 200, `expected 200, got ${res.status}`)
  const user = await User.findOne({ clerkId: 'clerk_webhook_admin1' })
  assert.ok(user, 'admin user not created')
  assert.equal(user.role, 'admin')
})

await check('H: session.created for unknown user → 200 and user created (logged in)', async () => {
  const res = await postWebhook({
    type: 'session.created',
    data: {
      user_id: 'clerk_webhook_session1',
      user: {
        id: 'clerk_webhook_session1',
        first_name: 'Session',
        last_name: 'User',
        email_addresses: [{ email_address: 'session-user@test.local' }],
      },
    },
  })
  assert.equal(res.status, 200, `expected 200, got ${res.status}`)
  const user = await User.findOne({ clerkId: 'clerk_webhook_session1' })
  assert.ok(user, 'user not created from session.created')
  assert.equal(user.isLoggedIn, true)
})

await check('H: session.created for existing user → 200 and isLoggedIn flipped to true', async () => {
  await User.findOneAndUpdate({ clerkId: 'clerk_webhook_user1' }, { isLoggedIn: false })
  const res = await postWebhook({
    type: 'session.created',
    data: { user_id: 'clerk_webhook_user1' },
  })
  assert.equal(res.status, 200, `expected 200, got ${res.status}`)
  const user = await User.findOne({ clerkId: 'clerk_webhook_user1' })
  assert.equal(user.isLoggedIn, true)
})

await check('H: session.deleted → 200 and isLoggedIn set to false', async () => {
  const res = await postWebhook({
    type: 'session.deleted',
    data: { user_id: 'clerk_webhook_user1' },
  })
  assert.equal(res.status, 200, `expected 200, got ${res.status}`)
  const user = await User.findOne({ clerkId: 'clerk_webhook_user1' })
  assert.equal(user.isLoggedIn, false)
})

// ---------------------------------------------------------------------------
// Normal API routes still work alongside the new order
// ---------------------------------------------------------------------------
await check('normal JSON API route still works: unauthenticated admin op → 401', async () => {
  const res = await fetch(`${base}/api/admin/stats`)
  assert.equal(res.status, 401, `expected 401, got ${res.status}`)
})

await check('normal JSON API route still works: JSON body parsed for protected route (401 before body use)', async () => {
  const res = await fetch(`${base}/api/admin/upload-quiz`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ technology: 'rust', level: 'Basic', timeLimit: 5, questions: [] }),
  })
  assert.equal(res.status, 401, `expected 401, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
await new Promise((resolve) => listener.close(resolve))
await mongoose.disconnect()
await mongod.stop()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.error('FAILED:')
  failed.forEach((f) => console.error(` - ${f.name}`))
  process.exit(1)
}
