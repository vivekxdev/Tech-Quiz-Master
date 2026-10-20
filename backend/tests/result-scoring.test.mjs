// End-to-end tests for the secure server-side scoring path
// (POST /api/results/create with { quizId, answers }) and the my-results
// authorization guard.
//
// Same harness as admin-authorization.test.mjs: real routes + real Clerk
// middleware with a locally served JWKS, mongodb-memory-server for the DB.
//
// Run: node tests/result-scoring.test.mjs

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
const userAToken = signToken(claimsFor('clerk_test_user_a'))
const userBToken = signToken(claimsFor('clerk_test_user_b'))

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

await User.create({ clerkId: 'clerk_test_user_a', fullName: 'User A', email: 'a@test.local', role: 'user' })
await User.create({ clerkId: 'clerk_test_user_b', fullName: 'User B', email: 'b@test.local', role: 'user' })

const scoringQuiz = await Quiz.create({
  technology: 'python',
  level: 'Basic',
  timeLimit: 5,
  questions: [
    { question: 'PY q1?', options: ['a1', 'b1', 'c1', 'd1'], answerKey: 'A' }, // correct index 0
    { question: 'PY q2?', options: ['a2', 'b2', 'c2', 'd2'], answerKey: 'C' }, // correct index 2
    { question: 'PY q3?', options: ['a3', 'b3', 'c3', 'd3'], answerKey: 'B' }, // correct index 1
  ],
  createdBy: 'seed',
})
const otherQuiz = await Quiz.create({
  technology: 'rust',
  level: 'Basic',
  timeLimit: 5,
  questions: [{ question: 'RS q1?', options: ['a', 'b', 'c', 'd'], answerKey: 'D' }],
  createdBy: 'seed',
})

const OPTION_LETTERS = ['A', 'B', 'C', 'D']
const quizId = String(scoringQuiz._id)
const questionIdAt = (index) => String(scoringQuiz.questions[index]._id)
// picks[i] = option index the user selected for question i (-1 = unanswered)
const answersFor = (picks) =>
  scoringQuiz.questions.map((question, index) => ({
    questionId: String(question._id),
    selectedAnswer: picks[index],
  }))
const CORRECT_PICKS = [0, 2, 1]
const WRONG_PICKS = [1, 0, 2]

// ---------------------------------------------------------------------------
// 3. Real app wiring (mirrors server.js middleware order)
// ---------------------------------------------------------------------------
const { default: resultRoutes } = await import('../routes/result.js')
const { default: adminRoutes } = await import('../routes/admin.js')

const app = express()
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true }))
const { ClerkExpressWithAuth } = await import('@clerk/clerk-sdk-node')
app.use(ClerkExpressWithAuth({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY }))
app.use(express.json())
app.use('/api/results', resultRoutes)
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

const submitSecure = (token, body) => call('POST', '/api/results/create', { token, body })

// ---------------------------------------------------------------------------
// 4. Authentication + validation tests
// ---------------------------------------------------------------------------
await check('1. secure submission without authentication → 401', async () => {
  const res = await submitSecure(null, { quizId, answers: answersFor(CORRECT_PICKS) })
  assert.equal(res.status, 401, `expected 401, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, false)
})

await check('extra: malformed quizId → 400', async () => {
  const res = await submitSecure(userAToken, { quizId: 'abc', answers: answersFor(CORRECT_PICKS) })
  assert.equal(res.status, 400, `expected 400, got ${res.status}`)
})

await check('2. nonexistent quiz → 404', async () => {
  const missingId = String(new mongoose.Types.ObjectId())
  const res = await submitSecure(userAToken, { quizId: missingId, answers: answersFor(CORRECT_PICKS) })
  assert.equal(res.status, 404, `expected 404, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, false)
})

