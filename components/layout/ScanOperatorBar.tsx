'use client'

import { LogOut } from 'lucide-react'

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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{displayName}</p>
        <p className="truncate text-xs text-slate-500">{employeeCode} · โหมดสแกน QR</p>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <LogOut size={14} />
        ออก
      </button>
    </header>
  )
}
