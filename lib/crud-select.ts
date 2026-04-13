/** ต้องตรงกับ components/master/CrudPage — Radix ห้าม value="" */
export const CRUD_SELECT_NONE = '__none__'

export function sanitizeCrudSelectIds(body: Record<string, unknown>): Record<string, unknown> {
  const b = { ...body }
  for (const k of Object.keys(b)) {
    const v = b[k]
    if (v === CRUD_SELECT_NONE || v === '') b[k] = null
  }
  return b
}
