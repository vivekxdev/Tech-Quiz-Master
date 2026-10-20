// Attempt history endpoint (Phase 2 Step 5): GET /api/results/my-results.
//
// Contract under test:
//   - 401 without a verified session; ownership comes from the session only
//     (client-supplied user ids are ignored)
//   - 200 + a bare JSON array (the shape existing consumers parse), newest
//     first, containing ONLY the caller's rows
//   - optional ?limit= window (1..200), validated; default unchanged
//   - legacy rows (no quizId/attemptId/review snapshot) come back intact
//   - rows never expose a Quiz answerKey; the per-question snapshot stays
//     within the authorized review contract (correct answer as an option
//     index, question text, options)
//   - history agrees with idempotency: one row per recorded attempt, repeat
//     attempts remain separate rows
//
// Same harness as the other result suites: real routes + real Clerk middleware
// with a local JWKS, mongodb-memory-server for the DB.
//
// Run: node tests/result-history.test.mjs

import assert from 'node:assert/strict'
import http from 'node:http'
import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto'
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
  'base64url',
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
const userAToken = signToken(claimsFor('clerk_history_a'))
const userBToken = signToken(claimsFor('clerk_history_b'))
const freshToken = signToken(claimsFor('clerk_history_fresh'))

// ---------------------------------------------------------------------------
// 2. Local MongoDB + seed data
// ---------------------------------------------------------------------------
const { MongoMemoryServer } = await import('mongodb-memory-server')
const mongod = await MongoMemoryServer.create()
process.env.MONGODB_URI = mongod.getUri('TechQuiz')

const { default: mongoose } = await import('mongoose')
await mongoose.connect(process.env.MONGODB_URI)
const { default: User } = await import('../model/User.js')
const { default: Quiz } = await import('../model/Quiz.js')
const { default: Result } = await import('../model/Result.js')

await Result.init()

const USER_A = 'clerk_history_a'
const USER_B = 'clerk_history_b'

await User.create({ clerkId: USER_A, fullName: 'User A', email: 'a@test.local', role: 'user' })
await User.create({ clerkId: USER_B, fullName: 'User B', email: 'b@test.local', role: 'user' })

const historyQuiz = await Quiz.create({
  technology: 'java',
  level: 'Basic',
  timeLimit: 5,
  questions: [
    { question: 'J1?', options: ['a1', 'b1', 'c1', 'd1'], answerKey: 'A' },
    { question: 'J2?', options: ['a2', 'b2', 'c2', 'd2'], answerKey: 'C' },
  ],
  createdBy: 'seed',
})
const quizId = String(historyQuiz._id)
const answersFor = (picks) =>
  historyQuiz.questions.map((question, index) => ({
    questionId: String(question._id),
    selectedAnswer: picks[index],
  }))

// ---------------------------------------------------------------------------
// 3. Real app wiring (mirrors server.js middleware order)
// ---------------------------------------------------------------------------
const { default: resultRoutes } = await import('../routes/result.js')

const app = express()
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true }))
const { ClerkExpressWithAuth } = await import('@clerk/clerk-sdk-node')
app.use(ClerkExpressWithAuth({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY }))
app.use(express.json())
app.use('/api/results', resultRoutes)

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

const myResults = (token, search = '') =>
  call('GET', `/api/results/my-results${search}`, { token })

const submitSecure = (token, body) => call('POST', '/api/results/create', { token, body })

// A result row shaped like the secure submission path stores it.
const secureRow = (overrides = {}) => ({
  userId: USER_A,
  userName: 'User A',
  userEmail: 'a@test.local',
  quizId: historyQuiz._id,
  technology: 'java',
  level: 'Basic',
  totalQuestions: 2,
  correctAnswers: 1,
  score: 1,
  timeTaken: 30,
  startDate: new Date(),
  attemptId: randomUUID(),
  selectedAnswers: [
    {
      questionId: historyQuiz.questions[0]._id,
      question: 'J1?',
      options: ['a1', 'b1', 'c1', 'd1'],
      selectedAnswer: 0,
      correctAnswer: 0,
      isCorrect: true,
    },
    {
      questionId: historyQuiz.questions[1]._id,
      question: 'J2?',
      options: ['a2', 'b2', 'c2', 'd2'],
      selectedAnswer: 0,
      correctAnswer: 2,
      isCorrect: false,
    },
  ],
  ...overrides,
})

