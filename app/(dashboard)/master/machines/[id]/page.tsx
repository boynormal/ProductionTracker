import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import Link from 'next/link'
import { MachineDetailEditor, type MachineImageRow } from './MachineDetailEditor'
import { MachineImageBanner } from './MachineImageBanner'
import { MachinePartTargetsManager, type PartTargetRow, type PartOption } from './MachinePartTargetsManager'
import {
  ArrowLeft,
  Cpu,
  Wrench,
  Star,
  Zap,
  MapPin,
  Calendar,
  Weight,
  Ruler,
  Settings,
  User,
  ClipboardList,
} from 'lucide-react'

export default async function MachineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  const canEditMaster = ['ADMIN', 'ENGINEER'].includes(session?.user?.role ?? '')

  const [machine, lines, partsForTargets] = await Promise.all([
    prisma.machine.findUnique({
      where: { id },
      include: {
        line: { select: { lineCode: true, lineName: true } },
        partTargets: {
          include: { part: { include: { customer: true } } },
          orderBy: { part: { partSamco: 'asc' } },
        },
        images: {
          orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
          take: 5,
        },
      },
    }),
    prisma.line.findMany({
      where: { isActive: true },
      orderBy: { lineCode: 'asc' },
      select: { id: true, lineCode: true, lineName: true },
    }),
    prisma.part.findMany({
      where: { isActive: true },
      select: {
        id: true,
        partSamco: true,
        partName: true,
        customer: { select: { customerCode: true } },
      },
      orderBy: { partSamco: 'asc' },
    }),
  ])

  if (!machine) notFound()

  const linesJson = JSON.parse(JSON.stringify(lines)) as { id: string; lineCode: string; lineName: string }[]
  const machineJson = JSON.parse(JSON.stringify(machine)) as Record<string, unknown> & {
    id: string
    mcNo: string
    mcName: string
    lineId: string
  }
  const initialImages = JSON.parse(JSON.stringify(machine.images ?? [])) as MachineImageRow[]
  const partTargetsAll = JSON.parse(JSON.stringify(machine.partTargets ?? [])) as PartTargetRow[]
  const partsForTargetsJson = JSON.parse(JSON.stringify(partsForTargets)) as PartOption[]
  const activePartTargets = machine.partTargets.filter((pt) => pt.isActive)

  const isPmDue =
    machine.nextMaintenanceDate && machine.nextMaintenanceDate <= new Date()

  const conditionLabels: Record<number, { label: string; color: string }> = {
    1: { label: 'Poor', color: 'text-red-600 bg-red-50' },
    2: { label: 'Fair', color: 'text-orange-600 bg-orange-50' },
    3: { label: 'Good', color: 'text-yellow-600 bg-yellow-50' },
    4: { label: 'Very Good', color: 'text-green-600 bg-green-50' },
    5: { label: 'Excellent', color: 'text-emerald-600 bg-emerald-50' },
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        href="/master/machines"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft size={16} />
        กลับไปรายการเครื่องจักร
      </Link>

      {/* Header */}
      <div className="rounded-xl bg-white border border-slate-100 shadow-sm overflow-hidden">
        {/* Image banner */}
        {machine.images.length > 0 ? (
          <MachineImageBanner
            images={machine.images.map((img) => ({
              id: img.id,
              url: img.url,
              caption: img.caption,
            }))}
            machineName={machine.mcName}
          />
        ) : (
          <div className="h-32 bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center">
            <Cpu size={48} className="text-blue-200" />
          </div>
        )}

        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-800">
                  {machine.mcNo}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    machine.isActive
                      ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                      : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
                  }`}
                >
                  {machine.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{machine.mcName}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {machine.line && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700">
                    {machine.line.lineCode} — {machine.line.lineName}
                  </span>
                )}
                {machine.process && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-slate-600">
                    <Settings size={10} /> {machine.process}
                  </span>
                )}
                {machine.brand && (
                  <span className="rounded-md bg-slate-50 px-2 py-1 text-slate-600">
                    {machine.brand}
                    {machine.modelNo ? ` ${machine.modelNo}` : ''}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              {canEditMaster ? (
                <MachineDetailEditor
                  machineId={machine.id}
                  lines={linesJson}
                  initialMachine={machineJson}
                  initialImages={initialImages}
                />
              ) : null}
              {machine.conditionRating != null && (
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-bold ${
                      conditionLabels[machine.conditionRating]?.color ??
                      'text-slate-500 bg-slate-50'
                    }`}
                  >
                    <Star size={14} fill="currentColor" />
                    {machine.conditionRating}/5
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {conditionLabels[machine.conditionRating]?.label ?? '—'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <div className="rounded-xl bg-white border border-slate-100 shadow-sm p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-blue-700 mb-4">
          <ClipboardList size={16} />
          ข้อมูลเครื่องจักร
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
          <InfoField label="ประเภท (Type)" value={machine.mcType} />
          <InfoField label="แผนก (Dept.)" value={machine.department} />
          <InfoField label="กระบวนการ (Process)" value={machine.process} />
          <InfoField label="Asset Code" value={machine.assetCode} />
          <InfoField label="Serial No." value={machine.serialNo} />
          <InfoField label="Brand" value={machine.brand} />
          <InfoField label="Model" value={machine.modelNo} />
          <InfoField
            label="ปีผลิต (Year)"
            value={machine.manufacturerYear?.toString()}
          />
          <InfoField label="Location" value={machine.location} icon={<MapPin size={12} />} />
          <InfoField
            label="กำลังไฟ (Power)"
            value={machine.powerKW != null ? `${machine.powerKW} kW` : null}
            icon={<Zap size={12} />}
          />
          <InfoField
            label="น้ำหนัก (Weight)"
            value={machine.weightKg != null ? `${machine.weightKg} kg` : null}
            icon={<Weight size={12} />}
          />
          <InfoField
            label="ขนาด (Dimensions)"
            value={machine.dimensions}
            icon={<Ruler size={12} />}
          />
          <InfoField label="Voltage" value={machine.voltage} />
          <InfoField label="Frequency" value={machine.frequency} />
          <InfoField
            label="วันที่ติดตั้ง (Install)"
            value={
              machine.installDate
                ? format(machine.installDate, 'd MMM yyyy')
                : null
            }
          />
          <InfoField
            label="วันที่ซื้อ (Purchase)"
            value={
              machine.purchaseDate
                ? format(machine.purchaseDate, 'd MMM yyyy')
                : null
            }
          />
        </div>
        {machine.remark && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <span className="text-xs font-medium text-slate-400">Remark</span>
            <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
              {machine.remark}
            </p>
          </div>
        )}
      </div>

      {/* PM Section */}
      <div className="rounded-xl bg-white border border-slate-100 shadow-sm p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-blue-700 mb-4">
          <Wrench size={16} />
          การบำรุงรักษา (Preventive Maintenance)
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 mb-5">
          <InfoField
            label="รอบ PM (Interval)"
            value={
              machine.maintenanceIntervalDays != null
                ? `${machine.maintenanceIntervalDays} วัน`
                : null
            }
          />
          <InfoField
            label="PM ล่าสุด (Last)"
            value={
              machine.lastMaintenanceDate
                ? format(machine.lastMaintenanceDate, 'd MMM yyyy')
                : null
            }
            icon={<Calendar size={12} />}
          />
          <div>
            <span className="text-[11px] font-medium text-slate-400">
              PM ครั้งถัดไป (Next)
            </span>
            <p
              className={`mt-0.5 text-sm font-semibold ${
                isPmDue ? 'text-red-600' : 'text-slate-700'
              }`}
            >
              {machine.nextMaintenanceDate
                ? format(machine.nextMaintenanceDate, 'd MMM yyyy')
                : '—'}
              {isPmDue && ' ⚠️ เกินกำหนด'}
            </p>
          </div>
          <InfoField
            label="ผู้รับผิดชอบ (Person)"
            value={machine.responsiblePerson}
            icon={<User size={12} />}
          />
        </div>

        {(machine.pmGeneralNote || machine.pmMajorNote) && (
          <div className="grid md:grid-cols-2 gap-4">
            {machine.pmGeneralNote && (
              <div className="rounded-lg bg-blue-50/50 border border-blue-100 p-3">
                <span className="text-xs font-semibold text-blue-600">
                  PM General Note
                </span>
                <pre className="mt-1.5 text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {machine.pmGeneralNote}
                </pre>
              </div>
            )}
            {machine.pmMajorNote && (
              <div className="rounded-lg bg-amber-50/50 border border-amber-100 p-3">
                <span className="text-xs font-semibold text-amber-600">
                  PM Major Note
                </span>
                <pre className="mt-1.5 text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {machine.pmMajorNote}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Part Targets */}
      <div className="rounded-xl bg-white border border-slate-100 shadow-sm p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-blue-700">
            <Cpu size={16} />
            Part ที่ผลิตได้ ({activePartTargets.length})
          </h2>
          {canEditMaster ? (
            <MachinePartTargetsManager
              machineId={machine.id}
              machineLabel={machine.mcNo}
              initialTargets={partTargetsAll}
              parts={partsForTargetsJson}
            />
          ) : null}
        </div>

        {activePartTargets.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            ไม่มี Part ที่ active
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  <th className="px-5 py-2">Part Samco</th>
                  <th className="px-3 py-2">Part Name</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2 text-right">Cycle (min)</th>
                  <th className="px-3 py-2 text-right">pcs/hr</th>
                  <th className="px-3 py-2 text-right">Target 8hr</th>
                  <th className="px-3 py-2 text-right">Target 11hr</th>
                  <th className="px-3 py-2 text-right">Eff %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {activePartTargets.map((pt) => (
                  <tr
                    key={pt.id}
                    className="hover:bg-blue-50/40 transition-colors"
                  >
                    <td className="px-5 py-2.5 font-mono font-bold text-blue-700">
                      {pt.part.partSamco}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">
                      {pt.part.partName}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {pt.part.customer?.customerCode ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                      {pt.cycleTimeMin.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-800">
                      {pt.piecesPerHour}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                      {pt.target8Hr.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                      {pt.target11Hr.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">
                      {(pt.efficiency * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Helper ─── */

function InfoField({
  label,
  value,
  icon,
}: {
  label: string
  value: string | null | undefined
  icon?: React.ReactNode
}) {
  return (
    <div>
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
      <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-slate-700">
        {icon && <span className="text-slate-400">{icon}</span>}
        {value ?? '—'}
      </p>
    </div>
  )
}
