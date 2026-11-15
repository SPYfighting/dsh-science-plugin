import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const read = (rel) => readFileSync(join(root, rel), 'utf8')
const entry = read('client-src/index.jsx')
const body = read('client-src/conversation/ScienceConfirmCard.jsx')

test('science confirmation card registers a client body for confirm and reject', () => {
  assert.match(entry, /actionCards/)
  assert.match(entry, /register\(\s*\{[\s\S]*action:\s*SCIENCE_CONFIRM_ACTION[\s\S]*locale:\s*SCIENCE_CONFIRM_LOCALE[\s\S]*Body:\s*ScienceConfirmBody/)
  assert.match(body, /export const SCIENCE_CONFIRM_ACTION = 'sci-paper-confirm'/)
  assert.match(body, /send\(\s*['"]confirm['"]\s*\)/)
  assert.match(body, /send\(\s*['"]reject['"]\s*\)/)
  assert.match(body, /act\(verb\)/)
})
