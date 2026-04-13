/**
 * คลาสหัวตารางแบบ sticky สำหรับแดชบอร์ด — อิง padding ของ <main> (p-4 / sm:p-6)
 * ห่อตารางด้วย wrap ที่ไม่มี overflow-x-auto; เลื่อนแนวนอนใน <main> (DashboardShell)
 */

export const DASHBOARD_TABLE_WRAP =
  'w-full min-w-0 rounded-lg shadow-sm ring-1 ring-slate-200/80'

/** ตารางกว้าง (ประวัติ / รายงานเมทริกซ์) */
export const DASHBOARD_TABLE_WIDE = 'w-full min-w-[72rem] border-separate border-spacing-0 bg-white text-sm'

/** ตารางรายงาน SimpleTable */
export const DASHBOARD_TABLE_REPORT = 'w-full min-w-[520px] border-separate border-spacing-0 bg-white text-sm'

/** ตารางทั่วไป (CRUD, MTBF, dashboard) */
export const DASHBOARD_TABLE_BASE = 'w-full border-separate border-spacing-0 bg-white text-sm'

/** หัวตารางโทนเข้ม — ประวัติการผลิต */
export const DASHBOARD_TH_STICKY_SOLID =
  'sticky top-[-1rem] sm:top-[-1.5rem] z-20 border border-slate-200 bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700 shadow-[0_1px_0_0_rgb(226_232_240)]'

/** หัวตารางโทนอ่อน — รายงาน SimpleTable */
export const DASHBOARD_TH_STICKY_SOFT =
  'sticky top-[-1rem] sm:top-[-1.5rem] z-20 whitespace-nowrap border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-600 shadow-[0_1px_0_0_rgb(241_245_249)]'

/** หัวตารางโทนอ่อน ช่องกว้าง — CRUD / MTBF / แดชบอร์ด */
export const DASHBOARD_TH_STICKY_SOFT_COMFORTABLE =
  'sticky top-[-1rem] sm:top-[-1.5rem] z-20 border border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-medium text-slate-500 shadow-[0_1px_0_0_rgb(241_245_249)]'

/** offset แนวบนสำหรับซ้อนกับ sticky แนวนอน (มุมเมทริกซ์รายงาน) */
export const DASHBOARD_STICKY_TOP_INSET = 'top-[-1rem] sm:top-[-1.5rem]'
