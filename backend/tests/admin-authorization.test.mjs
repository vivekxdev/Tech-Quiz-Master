// End-to-end authorization tests for the admin API.
//
// Runs the REAL Express app wiring from routes/admin.js + middleware/auth.js
// with the real Clerk middleware. Only the backing services are local:
//  - Clerk BAPI is replaced via the SDK-supported CLERK_API_URL override,
//    serving a locally generated JWKS so session tokens verify for real.
//  - MongoDB is provided by mongodb-memory-server (the project's Atlas
//    cluster no longer resolves).
//
// Run: node tests/admin-authorization.test.mjs

import assert from 'node:assert/strict'
import http from 'node:http'
import { createSign, generateKeyPairSync } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'

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

// ---------------------------------------------------------------------------
// 1. Local JWKS + session token minting
// ---------------------------------------------------------------------------
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'jwk' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const publicJwk = { ...publicKey, kid: 'local-test-key', alg: 'RS256', use: 'sig' }

const bapi = http.createServer((req, res) => {
  if (req.url.includes('/jwks')) {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ keys: [publicJwk] }))
    return
  }
  res.statusCode = 404
  res.end('{}')
})
await new Promise((resolve) => bapi.listen(0, '127.0.0.1', resolve))
process.env.CLERK_API_URL = `http://127.0.0.1:${bapi.address().port}`

const frontendApi = Buffer.from(
  process.env.CLERK_PUBLISHABLE_KEY.replace('pk_test_', ''),
  'base64url'
).toString()

const b64url = (input) => Buffer.from(input).toString('base64url')
const signToken = (payload) => {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'local-test-key' }))
  const body = b64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const signature = createSign('RSA-SHA256')
    .update(data)
    .sign(privateKey, 'base64url')
  return `${data}.${signature}`
}

const now = Math.floor(Date.now() / 1000)
const claimsFor = (clerkId) => ({
  iss: `https://${frontendApi}`,
  sub: clerkId,
  sid: `sess_${clerkId}`,
  iat: now - 60,
  nbf: now - 120,
  exp: now + 3600,
})
const normalToken = signToken(claimsFor('clerk_test_normal'))
const adminToken = signToken(claimsFor('clerk_test_admin'))

// ---------------------------------------------------------------------------
// 2. Local MongoDB
// ---------------------------------------------------------------------------
const { MongoMemoryServer } = await import('mongodb-memory-server')
const mongod = await MongoMemoryServer.create()
process.env.MONGODB_URI = mongod.getUri('TechQuiz')

const { default: mongoose } = await import('mongoose')
await mongoose.connect(process.env.MONGODB_URI)
const { default: User } = await import('../model/User.js')
const { default: Quiz } = await import('../model/Quiz.js')

await User.create({ clerkId: 'clerk_test_normal', fullName: 'Normal User', email: 'normal@test.local', role: 'user' })
await User.create({ clerkId: 'clerk_test_admin', fullName: 'Admin User', email: 'admin@test.local', role: 'admin' })
const seededQuiz = await Quiz.create({
  technology: 'golang',
  level: 'Basic',
  timeLimit: 5,
  questions: [{ question: 'What is Go?', options: ['lang', 'tool', 'os', 'db'], answerKey: 'A' }],
  createdBy: 'seed',
})

// ---------------------------------------------------------------------------
// 3. Real app wiring (mirrors server.js middleware order)
// ---------------------------------------------------------------------------
const { default: adminRoutes } = await import('../routes/admin.js')

const app = express()
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true }))
const { ClerkExpressWithAuth } = await import('@clerk/clerk-sdk-node')
app.use(ClerkExpressWithAuth({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY }))
app.use(express.json())
app.use('/api/admin', adminRoutes)

const listener = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s))
})
const base = `http://127.0.0.1:${listener.address().port}`

