'use client'

import { LogOut } from 'lucide-react'
import { ManualGuideMenu } from '@/components/layout/ManualGuideMenu'

type Props = {
  displayName: string
  employeeCode: string
}

export function ScanOperatorBar({ displayName, employeeCode }: Props) {
  async function logout() {
    await fetch('/api/auth/pin', { method: 'DELETE' })
    window.location.href = '/login'
  }

  return (
    <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{displayName}</p>
        <p className="truncate text-xs text-slate-500">{employeeCode} · โหมดสแกน QR</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ManualGuideMenu variant="scan" />
        <button
          type="button"
          onClick={() => void logout()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <LogOut size={16} />
          ออก
        </button>
      </div>
    </header>
  )
}
