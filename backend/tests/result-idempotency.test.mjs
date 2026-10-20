// Server-side submission idempotency (Phase 2 Step 4).
//
// POST /api/results/create must persist AT MOST ONE result per quiz attempt
// (keyed by the authenticated user + attemptId) while a genuinely new attempt
// by the same user on the same quiz still records its own result.
//
// Same harness as result-scoring.test.mjs: real routes + real Clerk middleware
// with a locally served JWKS, mongodb-memory-server for the DB. Result.init()
// is awaited explicitly so the unique index under test provably exists before
// the concurrency checks run (server.js does the same before serving traffic).
//
// Run: node tests/result-idempotency.test.mjs

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
const userAToken = signToken(claimsFor('clerk_idempotency_a'))
const userBToken = signToken(claimsFor('clerk_idempotency_b'))

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

// The whole suite depends on the unique index existing BEFORE any write; do
// not rely on mongoose' background autoIndex kick-off.
await Result.init()

await User.create({ clerkId: 'clerk_idempotency_a', fullName: 'User A', email: 'a@test.local', role: 'user' })
await User.create({ clerkId: 'clerk_idempotency_b', fullName: 'User B', email: 'b@test.local', role: 'user' })

const idempotencyQuiz = await Quiz.create({
  technology: 'go',
  level: 'Basic',
  timeLimit: 5,
  questions: [
    { question: 'GO q1?', options: ['a1', 'b1', 'c1', 'd1'], answerKey: 'A' },
    { question: 'GO q2?', options: ['a2', 'b2', 'c2', 'd2'], answerKey: 'C' },
    { question: 'GO q3?', options: ['a3', 'b3', 'c3', 'd3'], answerKey: 'B' },
  ],
  createdBy: 'seed',
})

const quizId = String(idempotencyQuiz._id)
const answersFor = (picks) =>
  idempotencyQuiz.questions.map((question, index) => ({
    questionId: String(question._id),
    selectedAnswer: picks[index],
  }))
const CORRECT_PICKS = [0, 2, 1]
const WRONG_PICKS = [1, 0, 2]

const USER_A = 'clerk_idempotency_a'
const USER_B = 'clerk_idempotency_b'

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

const submitSecure = (token, body) => call('POST', '/api/results/create', { token, body })
const secureBody = (attemptId, picks = CORRECT_PICKS, extra = {}) => ({
  quizId,
  answers: answersFor(picks),
  timeTaken: 42,
  ...extra,
  ...(attemptId === undefined ? {} : { attemptId }),
})
const countFor = (query) => Result.countDocuments(query)

// ---------------------------------------------------------------------------
// 4. Persistence-layer guarantee (the index itself)
// ---------------------------------------------------------------------------
await check('unique partial index on (userId, attemptId) is built', async () => {
  const indexes = await Result.collection.indexes()
  const index = indexes.find((entry) =>
    entry.key && entry.key.userId === 1 && entry.key.attemptId === 1,
  )
  assert(index, 'missing index on { userId, attemptId }')
  assert.equal(index.unique, true, 'the index must be unique')
  assert.deepEqual(
    index.partialFilterExpression,
    { attemptId: { $type: 'string' } },
    'the index must skip legacy rows that carry no attemptId',
  )
})

await check('the database rejects a second insert for the same (user, attempt)', async () => {
  const attemptId = randomUUID()
  const baseDoc = {
    userId: USER_A,
    userName: 'User A',
    userEmail: 'a@test.local',
    quizId: idempotencyQuiz._id,
    technology: 'go',
    level: 'Basic',
    totalQuestions: 3,
    correctAnswers: 3,
    score: 3,
    attemptId,
  }

  // Two writes with the same key, issued without awaiting each other.
  const settled = await Promise.allSettled([
    Result.create(baseDoc),
    Result.create(baseDoc),
  ])
  const fulfilled = settled.filter((entry) => entry.status === 'fulfilled')
  const rejected = settled.filter((entry) => entry.status === 'rejected')
  assert.equal(fulfilled.length, 1, 'exactly one insert may win')
  assert.equal(rejected.length, 1, 'the second insert must be rejected')
  assert.equal(rejected[0].reason?.code, 11000, 'rejection must be a duplicate-key error')
  assert.equal(await countFor({ userId: USER_A, attemptId }), 1)

  await Result.deleteMany({ userId: USER_A, attemptId })
})