// ---------------------------------------------------------------------------
// 4. Ownership, shape and ordering
// ---------------------------------------------------------------------------
await check('1. a request without a session is rejected with 401', async () => {
  const res = await myResults(null)
  assert.equal(res.status, 401, `expected 401, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, false)
})

await check('2. a user with no attempts gets an empty history', async () => {
  const res = await myResults(freshToken)
  assert.equal(res.status, 200, `expected 200, got ${res.status}`)
  const rows = await res.json()
  assert(Array.isArray(rows), 'the response must stay a bare array for existing consumers')
  assert.equal(rows.length, 0, 'a fresh user must start with an empty history')
})

await check('3. client-supplied user ids can never change whose rows come back', async () => {
  await Result.create(secureRow({ userId: USER_A, attemptId: randomUUID() }))
  const foreign = await Result.create(
    secureRow({ userId: USER_B, userName: 'User B', userEmail: 'b@test.local', attemptId: randomUUID() }),
  )

  // Query-string identities must all be ignored: ownership is session-only.
  for (const search of [
    `?userId=${USER_B}`,
    `?user=${USER_B}`,
    `?clerkId=${USER_B}`,
    `?userId=${USER_B}&limit=50`,
  ]) {
    const res = await myResults(userAToken, search)
    assert.equal(res.status, 200, `expected 200 for ${search}, got ${res.status}`)
    const rows = await res.json()
    assert(rows.length > 0, 'user A must still see their own rows')
    assert(
      rows.every((row) => row.userId === USER_A),
      `user B rows leaked via ${search}`,
    )
    assert(
      !rows.some((row) => String(row._id) === String(foreign._id)),
      `user B's specific row leaked via ${search}`,
    )
  }

  const asB = await myResults(userBToken)
  const rowsB = await asB.json()
  assert(
    rowsB.every((row) => row.userId === USER_B),
    'user B must only ever see their own rows',
  )
  assert.equal(rowsB.length, 1, 'user B sees exactly their own single row')

  await Result.deleteMany({ userId: { $in: [USER_A, USER_B] } })
})

await check('4. history comes back newest-first', async () => {
  const stamps = [
    new Date('2025-01-01T10:00:00.000Z'),
    new Date('2025-06-15T10:00:00.000Z'),
    new Date('2025-12-31T10:00:00.000Z'),
  ]
  // Raw inserts with explicit createdAt so the ordering assertion is
  // deterministic (no dependence on write timing).
  await Result.collection.insertMany(
    stamps.map((createdAt, index) => ({
      ...secureRow({ attemptId: randomUUID() }),
      _id: new mongoose.Types.ObjectId(),
      createdAt,
      updatedAt: createdAt,
      startDate: createdAt,
      score: index,
      correctAnswers: index,
    })),
  )

  const rows = await (await myResults(userAToken)).json()
  assert.equal(rows.length, 3)
  assert.deepEqual(
    rows.map((row) => row.correctAnswers),
    [2, 1, 0],
    'rows must be ordered newest attempt first',
  )

  await Result.deleteMany({ userId: USER_A })
})

await check('5. repeated submits of one attempt stay one history row; new attempts add rows', async () => {
  const attemptId = randomUUID()
  const payload = {
    quizId,
    answers: answersFor([0, 2]),
    timeTaken: 12,
    attemptId,
  }

  const first = await submitSecure(userAToken, payload)
  assert.equal(first.status, 201, `expected 201, got ${first.status}`)
  const replay = await submitSecure(userAToken, payload)
  assert.equal(replay.status, 200, `expected idempotent replay 200, got ${replay.status}`)

  const second = await submitSecure(userAToken, { ...payload, attemptId: randomUUID() })
  assert.equal(second.status, 201, `expected 201 for a new attempt, got ${second.status}`)

  const rows = await (await myResults(userAToken)).json()
  const attemptIds = rows.map((row) => row.attemptId)
  assert.equal(
    attemptIds.filter((id) => id === attemptId).length,
    1,
    'a duplicated submit must not add a second history row',
  )
  assert.equal(
    new Set(attemptIds).size,
    2,
    'the legitimate second attempt must remain its own row',
  )

  await Result.deleteMany({ userId: USER_A })
})

