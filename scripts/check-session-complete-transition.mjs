/**
 * Regression: PATCH session status COMPLETED must require IN_PROGRESS.
 * Prevents CANCELLED→COMPLETED (and COMPLETED→COMPLETED) resurrection into
 * dashboard/reports/OT/MTBF while CANCELLED→IN_PROGRESS stays blocked/gated.
 * Run: node scripts/check-session-complete-transition.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const routePath = path.join(
  process.cwd(),
  'app/api/production/sessions/[id]/route.ts',
)
const source = fs.readFileSync(routePath, 'utf8')

assert.match(
  source,
  /d\.status\s*===\s*['"]COMPLETED['"]\s*&&\s*existing\.status\s*!==\s*['"]IN_PROGRESS['"]/,
  'session PATCH must reject COMPLETED unless existing status is IN_PROGRESS',
)

assert.match(
  source,
  /Only IN_PROGRESS sessions can be completed/,
  'session PATCH must return an explicit complete-transition error',
)

console.log('ok: session COMPLETED transition requires IN_PROGRESS')
