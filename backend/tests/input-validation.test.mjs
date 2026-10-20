// Backend input-validation + error-handling tests (Step 9).
//
// Unlike the older suites, this one mounts the REAL production app wiring
// (backend/app.js: middleware order, routes, centralised 404 + error handler)
// so the JSON error contract is exercised end to end. Only the backing
// services are local: Clerk BAPI is replaced via CLERK_API_URL with a locally
// generated JWKS, MongoDB comes from mongodb-memory-server.
//
// Run: node tests/input-validation.test.mjs

import assert from 'node:assert/strict'
import http from 'node:http'
import { createSign, generateKeyPairSync } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import express from 'express'

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
const adminToken = signToken(claimsFor('clerk_val_admin'))
const userToken = signToken(claimsFor('clerk_val_user'))

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

await User.create({ clerkId: 'clerk_val_admin', fullName: 'Val Admin', email: 'val-admin@test.local', role: 'admin' })
await User.create({ clerkId: 'clerk_val_user', fullName: 'Val User', email: 'val-user@test.local', role: 'user' })

const scoringQuiz = await Quiz.create({
  technology: 'java',
  level: 'Basic',
  timeLimit: 5,
  questions: [
    { question: 'JV q1?', options: ['a1', 'b1', 'c1', 'd1'], answerKey: 'A' },
    { question: 'JV q2?', options: ['a2', 'b2', 'c2', 'd2'], answerKey: 'D' },
  ],
  createdBy: 'seed',
})
const otherQuiz = await Quiz.create({
  technology: 'php',
  level: 'Basic',
  timeLimit: 5,
  questions: [{ question: 'PH q1?', options: ['a', 'b', 'c', 'd'], answerKey: 'B' }],
  createdBy: 'seed',
})

const quizId = String(scoringQuiz._id)
const questionIdAt = (index) => String(scoringQuiz.questions[index]._id)
const answersFor = (picks) =>
  scoringQuiz.questions.map((question, index) => ({
    questionId: String(question._id),
    selectedAnswer: picks[index],
  }))
const CORRECT_PICKS = [0, 3]

// ---------------------------------------------------------------------------
// 3. Real production app wiring (backend/app.js)
// ---------------------------------------------------------------------------
const { createApp } = await import('../app.js')
const { errorHandler } = await import('../middleware/errorHandler.js')

const app = createApp()
const listener = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s))
})
const base = `http://127.0.0.1:${listener.address().port}`

const call = (method, urlPath, { token, body, raw, contentType } = {}) => {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined || raw !== undefined) {
    headers['Content-Type'] = contentType || 'application/json'
  }
  return fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const uploadQuiz = (token, body) => call('POST', '/api/admin/upload-quiz', { token, body })
const submitResult = (token, body) => call('POST', '/api/results/create', { token, body })

// The whole API must answer with { success: false, message } and must never
// leak stack traces, driver internals or connection strings.
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
  assert.equal(typeof body.message, 'string', `expected a message string, got ${text.slice(0, 200)}`)
  assert.ok(body.message.length > 0, 'message must not be empty')
  for (const leak of ['    at ', 'node_modules', 'mongodb://', 'MongoServerError', 'Clerk']) {
    assert.ok(!text.includes(leak), `error body leaked "${leak}": ${text.slice(0, 300)}`)
  }
  return body
}

const validQuiz = (overrides = {}) => ({
  technology: 'validationtech',
  level: 'Basic',
  timeLimit: 10,
  questions: [
    { question: 'Valid question?', options: ['a', 'b', 'c', 'd'], answerKey: 'A' },
  ],
  ...overrides,
})

// ---------------------------------------------------------------------------
// 4. Quiz creation / upload validation
// ---------------------------------------------------------------------------
await check('quiz upload: unauthenticated → 401', async () => {
  const res = await uploadQuiz(null, validQuiz())
  await expectErrorBody(res, 401)
})

await check('quiz upload: authenticated non-admin → 403', async () => {
  const res = await uploadQuiz(userToken, validQuiz())
  const body = await expectErrorBody(res, 403)
  assert.match(body.message, /admin/i)
})

await check('quiz upload: missing required fields → 400', async () => {
  const missingCases = [
    {},
    { technology: 'x' },
    { technology: 'x', level: 'Basic' },
    { technology: 'x', level: 'Basic', timeLimit: 5 },
    { technology: '', level: 'Basic', timeLimit: 5, questions: [] },
    { technology: '   ', level: 'Basic', timeLimit: 5, questions: [] },
    { technology: 'x', level: 'Basic', questions: [] },
    { technology: 'x', timeLimit: 5, questions: [] },
    { level: 'Basic', timeLimit: 5, questions: [] },
  ]
  for (const payload of missingCases) {
    const res = await uploadQuiz(adminToken, payload)
    await expectErrorBody(res, 400)
  }
})

