'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Factory, Loader2, QrCode, User, CheckCircle2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'

const pinSchema = z.object({
  employeeCode: z.string().min(1, 'กรุณากรอกรหัสพนักงาน'),
})

export default function ScanPage() {
  const { machineId } = useParams<{ machineId: string }>()
  const { t, locale }  = useI18n()
  const [machine, setMachine]   = useState<any>(null)
  const [operator, setOperator] = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [step, setStep]         = useState<'pin' | 'record'>('pin')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ employeeCode: string }>({
    resolver: zodResolver(pinSchema),
  })

  // โหลดข้อมูลเครื่อง
  useEffect(() => {
    fetch(`/api/scan/${machineId}`)
      .then(r => r.json())
      .then(d => { setMachine(d.data); setLoading(false) })
      .catch(() => { toast.error('ไม่พบข้อมูลเครื่องจักร'); setLoading(false) })
  }, [machineId])

  const onPinSubmit = async (data: { employeeCode: string }) => {
    const res = await fetch('/api/auth/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeCode: data.employeeCode }),
    })
    const json = await res.json()
    if (!res.ok) { toast.error(json.error ?? 'ไม่พบรหัสพนักงาน'); return }
    setOperator(json.data)
    setStep('record')
    toast.success(`ยินดีต้อนรับ ${json.data.firstName} ${json.data.lastName}`)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    )
  }

  if (!machine) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <QrCode size={48} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">ไม่พบข้อมูลเครื่องจักร</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4">
      <div className="mx-auto max-w-md">
        {/* Machine Info Card */}
        <div className="mb-4 rounded-2xl bg-blue-600 p-5 text-white shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Factory size={18} />
                <span className="text-xs font-medium text-blue-200">{machine.line?.lineName}</span>
              </div>
              <h1 className="text-2xl font-bold">{machine.mcNo}</h1>
              <p className="text-blue-200 text-sm mt-0.5">{machine.mcName}</p>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-medium">
              {machine.process ?? machine.mcType ?? 'CNC'}
            </div>
          </div>
        </div>

        {/* Step: PIN */}
        {step === 'pin' && (
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-full bg-blue-100 p-2">
                <User size={20} className="text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-800">กรอกรหัสพนักงาน</h2>
                <p className="text-xs text-slate-500">Enter Employee Code</p>
              </div>
            </div>

            <form onSubmit={handleSubmit(onPinSubmit)} className="space-y-4">
              <div>
                <input
                  {...register('employeeCode')}
                  placeholder="เช่น 1-68176"
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-lg font-mono tracking-widest outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  autoFocus
                />
                {errors.employeeCode && (
                  <p className="mt-1 text-center text-xs text-red-500">{errors.employeeCode.message}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'ยืนยัน / Confirm'}
              </button>
            </form>
          </div>
        )}

        {/* Step: Record */}
        {step === 'record' && operator && (
          <div className="space-y-4">
            {/* Operator info */}
            <div className="rounded-2xl bg-green-50 border border-green-200 p-4 flex items-center gap-3">
              <CheckCircle2 size={20} className="text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">
                  {operator.firstName} {operator.lastName}
                </p>
                <p className="text-xs text-green-600">{operator.employeeCode} · {operator.role}</p>
              </div>
            </div>

            {/* Part Selection */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
              <h2 className="mb-4 font-semibold text-slate-800">เลือก Part ที่ผลิต</h2>

              {machine.partTargets?.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-4">ไม่มี Part ที่กำหนดไว้</p>
              ) : (
                <div className="space-y-2">
                  {machine.partTargets?.map((pt: any) => (
                    <a
                      key={pt.id}
                      href={`/production/record?machineId=${machine.id}&partTargetId=${pt.id}`}
                      className="block rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-800">{pt.part.partName}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            SAMCO: {pt.part.partSamco} · {pt.part.partNo}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-blue-600">{pt.piecesPerHour}</p>
                          <p className="text-xs text-slate-400">pcs/hr</p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