await check('extra: missing/empty/malformed payloads → 400', async () => {
  const validAnswers = answersFor(CORRECT_PICKS)
  const invalidBodies = [
    { answers: validAnswers },                          // missing quizId
    { quizId },                                          // missing answers
    { quizId, answers: [] },                             // empty answers
    { quizId, answers: 'not-an-array' },                 // malformed answers
    { quizId, answers: [42] },                           // entry not an object
    { quizId, answers: [{ selectedAnswer: 0 }] },        // missing questionId
    { quizId, answers: [{ questionId: questionIdAt(0) }] }, // missing selectedAnswer
  ]
  for (const invalidBody of invalidBodies) {
    const res = await submitSecure(userAToken, invalidBody)
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(invalidBody)}, got ${res.status}`)
  }
})

await check('9. invalid selectedAnswer values → 400', async () => {
  for (const selectedAnswer of [4, -2, 2.5, '2']) {
    const res = await submitSecure(userAToken, {
      quizId,
      answers: [{ questionId: questionIdAt(0), selectedAnswer }],
    })
    assert.equal(res.status, 400, `expected 400 for selectedAnswer=${JSON.stringify(selectedAnswer)}, got ${res.status}`)
  }
})

await check('6. invalid questionId → 400', async () => {
  const res = await submitSecure(userAToken, {
    quizId,
    answers: [{ questionId: 'not-a-valid-object-id', selectedAnswer: 0 }],
  })
  assert.equal(res.status, 400, `expected 400, got ${res.status}`)
})

await check('7. duplicate questionId → 400', async () => {
  const res = await submitSecure(userAToken, {
    quizId,
    answers: [
      { questionId: questionIdAt(0), selectedAnswer: 0 },
      { questionId: questionIdAt(0), selectedAnswer: 1 },
    ],
  })
  assert.equal(res.status, 400, `expected 400, got ${res.status}`)
})

await check('8. questionId from another quiz → 400', async () => {
  const res = await submitSecure(userAToken, {
    quizId,
    answers: [{ questionId: String(otherQuiz.questions[0]._id), selectedAnswer: 0 }],
  })
  assert.equal(res.status, 400, `expected 400, got ${res.status}`)
})

await check('invalid timeTaken → 400', async () => {
  const res = await submitSecure(userAToken, {
    quizId,
    answers: answersFor(CORRECT_PICKS),
    timeTaken: -5,
  })
  assert.equal(res.status, 400, `expected 400, got ${res.status}`)
})

// ---------------------------------------------------------------------------
// 5. Server-side scoring tests
// ---------------------------------------------------------------------------
await check('3. all-correct submission → authoritative score = question count', async () => {
  const res = await submitSecure(userAToken, { quizId, answers: answersFor(CORRECT_PICKS), timeTaken: 42 })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, true)
  assert.deepEqual(body.summary, {
    totalQuestions: 3,
    correctAnswers: 3,
    wrongAnswers: 0,
    unattempted: 0,
    score: 3,
    percentage: 100,
  })
  assert.equal(body.result.score, 3)
  assert.equal(body.result.quizId, quizId)
})

await check('4. all-wrong submission → score 0, no negative marking', async () => {
  const res = await submitSecure(userAToken, { quizId, answers: answersFor(WRONG_PICKS) })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.deepEqual(body.summary, {
    totalQuestions: 3,
    correctAnswers: 0,
    wrongAnswers: 3,
    unattempted: 0,
    score: 0,
    percentage: 0,
  })
})

await check('5. mixed correct/wrong/unanswered → aggregates preserve legacy semantics', async () => {
  const res = await submitSecure(userAToken, { quizId, answers: answersFor([0, 3, -1]) })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.deepEqual(body.summary, {
    totalQuestions: 3,
    correctAnswers: 1,
    wrongAnswers: 1,
    unattempted: 1,
    score: 1,
    percentage: 33,
  })
})

await check('10. forged score → stored/returned score equals server calculation', async () => {
  const res = await submitSecure(userAToken, {
    quizId,
    answers: answersFor([0, 3, -1]), // actual score = 1
    score: 100,
  })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.summary.score, 1, 'summary.score must be server-calculated')
  assert.equal(body.result.score, 1, 'result.score must be server-calculated')
  const stored = await Result.findById(body.result._id)
  assert.equal(stored.score, 1, 'stored score must be server-calculated')
})

await check('11. forged correctAnswers → ignored', async () => {
  const res = await submitSecure(userAToken, {
    quizId,
    answers: answersFor(WRONG_PICKS), // actual correct = 0
    correctAnswers: 99,
  })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.result.correctAnswers, 0)
  const stored = await Result.findById(body.result._id)
  assert.equal(stored.correctAnswers, 0)
})

await check('12. forged totalQuestions → ignored', async () => {
  const res = await submitSecure(userAToken, {
    quizId,
    answers: answersFor(CORRECT_PICKS),
    totalQuestions: 500,
  })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.result.totalQuestions, 3)
  assert.equal(body.summary.totalQuestions, 3)
  const stored = await Result.findById(body.result._id)
  assert.equal(stored.totalQuestions, 3)
})

await check('13. forged technology/level → server uses Quiz document values', async () => {
  const res = await submitSecure(userAToken, {
    quizId,
    answers: answersFor(CORRECT_PICKS),
    technology: 'hacked',
    level: 'Advanced',
  })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.result.technology, 'python')
  assert.equal(body.result.level, 'Basic')
  const stored = await Result.findById(body.result._id)
  assert.equal(stored.technology, 'python')
  assert.equal(stored.level, 'Basic')
})

await check('16. review returned by secure submission matches MongoDB answerKey', async () => {
  const picks = [0, 3, -1]
  const res = await submitSecure(userAToken, { quizId, answers: answersFor(picks) })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  const review = body.result.selectedAnswers
  assert.equal(review.length, scoringQuiz.questions.length, 'review must cover every question')

  let expectedCorrect = 0
  review.forEach((entry, index) => {
    const question = scoringQuiz.questions[index]
    const correctAnswer = OPTION_LETTERS.indexOf(question.answerKey)
    assert.equal(entry.questionId, String(question._id))
    assert.equal(entry.question, question.question)
    assert.deepEqual(entry.options, question.options)
    assert.equal(entry.correctAnswer, correctAnswer, 'review correctAnswer must match stored answerKey')
    assert.equal(entry.selectedAnswer, picks[index])
    const isCorrect = picks[index] !== -1 && picks[index] === correctAnswer
    assert.equal(entry.isCorrect, isCorrect)
    if (isCorrect) expectedCorrect += 1
  })
  assert.equal(body.summary.correctAnswers, expectedCorrect)

  // Stored snapshot must match too (review must survive without the quiz fetch).
  const stored = await Result.findById(body.result._id)
  assert.equal(stored.selectedAnswers.length, scoringQuiz.questions.length)
  stored.selectedAnswers.forEach((entry, index) => {
    assert.equal(
      String(entry.correctAnswer),
      String(OPTION_LETTERS.indexOf(scoringQuiz.questions[index].answerKey))
    )
  })
})

// ---------------------------------------------------------------------------
// 6. my-results authorization tests
// ---------------------------------------------------------------------------
await check('14. my-results without authentication → 401', async () => {
  const res = await call('GET', '/api/results/my-results')
  assert.equal(res.status, 401, `expected 401, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, false)
})

