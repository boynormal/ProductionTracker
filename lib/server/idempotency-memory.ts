/**
 * In-memory idempotency for serverless-friendly single-instance / long-running Node.
 * เก็บ response 2xx ต่อ key ชั่วคราว — retry ด้วย key เดิมได้ body เดิมโดยไม่รัน side effect ซ้ำ
 */
type Entry = { expiresAt: number; status: number; body: unknown }

const TTL_MS = 48 * 60 * 60 * 1000
const MAX_ENTRIES = 5_000

const store = new Map<string, Entry>()

function nsKey(namespace: string, key: string): string {
  return `${namespace}:${key}`
}

function prune(): void {
  const now = Date.now()
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k)
  }
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value
    if (first === undefined) break
    store.delete(first)
  }
}

export function getIdempotentReplay(
  namespace: string,
  idempotencyKey: string,
): { status: number; body: unknown } | null {
  if (!idempotencyKey) return null
  prune()
  const e = store.get(nsKey(namespace, idempotencyKey))
  if (!e || e.expiresAt <= Date.now()) {
    if (e) store.delete(nsKey(namespace, idempotencyKey))
    return null
  }
  return { status: e.status, body: e.body }
}

/** เรียกหลัง response สำเร็จ (2xx) เท่านั้น */
export function setIdempotentSuccess(
  namespace: string,
  idempotencyKey: string,
  status: number,
  body: unknown,
): void {
  if (!idempotencyKey || status < 200 || status >= 300) return
  prune()
  const k = nsKey(namespace, idempotencyKey)
  if (store.size >= MAX_ENTRIES && !store.has(k)) {
    const first = store.keys().next().value
    if (first !== undefined) store.delete(first)
  }
  store.set(k, { expiresAt: Date.now() + TTL_MS, status, body })
}
