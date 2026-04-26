/**
 * คลาสตารางแดชบอร์ด — หัวตารางยึดด้วย `<thead className={DASHBOARD_THEAD_STICKY}>` เมื่อเลื่อนใน <main> (DashboardShell)
 * หรือในกล่องที่มี overflow-auto (เช่น Logs)
 *
 * สีหัวคอลัมน์: bg-slate-100 + text-slate-700 + font-semibold
 */

export const DASHBOARD_TABLE_WRAP =
  'w-full min-w-0 rounded-lg shadow-sm ring-1 ring-slate-200/80'

/** ตารางกว้าง (ประวัติ / รายงานเมทริกซ์) */
export const DASHBOARD_TABLE_WIDE = 'w-full min-w-[72rem] border-separate border-spacing-0 bg-white text-sm'

/** ตารางรายงาน SimpleTable */
export const DASHBOARD_TABLE_REPORT = 'w-full min-w-[520px] border-separate border-spacing-0 bg-white text-sm'

/** ตารางทั่วไป (CRUD, MTBF, dashboard) */
export const DASHBOARD_TABLE_BASE = 'w-full border-separate border-spacing-0 bg-white text-sm'

/** ใส่ที่ <thead> — ยึดทั้งแถวหัวเมื่อเลื่อนแนวตั้ง */
export const DASHBOARD_THEAD_STICKY = 'sticky top-0 z-20'

/** หัวตารางในกล่องเลื่อนแยก (ซ้อนเหนือแถวข้อมูลใน scrollport เดียวกัน) */
export const DASHBOARD_THEAD_STICKY_ELEVATED = 'sticky top-0 z-30'

/** ประวัติการผลิต — ช่องคอมแพ็ก */
export const DASHBOARD_TH_STICKY_SOLID =
  'border border-slate-200 bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700 shadow-[0_1px_0_0_rgb(226_232_240)]'

/** รายงาน SimpleTable — คอมแพ็ก + กันหัวคอลัมน์ตัดบรรทัด */
export const DASHBOARD_TH_STICKY_SOFT =
  'whitespace-nowrap border border-slate-200 bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700 shadow-[0_1px_0_0_rgb(226_232_240)]'

/** CRUD / MTBF / แดชบอร์ด / แอดมิน — ช่องกว้าง */
export const DASHBOARD_TH_STICKY_SOFT_COMFORTABLE =
  'border border-slate-200 bg-slate-100 px-4 py-3 text-left text-xs font-semibold text-slate-700 shadow-[0_1px_0_0_rgb(226_232_240)]'

/** พื้นหัวคอลัมน์ในเมทริกซ์รายงาน (ต่อกับ border ซ้าย/ล่างแยกตามคอลัมน์) */
export const DASHBOARD_MATRIX_TH_HEAD =
  'border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]'