const call = (method, urlPath, { token, body } = {}) => {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  return fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const quizBody = (technology, level) => ({
  technology,
  level,
  timeLimit: 10,
  questions: [
    { question: 'Sample question?', options: ['a', 'b', 'c', 'd'], answerKey: 'A' },
  ],
})

// ---------------------------------------------------------------------------
// 4. Tests
// ---------------------------------------------------------------------------
const endpoints = [
  { name: 'POST /upload-quiz', run: (opts) => call('POST', '/api/admin/upload-quiz', opts) },
  { name: 'POST /quiz/:id/duplicate', run: (opts) => call('POST', `/api/admin/quiz/${seededQuiz._id}/duplicate`, opts) },
  { name: 'DELETE /quiz/:id', run: (opts) => call('DELETE', `/api/admin/quiz/${seededQuiz._id}`, opts) },
  { name: 'GET /stats', run: (opts) => call('GET', '/api/admin/stats', opts) },
]

for (const endpoint of endpoints) {
  await check(`${endpoint.name} → 401 for unauthenticated request`, async () => {
    const res = await endpoint.run({})
    assert.equal(res.status, 401, `expected 401, got ${res.status}`)
    const body = await res.json()
    assert.equal(body.success, false)
  })

  await check(`${endpoint.name} → 401 for invalid token`, async () => {
    const res = await endpoint.run({ token: 'not-a-real-token' })
    assert.equal(res.status, 401, `expected 401, got ${res.status}`)
  })

  await check(`${endpoint.name} → 403 for authenticated normal user`, async () => {
    const res = await endpoint.run({ token: normalToken })
    assert.equal(res.status, 403, `expected 403, got ${res.status}`)
    const body = await res.json()
    assert.equal(body.success, false)
    assert.match(body.message, /admin/i)
  })
}

await check('normal user create did not mutate quiz data', async () => {
  const res = await call('GET', '/api/admin/quizzes')
  const body = await res.json()
  const hasNewQuiz = (body.quizzes || []).some(
    (q) => q.technology === 'javascript' && q.level === 'Basic'
  )
  assert.equal(hasNewQuiz, false, 'quiz was created by a non-admin')
  const targetStillExists = await Quiz.findById(seededQuiz._id)
  assert.ok(targetStillExists, 'seeded quiz was deleted by a non-admin')
})

await check('admin → POST /upload-quiz succeeds (201) and persists', async () => {
  const res = await call('POST', '/api/admin/upload-quiz', {
    token: adminToken,
    body: quizBody('javascript', 'Basic'),
  })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, true)
  // Response is unused by the admin UI; it must still not leak answer keys.
  assert.ok(body.quiz && body.quiz.questions?.length > 0, 'quiz missing from upload response')
  assert.equal('answerKey' in body.quiz.questions[0], false, 'upload response must not expose answerKey')
  assert.equal('createdBy' in body.quiz, false, 'upload response must not expose createdBy')
  const stored = await Quiz.findOne({ technology: 'javascript', level: 'Basic' })
  assert.ok(stored, 'quiz not persisted')
  assert.equal(stored.createdBy, 'clerk_test_admin')
})

await check('admin → POST /quiz/:id/duplicate succeeds (201) and copies the bank server-side', async () => {
  const res = await call('POST', `/api/admin/quiz/${seededQuiz._id}/duplicate`, { token: adminToken })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, true)
  // The clone response keeps the public shape: no answer keys, no createdBy.
  assert.ok(body.quiz && body.quiz.questions?.length > 0, 'copy missing from response')
  assert.equal('answerKey' in body.quiz.questions[0], false, 'duplicate response must not expose answerKey')
  assert.equal('createdBy' in body.quiz, false, 'duplicate response must not expose createdBy')
  // The stored copy keeps the question bank, answer key included (server-side only).
  const copy = await Quiz.findOne({ technology: 'golang (copy)', level: 'Basic' })
  assert.ok(copy, 'copy not persisted')
  assert.equal(copy.questions[0].answerKey, 'A', 'copy must keep the answer key server-side')
  assert.equal(copy.createdBy, 'clerk_test_admin')
})

