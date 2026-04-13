import { prisma } from '@/lib/prisma'
import { CrudPage } from '@/components/master/CrudPage'

export default async function ProblemsPage() {
  const problems = await prisma.problemCategory.findMany({
    where: { isActive: true },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
  })

  return (
    <CrudPage
      title="หมวดปัญหา"
      titleEn="Problem Categories"
      columns={[
        { key: 'code', label: 'รหัส', labelEn: 'Code' },
        { key: 'name', label: 'ชื่อ', labelEn: 'Name' },
        { key: 'type', label: 'ประเภท', labelEn: 'Type' },
        { key: 'description', label: 'หมายเหตุ', labelEn: 'Remark' },
      ]}
      data={JSON.parse(JSON.stringify(problems))}
      apiEndpoint="/api/master/problem-categories"
      fields={[
        { key: 'code', label: 'รหัส', labelEn: 'Code', type: 'text', required: true },
        { key: 'name', label: 'ชื่อ', labelEn: 'Name', type: 'text', required: true },
        { key: 'type', label: 'ประเภท', labelEn: 'Type', type: 'select', required: true,
          options: [{ value: 'BREAKDOWN', label: 'Breakdown' }, { value: 'NG', label: 'NG' }] },
        { key: 'description', label: 'คำอธิบาย', labelEn: 'Description', type: 'text' },
      ]}
    />
  )
}