await check('quiz upload: invalid technology/category and level → 400', async () => {
  const invalidCases = [
    validQuiz({ technology: 42 }),
    validQuiz({ level: 'Expert' }),
    validQuiz({ level: 'basic' }),
    validQuiz({ level: undefined }),
    validQuiz({ timeLimit: 0 }),
    validQuiz({ timeLimit: '10' }),
    validQuiz({ timeLimit: 2.5 }),
  ]
  for (const payload of invalidCases) {
    const res = await uploadQuiz(adminToken, payload)
    await expectErrorBody(res, 400)
  }
})

await check('quiz upload: invalid questions structure → 400', async () => {
  const invalidCases = [
    validQuiz({ questions: undefined }),
    validQuiz({ questions: 'not-an-array' }),
    validQuiz({ questions: {} }),
    validQuiz({ questions: [] }),
    validQuiz({ questions: ['not-an-object'] }),
    validQuiz({ questions: [null] }),
    validQuiz({ questions: [{ options: ['a', 'b', 'c', 'd'], answerKey: 'A' }] }),
    validQuiz({ questions: [{ question: '   ', options: ['a', 'b', 'c', 'd'], answerKey: 'A' }] }),
    validQuiz({ questions: [{ question: 'q', options: ['a', 'b', 'c'], answerKey: 'A' }] }),
    validQuiz({ questions: [{ question: 'q', options: ['a', 'b', 'c', ''], answerKey: 'A' }] }),
    validQuiz({ questions: [{ question: 'q', options: ['a', 'b', 'c'], answerKey: 'A' }] }),
    validQuiz({ questions: [{ question: 'q', answerKey: 'A' }] }),
  ]
  for (const payload of invalidCases) {
    const res = await uploadQuiz(adminToken, payload)
    await expectErrorBody(res, 400)
  }
})

await check('quiz upload: invalid answerKey → 400', async () => {
  const invalidKeys = ['E', 'a', '', 0, null, undefined, 'AA']
  for (const answerKey of invalidKeys) {
    const res = await uploadQuiz(
      adminToken,
      validQuiz({ questions: [{ question: 'q?', options: ['a', 'b', 'c', 'd'], answerKey }] })
    )
    await expectErrorBody(res, 400)
  }
})

await check('quiz upload: non-object / non-JSON body → 400', async () => {
  const arrayRes = await uploadQuiz(adminToken, [validQuiz()])
  await expectErrorBody(arrayRes, 400)

  const badJson = await call('POST', '/api/admin/upload-quiz', {
    token: adminToken,
    raw: '{"technology": "broken",',
  })
  await expectErrorBody(badJson, 400)

  const nullBody = await call('POST', '/api/admin/upload-quiz', {
    token: adminToken,
    raw: 'null',
  })
  await expectErrorBody(nullBody, 400)
})

await check('quiz upload: valid payload → 201, client-forged fields ignored', async () => {
  const res = await uploadQuiz(adminToken, {
    ...validQuiz({ totalQuestions: 999, createdBy: 'i-am-not-the-admin' }),
  })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, true)
  assert.equal('answerKey' in body.quiz.questions[0], false, 'answerKey must not be exposed')

  const stored = await Quiz.findOne({ technology: 'validationtech', level: 'Basic' })
  assert.ok(stored, 'quiz not persisted')
  assert.equal(stored.createdBy, 'clerk_val_admin', 'createdBy must come from the session')
  assert.equal(stored.totalQuestions, 1, 'totalQuestions must be derived server-side')
})

// ---------------------------------------------------------------------------
// 5. ObjectId handling on quiz routes (never a 500)
// ---------------------------------------------------------------------------
await check('GET /admin/quiz/:id with malformed id → 400 (no 500)', async () => {
  for (const id of ['abc', '123', 'not-a-valid-object-id', 'zzzzzzzzzzzzzzzzzzzzzzzz']) {
    const res = await call('GET', `/api/admin/quiz/${id}`)
    await expectErrorBody(res, 400)
  }
})

await check('DELETE /admin/quiz/:id with malformed id → 400 (no 500)', async () => {
  for (const id of ['abc', '123']) {
    const res = await call('DELETE', `/api/admin/quiz/${id}`, { token: adminToken })
    await expectErrorBody(res, 400)
  }
})

await check('GET /admin/quiz/:id with well-formed but missing id → 404', async () => {
  const missingId = String(new mongoose.Types.ObjectId())
  const res = await call('GET', `/api/admin/quiz/${missingId}`)
  await expectErrorBody(res, 404)
})

