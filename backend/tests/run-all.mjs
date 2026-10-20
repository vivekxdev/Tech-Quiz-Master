// Runs every backend test suite sequentially and aggregates the results.
//
// Each suite boots its own mongodb-memory-server + local JWKS, so they are
// run one at a time to avoid port/file contention.
//
// Run: node tests/run-all.mjs   (or: npm test)

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const testsDir = path.dirname(fileURLToPath(import.meta.url))

const suites = [
  'admin-authorization.test.mjs',
  'result-scoring.test.mjs',
  'result-idempotency.test.mjs',
  'result-history.test.mjs',
  'webhook.test.mjs',
  'input-validation.test.mjs',
  'security.test.mjs',
  'rate-limiting.test.mjs',
]

const runSuite = (file) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(testsDir, file)], {
      cwd: path.resolve(testsDir, '..'),
      stdio: 'inherit',
    })
    child.on('exit', (code) => resolve({ file, code: code ?? 1 }))
    child.on('error', (error) => {
      console.error(`Could not start ${file}:`, error.message)
      resolve({ file, code: 1 })
    })
  })

const outcomes = []
for (const file of suites) {
  console.log(`\n=== ${file} ===`)
  outcomes.push(await runSuite(file))
}

console.log('\n=== summary ===')
for (const { file, code } of outcomes) {
  console.log(`${code === 0 ? 'PASS' : 'FAIL'}  ${file}`)
}

const failed = outcomes.filter((outcome) => outcome.code !== 0)
if (failed.length > 0) {
  process.exit(1)
}
