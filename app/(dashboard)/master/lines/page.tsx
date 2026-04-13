import { prisma } from '@/lib/prisma'
import { canonicalDivisionName } from '@/lib/org-display'
import { sectionWhereMasterList } from '@/lib/org-filters'
import { LinesCrudWrapper } from './LinesCrudWrapper'
import type { Column, Field } from '@/components/master/CrudPage'

export default async function LinesPage() {
  const [linesRaw, sectionsFull, divisions] = await Promise.all([
    prisma.line.findMany({
      where: { isActive: true },
      include: {
        section: {
          include: {
            division: { select: { id: true, divisionName: true } },
          },
        },
        _count: { select: { machines: true } },
      },
      orderBy: { lineCode: 'asc' },
    }),
    prisma.section.findMany({
      where: {
        isActive: true,
        ...sectionWhereMasterList,
      },
      select: {
        id: true,
        sectionCode: true,
        sectionName: true,
        divisionId: true,
      },
      orderBy: { sectionCode: 'asc' },
    }),
    prisma.division.findMany({
      where: { isActive: true },
      orderBy: { divisionCode: 'asc' },
      select: { id: true, divisionCode: true, divisionName: true },
    }),
  ])

  /** ชื่อฝ่าย — Section → Division (เดียวกับ master/departments) + canonical ชื่อที่นำเข้าผิด */
  const lines = linesRaw.map((line) => {
    const row = JSON.parse(JSON.stringify(line)) as (typeof line) & { division_name: string | null }
    row.division_name = canonicalDivisionName(line.section?.division?.divisionName) ?? null
    return row
  })

  const columns: Column[] = [
    { key: 'lineCode', label: 'รหัส', labelEn: 'Code' },
    { key: 'lineName', label: 'ชื่อ', labelEn: 'Name' },
    { key: 'description', label: 'หมายเหตุ', labelEn: 'Remark' },
    { key: 'division_name', label: 'ชื่อฝ่าย', labelEn: 'Division name' },
    { key: 'section.sectionName', label: 'Section', labelEn: 'Section' },
    { key: '_count.machines', label: 'เครื่อง', labelEn: 'Machines' },
    { key: '_partTargetsLink', label: 'เป้าตามสาย', labelEn: 'Line targets' },
  ]

  const fields: Field[] = [
    { key: 'lineCode', label: 'รหัสสาย', labelEn: 'Line Code', type: 'text', required: true },
    { key: 'lineName', label: 'ชื่อสาย', labelEn: 'Line Name', type: 'text', required: true },
    {
      key: 'sectionId',
      label: 'Section',
      labelEn: 'Section',
      type: 'select',
      options: sectionsFull.map((s) => ({
        value: s.id,
        label: `${s.sectionCode} — ${s.sectionName}`,
      })),
    },
    { key: 'description', label: 'คำอธิบาย', labelEn: 'Description', type: 'text' },
  ]

  return (
    <LinesCrudWrapper
      lines={JSON.parse(JSON.stringify(lines))}
      divisions={JSON.parse(JSON.stringify(divisions))}
      sections={JSON.parse(JSON.stringify(sectionsFull))}
      title="สายการผลิต"
      titleEn="Production Lines"
      columns={columns}
      apiEndpoint="/api/master/lines"
      fields={fields}
    />
  )
}