await check('15. user A cannot retrieve user B results', async () => {
  const submitA = await submitSecure(userAToken, { quizId, answers: answersFor([0, 2, -1]) })
  assert.equal(submitA.status, 201, `expected 201, got ${submitA.status}`)
  const aResultId = (await submitA.json()).result._id

  const submitB = await submitSecure(userBToken, { quizId, answers: answersFor(WRONG_PICKS) })
  assert.equal(submitB.status, 201, `expected 201, got ${submitB.status}`)
  const bResultId = (await submitB.json()).result._id

  const listA = await call('GET', '/api/results/my-results', { token: userAToken })
  assert.equal(listA.status, 200, `expected 200, got ${listA.status}`)
  const rowsA = await listA.json()
  assert.ok(Array.isArray(rowsA), 'expected an array')
  assert.ok(rowsA.every((row) => row.userId === 'clerk_test_user_a'), 'user B rows leaked into user A list')
  assert.ok(rowsA.some((row) => row._id === aResultId), 'user A cannot see own result')
  assert.ok(!rowsA.some((row) => row._id === bResultId), 'user B result leaked to user A')

  const listB = await call('GET', '/api/results/my-results', { token: userBToken })
  const rowsB = await listB.json()
  assert.ok(rowsB.every((row) => row.userId === 'clerk_test_user_b'), 'user A rows leaked into user B list')
  assert.ok(rowsB.some((row) => row._id === bResultId), 'user B cannot see own result')
})

// ---------------------------------------------------------------------------
// 7. Quiz-fetch sanitization + compatibility checks
// ---------------------------------------------------------------------------
await check('legacy payload still accepted (temporary migration compatibility)', async () => {
  const res = await call('POST', '/api/results/create', {
    token: userAToken,
    body: {
      technology: 'python',
      level: 'Basic',
      totalQuestions: 3,
      correctAnswers: 3,
      score: 3,
      timeTaken: 30,
      startDate: new Date().toISOString(),
    },
  })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, true)
  assert.equal(body.result.score, 3)
  assert.equal(body.result.quizId, undefined, 'legacy results carry no quizId')
})

