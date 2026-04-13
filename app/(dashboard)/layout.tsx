import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getOperatorIdFromCookies } from '@/lib/operator-auth'
import { ScanOperatorBar } from '@/components/layout/ScanOperatorBar'
import { DashboardShell } from '@/components/layout/DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const allowLineQr = (await headers()).get('x-allow-record-line-qr') === '1'

  if (session) {
    return (
      <DashboardShell userName={session.user.name ?? undefined} userRole={session.user.role ?? undefined}>
        {children}
      </DashboardShell>
    )
  }

  const scanOperatorId = await getOperatorIdFromCookies()

  if (scanOperatorId) {
    const scanUser = await prisma.user.findUnique({
      where: { id: scanOperatorId },
      select: { firstName: true, lastName: true, employeeCode: true, isActive: true },
    })
    if (!scanUser?.isActive) redirect('/login')

    const displayName = `${scanUser.firstName} ${scanUser.lastName}`

    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <ScanOperatorBar displayName={displayName} employeeCode={scanUser.employeeCode} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    )
  }

  /** QR สาย: ยังไม่มี cookie — เปิดหน้ากรอกรหัสพนักงาน (ไม่ redirect /login) */
  if (allowLineQr) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    )
  }

  redirect('/login')
}
