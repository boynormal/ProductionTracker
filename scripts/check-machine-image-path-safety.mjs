/**
 * Regression: machine image local paths must stay under public/uploads.
 * Mirrors lib/machine-image-storage.ts containment rules.
 * Run: node scripts/check-machine-image-path-safety.mjs
 */
import fs from 'fs'
import path from 'path'

const cwd = process.cwd()
const UPLOADS_ROOT = path.resolve(cwd, 'public', 'uploads')
const sourcePath = path.join(cwd, 'lib/machine-image-storage.ts')
const routePath = path.join(cwd, 'app/api/master/machines/route.ts')

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
}

function isPathInsideUploads(resolvedPath) {
  const root = UPLOADS_ROOT.endsWith(path.sep) ? UPLOADS_ROOT : `${UPLOADS_ROOT}${path.sep}`
  return resolvedPath === UPLOADS_ROOT || resolvedPath.startsWith(root)
}

function resolveSafeLocalUploadPath(publicUrl) {
  if (typeof publicUrl !== 'string' || !publicUrl.startsWith('/uploads/')) return null
  if (publicUrl.includes('\0') || publicUrl.includes('\\') || publicUrl.includes('..')) return null
  const relative = publicUrl.slice(1)
  const resolved = path.resolve(cwd, 'public', relative)
  if (!isPathInsideUploads(resolved)) return null
  return resolved
}

function assertSafeUploadMachineId(machineId) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(machineId)) {
    throw new Error('Invalid machine id for upload path')
  }
  return machineId
}

const source = fs.readFileSync(sourcePath, 'utf8')
assert(source.includes('resolveSafeLocalUploadPath'), 'storage helper exports resolveSafeLocalUploadPath')
assert(source.includes('assertSafeUploadMachineId'), 'storage helper exports assertSafeUploadMachineId')
assert(source.includes("publicUrl.includes('..')"), 'storage helper rejects .. in publicUrl')

const route = fs.readFileSync(routePath, 'utf8')
assert(route.includes('machineSchema.safeParse'), 'machine POST validates with machineSchema')
assert(!/prisma\.machine\.create\(\{\s*data:\s*body\s*\}\)/.test(route), 'machine POST no longer passes raw body')

const ok = resolveSafeLocalUploadPath('/uploads/machines/clxyz123/abc.webp')
assert(ok === path.join(UPLOADS_ROOT, 'machines', 'clxyz123', 'abc.webp'), 'valid upload path resolves')

const attacks = [
  '/uploads/../../../.env',
  '/uploads/../../package.json',
  '/uploads/machines/x/../../../../.env.local',
  '/uploads/machines/../secrets.txt',
  '/uploads/machines/abc/..\\..\\..\\.env',
  'uploads/machines/x.webp',
  '/other/uploads/machines/x.webp',
]

for (const url of attacks) {
  assert(resolveSafeLocalUploadPath(url) === null, `rejects traversal: ${url}`)
}

for (const badId of ['../tmp', 'a/b', 'a\\b', '', 'has space', '../../etc']) {
  let threw = false
  try {
    assertSafeUploadMachineId(badId)
  } catch {
    threw = true
  }
  assert(threw, `rejects unsafe machineId: ${JSON.stringify(badId)}`)
}

const legacy = path.join(cwd, 'public', '/uploads/../../../.env'.replace(/^\//, ''))
assert(!isPathInsideUploads(legacy), 'legacy join escapes uploads root')

console.log('OK: machine image path safety checks passed')