await check('quiz fetch sanitization: GET /admin/quizzes keeps frontend fields, strips answerKey/correctAnswer/createdBy', async () => {
  const res = await call('GET', '/api/admin/quizzes')
  assert.equal(res.status, 200, `expected 200, got ${res.status}`)
  const body = await res.json()
  const pythonQuiz = (body.quizzes || []).find((q) => q.technology === 'python' && q.level === 'Basic')
  assert.ok(pythonQuiz, 'seeded quiz missing from GET /admin/quizzes')
  // Exactly the fields the quiz-taking frontend consumes to render a quiz.
  assert.ok(pythonQuiz._id, '_id required by the frontend')
  assert.ok(pythonQuiz.timeLimit, 'timeLimit required by the frontend')
  assert.ok(pythonQuiz.technology && pythonQuiz.level, 'quiz metadata missing')
  assert.ok(Array.isArray(pythonQuiz.questions) && pythonQuiz.questions.length > 0, 'questions missing')
  for (const question of pythonQuiz.questions) {
    assert.ok(question._id, 'question _id required by the frontend')
    assert.ok(question.question, 'question text required by the frontend')
    assert.ok(Array.isArray(question.options) && question.options.length === 4, 'options required by the frontend')
    assert.equal('answerKey' in question, false, 'answerKey must not be exposed')
    assert.equal('correctAnswer' in question, false, 'numeric correctAnswer must not be exposed')
  }
  assert.equal('createdBy' in pythonQuiz, false, 'createdBy must not be exposed')
})

await check('quiz fetch sanitization: GET /admin/quiz/:id strips answerKey/correctAnswer/createdBy', async () => {
  const res = await call('GET', `/api/admin/quiz/${quizId}`)
  assert.equal(res.status, 200, `expected 200, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, true)
  const quiz = body.quiz
  assert.ok(quiz && quiz._id && quiz.timeLimit && quiz.level && quiz.technology, 'quiz metadata missing')
  assert.ok(Array.isArray(quiz.questions) && quiz.questions.length > 0, 'questions missing')
  for (const question of quiz.questions) {
    assert.ok(question._id && question.question && Array.isArray(question.options), 'question fields missing')
    assert.equal('answerKey' in question, false, 'answerKey must not be exposed')
    assert.equal('correctAnswer' in question, false, 'numeric correctAnswer must not be exposed')
  }
  assert.equal('createdBy' in quiz, false, 'createdBy must not be exposed')
})

await check('review does not depend on quiz-fetch answerKey: sanitized fetch + submit still yields server review', async () => {
  // Frontend workflow with no answer data available anywhere in the fetch:
  // fetch quiz → pick questionIds → submit → review correctness must come
  // entirely from the submission response (generated server-side).
  const fetchRes = await call('GET', `/api/admin/quiz/${quizId}`)
  const fetched = (await fetchRes.json()).quiz
  assert.ok(
    fetched.questions.every((q) => !('answerKey' in q) && !('correctAnswer' in q)),
    'fetch must carry no answer data',
  )
  const picks = [0, 2, 1] // correct for the seeded quiz
  const answers = fetched.questions.map((question, index) => ({
    questionId: String(question._id),
    selectedAnswer: picks[index],
  }))
  const res = await submitSecure(userAToken, { quizId, answers, timeTaken: 10 })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  const review = body.result.selectedAnswers
  assert.equal(review.length, fetched.questions.length, 'review must cover every question')
  review.forEach((entry, index) => {
    const expected = OPTION_LETTERS.indexOf(scoringQuiz.questions[index].answerKey)
    assert.equal(entry.correctAnswer, expected, 'review correctAnswer must come from the server')
    assert.equal(entry.isCorrect, picks[index] === expected)
  })
  assert.equal(body.summary.percentage, 100)
})

// The stored record is what GET /api/results/my-results serves: its
// per-question review is the only place the attempted/unattempted split
// survives, so the results list can show wrong and unattempted separately
// (the stored totals cannot).
await check('extra: my-results carries the per-question review for the results list', async () => {
  // Q1 correct, Q2 wrong, Q3 unanswered.
  const res = await submitSecure(userAToken, { quizId, answers: answersFor([0, 0, -1]), timeTaken: 42 })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)

  const listRes = await call('GET', '/api/results/my-results', { token: userAToken })
  assert.equal(listRes.status, 200, `expected 200, got ${listRes.status}`)
  const stored = (await listRes.json()).find(
    (entry) => String(entry.quizId) === quizId && entry.timeTaken === 42,
  )
  assert.ok(stored, 'the submitted result must appear in my-results')
  assert.ok(Array.isArray(stored.selectedAnswers), 'review snapshot missing from my-results')
  assert.equal(stored.selectedAnswers.length, 3, 'review must cover every question')
  assert.deepEqual(
    stored.selectedAnswers.map((entry) => entry.selectedAnswer),
    [0, 0, -1],
  )
  assert.deepEqual(
    stored.selectedAnswers.map((entry) => entry.isCorrect),
    [true, false, false],
  )
})

// ---------------------------------------------------------------------------
// 8. Teardown
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