await check('6. legacy rows are returned intact alongside secure rows', async () => {
  const legacy = await Result.create({
    userId: USER_A,
    userName: 'User A',
    userEmail: 'a@test.local',
    technology: 'python',
    level: 'Basic',
    totalQuestions: 5,
    correctAnswers: 3,
    score: 3,
    timeTaken: 61,
    startDate: new Date('2024-03-01T00:00:00.000Z'),
    // no quizId, no attemptId, no selectedAnswers: a pre-migration record
  })
  const secure = await Result.create(secureRow({ attemptId: randomUUID() }))

  const rows = await (await myResults(userAToken)).json()
  const legacyRow = rows.find((row) => String(row._id) === String(legacy._id))
  const secureRowFromApi = rows.find((row) => String(row._id) === String(secure._id))

  assert(legacyRow, 'legacy row missing from history')
  assert.equal(legacyRow.quizId, undefined, 'legacy rows carry no quizId')
  assert.equal(legacyRow.attemptId, undefined, 'legacy rows carry no attemptId')
  assert(
    !Array.isArray(legacyRow.selectedAnswers) || legacyRow.selectedAnswers.length === 0,
    'legacy rows must carry no review entries (Mongoose serialises the empty array path)',
  )
  assert.equal(legacyRow.score, 3, 'legacy totals must survive the round trip')

  assert(secureRowFromApi, 'secure row missing from history')
  assert(Array.isArray(secureRowFromApi.selectedAnswers), 'secure rows keep their review snapshot')

  await Result.deleteMany({ userId: USER_A })
})

await check('7. rows expose the authorized review contract, never an answerKey', async () => {
  const created = await submitSecure(userAToken, {
    quizId,
    answers: answersFor([1, 2]),
    timeTaken: 42,
    attemptId: randomUUID(),
  })
  assert.equal(created.status, 201)

  const rows = await (await myResults(userAToken)).json()
  const row = rows[0]

  // No answer key anywhere in the payload (top level or nested).
  assert(
    !JSON.stringify(row).includes('answerKey'),
    'the response must not contain an answerKey field',
  )

  // The review snapshot stays inside the authorized contract: question text,
  // options, the user's pick and the CORRECT OPTION INDEX (never a stored key).
  assert.equal(row.selectedAnswers.length, 2)
  for (const entry of row.selectedAnswers) {
    assert.equal(typeof entry.question, 'string')
    assert(Array.isArray(entry.options) && entry.options.length > 0)
    assert.equal(typeof entry.correctAnswer, 'number')
    assert(entry.correctAnswer >= 0 && entry.correctAnswer < entry.options.length)
    assert.equal(typeof entry.isCorrect, 'boolean')
  }

  await Result.deleteMany({ userId: USER_A })
})

// ---------------------------------------------------------------------------
// 5. Limit window
// ---------------------------------------------------------------------------
await check('8. ?limit= returns only the newest N rows', async () => {
  const stamps = [1, 2, 3].map((day) => new Date(`2025-02-0${day}T10:00:00.000Z`))
  await Result.collection.insertMany(
    stamps.map((createdAt, index) => ({
      ...secureRow({ attemptId: randomUUID() }),
      _id: new mongoose.Types.ObjectId(),
      createdAt,
      updatedAt: createdAt,
      startDate: createdAt,
      correctAnswers: index,
    })),
  )

  const full = await (await myResults(userAToken)).json()
  assert.equal(full.length, 3, 'the default must stay unlimited for existing consumers')

  const limited = await (await myResults(userAToken, '?limit=1')).json()
  assert.equal(limited.length, 1)
  assert.equal(limited[0].correctAnswers, 2, 'limit must cut the NEWEST rows, not the oldest')

  const two = await (await myResults(userAToken, '?limit=2')).json()
  assert.equal(two.length, 2)
  assert.deepEqual(
    two.map((row) => row.correctAnswers),
    [2, 1],
    'limited results keep newest-first order',
  )

  await Result.deleteMany({ userId: USER_A })
})

await check('9. invalid ?limit values are rejected with 400', async () => {
  const before = await Result.collection.countDocuments({ userId: USER_A })

  for (const limit of ['0', '-1', '201', 'abc', '1.5', '', '1e1']) {
    const res = await myResults(userAToken, `?limit=${encodeURIComponent(limit)}`)
    assert.equal(
      res.status,
      400,
      `expected 400 for limit=${JSON.stringify(limit)}, got ${res.status}`,
    )
    const body = await res.json()
    assert.equal(body.success, false)
    assert.match(body.message, /limit/)
  }

  const boundary = await myResults(userAToken, '?limit=1')
  assert.equal(boundary.status, 200, 'limit=1 is the valid lower bound')
  const upper = await myResults(userAToken, '?limit=200')
  assert.equal(upper.status, 200, 'limit=200 is the valid upper bound')

  assert.equal(
    await Result.collection.countDocuments({ userId: USER_A }),
    before,
    'rejected limits must not touch stored rows',
  )
})

// ---------------------------------------------------------------------------
// 6. Teardown
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