await check('legacy rows without attemptId are never constrained by the index', async () => {
  const legacyDoc = {
    userId: USER_A,
    userName: 'User A',
    userEmail: 'a@test.local',
    technology: 'go',
    level: 'Basic',
    totalQuestions: 3,
    correctAnswers: 2,
    score: 2,
    // no attemptId, no quizId: the shape of a pre-migration result
  }
  const first = await Result.create(legacyDoc)
  const second = await Result.create(legacyDoc)
  assert.notEqual(String(first._id), String(second._id))
  await Result.deleteMany({ _id: { $in: [first._id, second._id] } })
})

// ---------------------------------------------------------------------------
// 5. Idempotent submission behaviour
// ---------------------------------------------------------------------------
let firstAttemptId = randomUUID()
let firstResultId = null
let firstSummary = null

await check('1. first submission creates exactly one result', async () => {
  const before = await countFor({ userId: USER_A, attemptId: firstAttemptId })
  assert.equal(before, 0, 'attempt must start with no records')

  const res = await submitSecure(userAToken, secureBody(firstAttemptId))
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, true)
  assert.equal(body.result.attemptId, firstAttemptId)
  assert.equal(body.result.userId, USER_A, 'userId must come from the session')
  assert.equal(body.result.score, 3, 'scoring stays server-authoritative')
  assert.equal(body.idempotent, undefined, 'a first submission is not a replay')

  firstResultId = body.result._id
  firstSummary = body.summary
  assert.deepEqual(firstSummary, {
    totalQuestions: 3,
    correctAnswers: 3,
    wrongAnswers: 0,
    unattempted: 0,
    score: 3,
    percentage: 100,
  })
  assert.equal(await countFor({ userId: USER_A, attemptId: firstAttemptId }), 1)
})