await check('DELETE /admin/quiz/:id with well-formed but missing id → 404', async () => {
  const missingId = String(new mongoose.Types.ObjectId())
  const res = await call('DELETE', `/api/admin/quiz/${missingId}`, { token: adminToken })
  await expectErrorBody(res, 404)
})

await check('unauthenticated DELETE /admin/quiz/:id still → 401 before validation', async () => {
  const res = await call('DELETE', '/api/admin/quiz/abc')
  await expectErrorBody(res, 401)
})

// ---------------------------------------------------------------------------
// 6. Result submission validation
// ---------------------------------------------------------------------------
await check('result submission: unauthenticated → 401', async () => {
  const res = await submitResult(null, { quizId, answers: answersFor(CORRECT_PICKS) })
  await expectErrorBody(res, 401)
})

await check('result submission: missing/invalid quizId → 400', async () => {
  const invalidIds = [undefined, null, '', 'abc', 123, { id: quizId }, ['x'], true]
  for (const badId of invalidIds) {
    const payload = { answers: answersFor(CORRECT_PICKS) }
    if (badId !== undefined) payload.quizId = badId
    const res = await submitResult(userToken, payload)
    await expectErrorBody(res, 400)
  }
})

await check('result submission: nonexistent quiz → 404', async () => {
  const missingId = String(new mongoose.Types.ObjectId())
  const res = await submitResult(userToken, { quizId: missingId, answers: answersFor(CORRECT_PICKS) })
  await expectErrorBody(res, 404)
})

await check('result submission: answers not an array / empty / malformed entries → 400', async () => {
  const invalidAnswers = [
    undefined,
    null,
    'not-an-array',
    {},
    [],
    [42],
    ['string'],
    [null],
    [{ selectedAnswer: 0 }],
    [{ questionId: questionIdAt(0) }],
  ]
  for (const answers of invalidAnswers) {
    const res = await submitResult(userToken, { quizId, answers })
    await expectErrorBody(res, 400)
  }
})

await check('result submission: invalid questionId → 400', async () => {
  const invalidQuestionIds = ['not-a-valid-object-id', '', 12345, null, {}, ['x']]
  for (const questionId of invalidQuestionIds) {
    const res = await submitResult(userToken, {
      quizId,
      answers: [{ questionId, selectedAnswer: 0 }],
    })
    await expectErrorBody(res, 400)
  }
})

await check('result submission: duplicate questionId → 400', async () => {
  const res = await submitResult(userToken, {
    quizId,
    answers: [
      { questionId: questionIdAt(0), selectedAnswer: 0 },
      { questionId: questionIdAt(0), selectedAnswer: 1 },
    ],
  })
  await expectErrorBody(res, 400)
})

await check('result submission: invalid selectedAnswer → 400', async () => {
  for (const selectedAnswer of [4, -2, 2.5, '2', 'A', null, undefined, {}, [0], NaN]) {
    const res = await submitResult(userToken, {
      quizId,
      answers: [{ questionId: questionIdAt(0), selectedAnswer }],
    })
    await expectErrorBody(res, 400)
  }
})

await check('result submission: questionId from another quiz → 400', async () => {
  const res = await submitResult(userToken, {
    quizId,
    answers: [{ questionId: String(otherQuiz.questions[0]._id), selectedAnswer: 0 }],
  })
  await expectErrorBody(res, 400)
})

await check('result submission: invalid timeTaken → 400', async () => {
  const invalidTimes = [-1, -0.5, '30', null, {}, [10], true, 1e9, Number.MAX_SAFE_INTEGER]
  for (const timeTaken of invalidTimes) {
    const res = await submitResult(userToken, {
      quizId,
      answers: answersFor(CORRECT_PICKS),
      timeTaken,
    })
    await expectErrorBody(res, 400)
  }
})

await check('result submission: non-object body → 400', async () => {
  const arrayRes = await submitResult(userToken, [{ quizId }])
  await expectErrorBody(arrayRes, 400)

  const badJson = await call('POST', '/api/results/create', {
    token: userToken,
    raw: '{not-json{{',
  })
  await expectErrorBody(badJson, 400)
})

await check('result submission: valid payload → 201 with server-side score', async () => {
  const res = await submitResult(userToken, {
    quizId,
    answers: answersFor(CORRECT_PICKS),
    timeTaken: 42,
    // forged fields that must be ignored
    score: 100,
    correctAnswers: 99,
    wrongAnswers: 99,
    percentage: 100,
    totalQuestions: 500,
    technology: 'hacked',
    level: 'Advanced',
    selectedAnswers: [],
  })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, true)
  assert.equal(body.summary.score, 2, 'score must be server-calculated')
  assert.equal(body.result.score, 2, 'result.score must be server-calculated')
  assert.equal(body.result.technology, 'java')
  assert.equal(body.result.level, 'Basic')
  assert.equal(body.result.totalQuestions, 2)
  const stored = await Result.findById(body.result._id)
  assert.equal(stored.score, 2, 'stored score must be server-calculated')
  assert.equal(stored.technology, 'java')
})