await check('non-admin duplicate requests never created a copy', async () => {
  // The 401/403 loop above ran the duplicate endpoint three times; only the
  // admin call in the previous check may have created a quiz.
  const copies = await Quiz.countDocuments({ technology: /\(copy/ })
  assert.equal(copies, 1, `expected exactly one copy, found ${copies}`)
})

await check('non-POST on the duplicate path → 405 with Allow: POST', async () => {
  const res = await call('GET', `/api/admin/quiz/${seededQuiz._id}/duplicate`)
  assert.equal(res.status, 405, `expected 405, got ${res.status}`)
  assert.equal(res.headers.get('allow'), 'POST')
})

await check('admin → GET /stats succeeds (200) with stats data', async () => {
  const res = await call('GET', '/api/admin/stats', { token: adminToken })
  assert.equal(res.status, 200, `expected 200, got ${res.status}`)
  const body = await res.json()
  assert.ok(typeof body.totalUsers === 'number' && body.totalUsers >= 2, `bad totalUsers: ${body.totalUsers}`)
  assert.ok(typeof body.loggedInUsers === 'number')
  // Additive catalog counters for the dashboard overview.
  assert.ok(typeof body.totalQuizzes === 'number' && body.totalQuizzes >= 1, `bad totalQuizzes: ${body.totalQuizzes}`)
  assert.ok(typeof body.totalQuestions === 'number' && body.totalQuestions >= 1, `bad totalQuestions: ${body.totalQuestions}`)
  assert.ok(body.levelCounts && typeof body.levelCounts.Basic === 'number', 'levelCounts missing')
  assert.ok(Array.isArray(body.recentQuizzes), 'recentQuizzes missing')
  for (const quiz of body.recentQuizzes) {
    assert.ok(quiz.technology && quiz.level, 'recent quiz metadata missing')
    assert.equal('answerKey' in quiz, false, 'recent quizzes must not expose answer keys')
    assert.equal('questions' in quiz, false, 'recent quizzes stay metadata-only')
  }
})

await check('admin → DELETE /quiz/:id succeeds and quiz is gone', async () => {
  const res = await call('DELETE', `/api/admin/quiz/${seededQuiz._id}`, { token: adminToken })
  assert.equal(res.status, 200, `expected 200, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, true)
  const gone = await Quiz.findById(seededQuiz._id)
  assert.equal(gone, null, 'quiz still exists after admin delete')
})

await check('public quiz flow preserved: GET /quizzes works unauthenticated and never exposes answers', async () => {
  const res = await call('GET', '/api/admin/quizzes')
  assert.equal(res.status, 200, `expected 200, got ${res.status}`)
  const body = await res.json()
  assert.ok(Array.isArray(body.quizzes), 'quizzes array missing')
  assert.ok(body.quizzes.length > 0, 'expected at least one quiz')
  for (const quiz of body.quizzes) {
    assert.ok(quiz._id && quiz.technology && quiz.level && quiz.timeLimit, 'quiz metadata missing')
    assert.ok(Array.isArray(quiz.questions) && quiz.questions.length > 0, 'questions missing')
    for (const question of quiz.questions) {
      assert.ok(question._id, 'question _id missing')
      assert.ok(question.question, 'question text missing')
      assert.ok(Array.isArray(question.options) && question.options.length === 4, 'options missing')
      assert.equal('answerKey' in question, false, 'answerKey must not be exposed')
      assert.equal('correctAnswer' in question, false, 'correctAnswer must not be exposed')
    }
    assert.equal('createdBy' in quiz, false, 'createdBy must not be exposed')
  }
})

await check('public quiz flow preserved: GET /quiz/:id works unauthenticated and never exposes answers', async () => {
  const created = await Quiz.findOne({ technology: 'javascript', level: 'Basic' })
  const res = await call('GET', `/api/admin/quiz/${created._id}`)
  assert.equal(res.status, 200, `expected 200, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, true)
  assert.ok(body.quiz, 'quiz missing')
  assert.ok(body.quiz._id && body.quiz.technology && body.quiz.level && body.quiz.timeLimit, 'quiz metadata missing')
  assert.ok(Array.isArray(body.quiz.questions) && body.quiz.questions.length > 0, 'questions missing')
  for (const question of body.quiz.questions) {
    assert.ok(question._id && question.question && Array.isArray(question.options), 'question fields missing')
    assert.equal('answerKey' in question, false, 'answerKey must not be exposed')
    assert.equal('correctAnswer' in question, false, 'correctAnswer must not be exposed')
  }
  assert.equal('createdBy' in body.quiz, false, 'createdBy must not be exposed')
})

// ---------------------------------------------------------------------------
// 5. Teardown
// ---------------------------------------------------------------------------
await new Promise((resolve) => listener.close(resolve))
bapi.close()
await mongoose.disconnect()
await mongod.stop()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) {
  console.error('FAILED:')
  failed.forEach((f) => console.error(` - ${f.name}`))
  process.exit(1)
}
