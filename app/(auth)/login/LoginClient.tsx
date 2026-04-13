'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Factory, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'

const schema = z.object({
  employeeCode: z.string().min(1, 'กรุณากรอกรหัสพนักงาน'),
  password:     z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
})
type FormData = z.infer<typeof schema>

export function LoginClient() {
  const router   = useRouter()
  const { t }    = useI18n()
  const [showPw, setShowPw] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    const res = await signIn('credentials', {
      employeeCode: data.employeeCode,
      password:     data.password,
      redirect:     false,
    })
    if (res?.ok) {
      router.push('/')
      router.refresh()
    } else {
      toast.error('รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 p-4">
      <div className="w-full max-w-sm">
        {/* Logo Card */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur mb-4">
            <Factory size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Production Tracker</h1>
          <p className="mt-1 text-sm text-blue-200">ระบบติดตามการผลิต</p>
        </div>

        {/* Form Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <h2 className="mb-6 text-center text-lg font-semibold text-slate-800">{t('login')}</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Employee Code */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('employeeCode')}
              </label>
              <input
                {...register('employeeCode')}
                placeholder="เช่น ADMIN001 หรือ 1-68176"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              {errors.employeeCode && (
                <p className="mt-1 text-xs text-red-500">{errors.employeeCode.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                {t('password')}
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {t('login')}
            </button>
          </form>

          {/* Demo hint */}
          <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <p className="font-medium text-slate-600 mb-1">Demo Account:</p>
            <p>Admin: <span className="font-mono">ADMIN001</span> / <span className="font-mono">admin1234</span></p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-blue-300">
          Production Tracker v1.0.0
        </p>
      </div>
    </div>
  )
}