await check('legacy submission: missing required fields → 400 (not 500)', async () => {
  const invalidBodies = [
    {},
    { technology: 'python' },
    { technology: 'python', level: 'Basic' },
    { technology: 'python', level: 'Basic', totalQuestions: 3 },
    { technology: 'python', level: 'Basic', totalQuestions: 3, correctAnswers: 1 },
    { technology: '', level: 'Basic', totalQuestions: 3, correctAnswers: 1, score: 1 },
    { technology: 'python', level: '', totalQuestions: 3, correctAnswers: 1, score: 1 },
    { technology: 'python', level: 'Basic', totalQuestions: '3', correctAnswers: 1, score: 1 },
    { technology: 'python', level: 'Basic', totalQuestions: 3, correctAnswers: -1, score: 1 },
    { technology: 'python', level: 'Basic', totalQuestions: 3, correctAnswers: 1, score: null },
  ]
  for (const payload of invalidBodies) {
    const res = await submitResult(userToken, payload)
    await expectErrorBody(res, 400)
  }
})

await check('legacy submission: valid payload still accepted → 201, forged extras dropped', async () => {
  const res = await submitResult(userToken, {
    technology: 'python',
    level: 'Basic',
    totalQuestions: 3,
    correctAnswers: 3,
    score: 3,
    timeTaken: 30,
    startDate: new Date().toISOString(),
    selectedAnswers: [{ forged: true }],
    wrongAnswers: 5,
    percentage: 99,
  })
  assert.equal(res.status, 201, `expected 201, got ${res.status}`)
  const body = await res.json()
  assert.equal(body.success, true)
  assert.equal(body.result.score, 3)
  assert.equal(body.result.quizId, undefined, 'legacy results carry no quizId')
  const stored = await Result.findById(body.result._id)
  assert.equal(
    stored.selectedAnswers?.length ?? 0,
    0,
    'forged selectedAnswers must not be persisted'
  )
})

// ---------------------------------------------------------------------------
// 7. my-results guard
// ---------------------------------------------------------------------------
await check('GET /results/my-results unauthenticated → 401', async () => {
  const res = await call('GET', '/api/results/my-results')
  await expectErrorBody(res, 401)
})

// ---------------------------------------------------------------------------
// 8. Consistent API errors (404 for unknown routes, JSON everywhere)
// ---------------------------------------------------------------------------
await check('unknown route → 404 with the JSON error contract', async () => {
  const res = await call('GET', '/api/does-not-exist')
  const body = await expectErrorBody(res, 404)
  assert.match(body.message, /not found/i)
})

await check('unknown admin route → 404 with the JSON error contract', async () => {
  const res = await call('POST', '/api/admin/unknown', { token: adminToken, body: {} })
  await expectErrorBody(res, 404)
})

// ---------------------------------------------------------------------------
// 9. Centralised error handler: async failures and CastErrors are contained
// ---------------------------------------------------------------------------
await check('central handler: async handler rejection → 500 JSON without stack/secrets', async () => {
  const errApp = express()
  errApp.get('/boom', async () => {
    throw new Error('secret-connection-string mongodb://user:pass@internal:27017')
  })
  errApp.use(errorHandler)
  const errListener = await new Promise((resolve) => {
    const s = errApp.listen(0, '127.0.0.1', () => resolve(s))
  })
  try {
    const res = await fetch(`http://127.0.0.1:${errListener.address().port}/boom`)
    const body = await expectErrorBody(res, 500)
    assert.equal(body.message, 'Internal server error')
  } finally {
    await new Promise((resolve) => errListener.close(resolve))
  }
})

await check('central handler: CastError → 400 (malformed ObjectId never 500s)', async () => {
  const errApp = express()
  errApp.get('/cast', async () => {
    throw Object.assign(new Error('Cast to ObjectId failed for value "abc"'), {
      name: 'CastError',
    })
  })
  errApp.use(errorHandler)
  const errListener = await new Promise((resolve) => {
    const s = errApp.listen(0, '127.0.0.1', () => resolve(s))
  })
  try {
    const res = await fetch(`http://127.0.0.1:${errListener.address().port}/cast`)
    const body = await expectErrorBody(res, 400)
    assert.equal(body.message, 'Invalid value provided')
  } finally {
    await new Promise((resolve) => errListener.close(resolve))
  }
})

// ---------------------------------------------------------------------------
// 10. Teardown
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
