/**
 * Regression: production report daily default must use Thai reporting date
 * (08:00 cutoff), not host-local calendar today. Night shift after midnight
 * otherwise queries an empty reporting day.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function assert(cond, msg) {
  if (!cond) {
    console.error(msg)
    process.exit(1)
  }
}

const reportClient = readFileSync(
  join(root, 'app/(dashboard)/production/report/ReportClient.tsx'),
  'utf8',
)
const reportPage = readFileSync(
  join(root, 'app/(dashboard)/production/report/page.tsx'),
  'utf8',
)
const dayPicker = readFileSync(
  join(root, 'components/production/ReportDayPicker.tsx'),
  'utf8',
)

assert(
  !reportClient.includes("format(new Date(), 'yyyy-MM-dd')"),
  'ReportClient must not default the daily picker from host-local calendar today',
)
assert(
  reportClient.includes('getThaiReportingDateUTC') && reportClient.includes('defaultDate'),
  'ReportClient must initialize from Thai reporting date',
)
assert(
  reportPage.includes('getThaiReportingDateUTC') && reportPage.includes('defaultDate='),
  'Report page must pass Thai reporting date as defaultDate',
)
assert(
  dayPicker.includes('getThaiReportingDateUTC') && !dayPicker.includes('apply(new Date())'),
  'ReportDayPicker Today must emit Thai reporting date, not local new Date()',
)

console.log('ok: report daily default uses Thai reporting date')
