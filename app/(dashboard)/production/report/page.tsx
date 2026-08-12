import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ReportClient } from './ReportLoader'

/** รายงานการผลิตใช้เฉพาะฝ่าย/ส่วนในกลุ่มรหัส 22-xxx */
const REPORT_ORG_CODE_PREFIX = '22'

export default async function ReportPage() {
  await auth()

  const [divisions, sections] = await Promise.all([
    prisma.division.findMany({
      where: {
        isActive: true,
        divisionCode: { startsWith: REPORT_ORG_CODE_PREFIX },
      },
      select: { id: true, divisionCode: true, divisionName: true, departmentId: true },
      orderBy: { divisionCode: 'asc' },
    }),
    prisma.section.findMany({
      where: {
        isActive: true,
        sectionCode: { startsWith: REPORT_ORG_CODE_PREFIX },
      },
      select: { id: true, sectionCode: true, sectionName: true, divisionId: true },
      orderBy: { sectionCode: 'asc' },
    }),
  ])

  return (
    <ReportClient
      divisions={JSON.parse(JSON.stringify(divisions))}
      sections={JSON.parse(JSON.stringify(sections))}
    />
  )
}