await check('2. repeating the identical request creates no second result', async () => {
  const res = await submitSecure(userAToken, secureBody(firstAttemptId))
  assert.equal(res.status, 200, `expected 200 for a replay, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, true)
  assert.equal(body.idempotent, true, 'a replay must be marked as idempotent')
  assert.equal(body.result._id, firstResultId, 'the recorded result must be returned')
  assert.deepEqual(body.summary, firstSummary, 'summary must match the original response')
  assert(
    Array.isArray(body.result.selectedAnswers) && body.result.selectedAnswers.length === 3,
    'the replay must still carry the review snapshot for My Result',
  )
  assert.equal(await countFor({ userId: USER_A, attemptId: firstAttemptId }), 1)
})

// A key-less submission is the pre-idempotency contract: older clients (and
// the deployed frontend until it migrates) never send attemptId, and that
// behaviour must not change.
await check('3. secure submissions without an attemptId keep the old behaviour', async () => {
  const payload = secureBody(undefined)
  assert.equal(payload.attemptId, undefined, 'the key must be absent, not empty')

  const first = await submitSecure(userAToken, payload)
  const second = await submitSecure(userAToken, payload)
  assert.equal(first.status, 201, `expected 201, got ${first.status}`)
  assert.equal(second.status, 201, `expected 201, got ${second.status}`)

  const firstBody = await first.json()
  const secondBody = await second.json()
  assert.notEqual(
    String(firstBody.result._id),
    String(secondBody.result._id),
    'identical key-less submissions must stay non-idempotent',
  )
  assert.equal(firstBody.result.attemptId, undefined)
  assert.equal(secondBody.idempotent, undefined, 'no key means no replay marking')

  await Result.deleteMany({
    _id: { $in: [firstBody.result._id, secondBody.result._id] },
  })
})

await check('4. retry after a simulated lost response returns the existing result', async () => {
  const attemptId = randomUUID()

  // The response to the first request is received but "lost" by the client.
  const lost = await submitSecure(userAToken, secureBody(attemptId))
  assert.equal(lost.status, 201, `expected 201, got ${lost.status}`)
  const original = await lost.json()

  // The client retries the very same request later.
  const retry = await submitSecure(userAToken, secureBody(attemptId))
  assert.equal(retry.status, 200, `expected 200, got ${retry.status}`)
  const body = await retry.json()
  assert.equal(body.idempotent, true)
  assert.equal(body.result._id, original.result._id, 'the retry must return the original record')
  assert.deepEqual(body.summary, original.summary, 'the retry must return the original summary')
  assert.equal(await countFor({ userId: USER_A, attemptId }), 1)
})

await check('5. concurrent identical requests cannot create duplicate records', async () => {
  const attemptId = randomUUID()
  const payload = secureBody(attemptId)

  const responses = await Promise.all(
    Array.from({ length: 6 }, () => submitSecure(userAToken, payload)),
  )
  const bodies = await Promise.all(responses.map((res) => res.json()))
  const statuses = responses.map((res) => res.status)

  for (const status of statuses) {
    assert(
      status === 200 || status === 201,
      `unexpected status ${status} in ${JSON.stringify(statuses)}`,
    )
  }
  assert.equal(
    statuses.filter((status) => status === 201).length,
    1,
    `exactly one request may create the record, got ${JSON.stringify(statuses)}`,
  )
  assert.equal(
    bodies.filter((body) => body.idempotent === true).length,
    responses.length - 1,
    'every losing request must replay the recorded result',
  )
  const ids = new Set(bodies.map((body) => String(body.result._id)))
  assert.equal(ids.size, 1, 'all responses must report the same result')
  assert.equal(await countFor({ userId: USER_A, attemptId }), 1)

  // Database-level confirmation: whatever path each request took, only one
  // row exists for this attempt.
  const rows = await Result.find({ userId: USER_A, attemptId })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].score, 3)
})

await check('6. a new attempt for the same user and quiz creates a separate result', async () => {
  const secondAttemptId = randomUUID()
  const res = await submitSecure(userAToken, secureBody(secondAttemptId, WRONG_PICKS))
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.notEqual(String(body.result._id), String(firstResultId))
  assert.equal(body.result.attemptId, secondAttemptId)
  assert.equal(body.result.score, 0, 'repeat attempts stay independently scored')

  assert.equal(await countFor({ userId: USER_A, attemptId: firstAttemptId }), 1)
  assert.equal(await countFor({ userId: USER_A, attemptId: secondAttemptId }), 1)

  // Both attempts remain listed for the user (legitimate repeats preserved).
  const list = await call('GET', '/api/results/my-results', { token: userAToken })
  assert.equal(list.status, 200)
  const rows = await list.json()
  const ids = rows.map((row) => String(row._id))
  assert(ids.includes(String(firstResultId)), 'first attempt missing from My Result')
  assert(ids.includes(String(body.result._id)), 'second attempt missing from My Result')
})

await check('7. another user cannot access or reuse a recorded attempt', async () => {
  // User B re-sends the attemptId that already produced a result for user A.
  const res = await submitSecure(userBToken, secureBody(firstAttemptId))
  assert.equal(res.status, 201, `expected 201 (own record), got ${res.status}`)
  const body = await res.json()
  assert.equal(body.result.userId, USER_B, "B's record must be owned by B")
  assert.notEqual(String(body.result._id), String(firstResultId), "B must not receive A's record")
  assert.equal(body.idempotent, undefined, 'the same attempt id is a different attempt for another user')

  assert.equal(await countFor({ userId: USER_A, attemptId: firstAttemptId }), 1)
  assert.equal(await countFor({ userId: USER_B, attemptId: firstAttemptId }), 1)

  const listB = await call('GET', '/api/results/my-results', { token: userBToken })
  const rowsB = await listB.json()
  assert(
    !rowsB.some((row) => String(row._id) === String(firstResultId)),
    "user A's result leaked into user B's list",
  )
  assert(rowsB.every((row) => row.userId === USER_B), 'foreign rows in user B list')

  const listA = await call('GET', '/api/results/my-results', { token: userAToken })
  const rowsA = await listA.json()
  assert(
    rowsA.some((row) => String(row._id) === String(firstResultId)),
    'user A lost their own result',
  )
  assert(
    !rowsA.some((row) => String(row._id) === String(body.result._id)),
    "user B's result leaked into user A's list",
  )
})

await check('8. a modified retry cannot overwrite the recorded result', async () => {
  const attemptId = randomUUID()

  const original = await (await submitSecure(userAToken, secureBody(attemptId, CORRECT_PICKS))).json()
  assert.equal(original.result.score, 3)

  // Same attempt, different answers plus forged score fields.
  const tampered = await submitSecure(
    userAToken,
    secureBody(attemptId, WRONG_PICKS, { score: 100, correctAnswers: 99 }),
  )
  assert.equal(tampered.status, 200, `expected 200, got ${tampered.status}`)
  const body = await tampered.json()
  assert.equal(body.idempotent, true)
  assert.equal(body.result.score, 3, 'the replay must return the recorded score')
  assert.equal(body.summary.score, 3, 'the summary must come from the record, not the retry')
  assert.deepEqual(body.summary, original.summary)
  assert.deepEqual(
    body.result.selectedAnswers.map((entry) => entry.selectedAnswer),
    CORRECT_PICKS,
    'the recorded review must be untouched',
  )

  const stored = await Result.findOne({ userId: USER_A, attemptId })
  assert.equal(stored.score, 3, 'the stored score must be unchanged')
  assert.equal(stored.correctAnswers, 3, 'the stored correctAnswers must be unchanged')
  assert.deepEqual(
    stored.selectedAnswers.map((entry) => entry.selectedAnswer),
    CORRECT_PICKS,
    'the stored review must be unchanged',
  )
  assert.equal(await countFor({ userId: USER_A, attemptId }), 1)
})

await check('9. invalid attempt identifiers are rejected', async () => {
  const invalidValues = [
    42,
    true,
    [],
    { id: randomUUID() },
    '',
    '   ',
    'not-a-uuid',
    '656f000000000000000000ff', // an ObjectId, not an attempt id
    '656f0000-0000-0000-0000-0000000000', // too short
    '656f0000-0000-0000-0000-0000000000ffff', // too long
    '656f0000-0000-0000-0000-0000000000zz', // non-hex characters
    '656f0000_0000_0000_0000_0000000000ff', // wrong separators
    `${randomUUID()}-extra`,
  ]

  const before = await countFor({ userId: USER_A })
  for (const attemptId of invalidValues) {
    const res = await submitSecure(userAToken, secureBody(attemptId))
    assert.equal(
      res.status,
      400,
      `expected 400 for attemptId ${JSON.stringify(attemptId)}, got ${res.status}`,
    )
    const body = await res.json()
    assert.equal(body.success, false)
    assert.match(body.message, /attemptId/)
  }
  assert.equal(
    await countFor({ userId: USER_A }),
    before,
    'rejected attempt ids must not create records',
  )
})

await check('attemptId is normalised: upper/lower case are one attempt', async () => {
  const attemptId = randomUUID()
  const created = await submitSecure(userAToken, secureBody(attemptId.toUpperCase()))
  assert.equal(created.status, 201, `expected 201, got ${created.status}`)
  const createdBody = await created.json()
  assert.equal(createdBody.result.attemptId, attemptId, 'stored id must be lowercase')

  const retry = await submitSecure(userAToken, secureBody(attemptId))
  assert.equal(retry.status, 200, `expected 200, got ${retry.status}`)
  const retryBody = await retry.json()
  assert.equal(String(retryBody.result._id), String(createdBody.result._id))
  assert.equal(await countFor({ userId: USER_A, attemptId }), 1)
})

// Ordering contract: after shape validation passes, the existence check runs
// BEFORE the quiz fetch and the answer checks, so a retry for a recorded
// attempt replays the record even when the retry body would otherwise fail
// (404 unknown quiz / 400 foreign answers). Shape validation (quizId format,
// timeTaken range, attemptId UUID) still runs first, so malformed keys are
// never silently "replayed".
await check('10. a replay skips quiz/answer validation, shape validation still wins', async () => {
  const attemptId = randomUUID()
  const created = await submitSecure(userAToken, secureBody(attemptId))
  assert.equal(created.status, 201, `expected 201, got ${created.status}`)

  const missingQuiz = '656f0000000000000000aa99' // valid ObjectId, no such quiz
  const unknownQuizRetry = await submitSecure(
    userAToken,
    secureBody(attemptId, CORRECT_PICKS, { quizId: missingQuiz }),
  )
  assert.equal(unknownQuizRetry.status, 200, `expected replay 200, got ${unknownQuizRetry.status}`)
  assert.equal((await unknownQuizRetry.json()).idempotent, true)

  const foreignAnswer = await submitSecure(
    userAToken,
    secureBody(attemptId, CORRECT_PICKS, {
      answers: [{ questionId: missingQuiz, selectedAnswer: 0 }],
    }),
  )
  assert.equal(foreignAnswer.status, 200, `expected replay 200, got ${foreignAnswer.status}`)
  assert.equal((await foreignAnswer.json()).idempotent, true)
  assert.equal(await countFor({ userId: USER_A, attemptId }), 1)

  // The very same bodies WITHOUT a key keep their normal validation errors.
  const noKeyQuiz = await submitSecure(userAToken, {
    quizId: missingQuiz,
    answers: answersFor(CORRECT_PICKS),
    timeTaken: 42,
  })
  assert.equal(noKeyQuiz.status, 404, `expected 404, got ${noKeyQuiz.status}`)

  const noKeyAnswers = await submitSecure(userAToken, {
    quizId,
    answers: [{ questionId: missingQuiz, selectedAnswer: 0 }],
    timeTaken: 42,
  })
  assert.equal(noKeyAnswers.status, 400, `expected 400, got ${noKeyAnswers.status}`)

  // A malformed key is still rejected before any lookup happens.
  const badKey = await submitSecure(
    userAToken,
    secureBody('not-a-uuid', CORRECT_PICKS, { quizId: missingQuiz }),
  )
  assert.equal(badKey.status, 400, `expected 400, got ${badKey.status}`)
})

await check('11. legacy results without attemptId remain readable', async () => {
  const legacy = await Result.create({
    userId: USER_A,
    userName: 'User A',
    userEmail: 'a@test.local',
    technology: 'python',
    level: 'Basic',
    totalQuestions: 3,
    correctAnswers: 2,
    wrongAnswers: 1,
    score: 2,
    timeTaken: 30,
    startDate: new Date('2024-01-01T00:00:00.000Z'),
  })

  const list = await call('GET', '/api/results/my-results', { token: userAToken })
  assert.equal(list.status, 200)
  const rows = await list.json()
  const row = rows.find((entry) => String(entry._id) === String(legacy._id))
  assert(row, 'pre-migration result disappeared from My Result')
  assert.equal(row.score, 2)
  assert.equal(row.attemptId, undefined, 'legacy rows carry no attempt id')
  assert.equal(row.quizId, undefined, 'legacy rows carry no quizId')

  await Result.deleteMany({ _id: legacy._id })
})

await check('legacy submissions keep their previous per-request behaviour', async () => {
  const legacyPayload = {
    technology: 'python',
    level: 'Basic',
    totalQuestions: 3,
    correctAnswers: 3,
    score: 3,
    timeTaken: 30,
    startDate: new Date().toISOString(),
    // A legacy-shaped body has no attempt to bind to: the key is dropped.
    attemptId: randomUUID(),
  }

  const first = await submitSecure(userAToken, legacyPayload)
  assert.equal(first.status, 201, `expected 201, got ${first.status}`)
  const firstBody = await first.json()
  assert.equal(firstBody.result.attemptId, undefined, 'legacy branch drops attemptId')

  const second = await submitSecure(userAToken, legacyPayload)
  assert.equal(second.status, 201, `expected 201, got ${second.status}`)
  const secondBody = await second.json()
  assert.notEqual(
    String(secondBody.result._id),
    String(firstBody.result._id),
    'legacy submissions stay non-idempotent (temporary compatibility branch)',
  )

  await Result.deleteMany({ _id: { $in: [firstBody.result._id, secondBody.result._id] } })
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
