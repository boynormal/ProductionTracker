'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { useI18n } from '@/lib/i18n'
import { Bell, CheckCheck, Check, AlertTriangle, TrendingDown, XCircle, Wrench, Info, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { cn } from '@/lib/utils/cn'

// แปลงเวลาโดยใช้ timezone ของ browser (ป้องกัน server/client tz mismatch)
function formatNotifTime(iso: string, locale: string): string {
  const d = new Date(iso)
  const dateStr = format(d, 'd MMM', { locale: locale === 'th' ? th : undefined })
  const timeStr = d.toLocaleTimeString(locale === 'th' ? 'th-TH' : 'en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  return `${dateStr} ${timeStr}`
}

const typeMeta: Record<string, { icon: React.ReactNode; color: string }> = {
  MISSING_RECORD: { icon: <AlertTriangle size={16} />, color: 'bg-orange-100 text-orange-700' },
  LOW_PRODUCTION: { icon: <TrendingDown size={16} />, color: 'bg-yellow-100 text-yellow-700' },
  HIGH_NG:        { icon: <XCircle size={16} />, color: 'bg-red-100 text-red-700' },
  LONG_BREAKDOWN: { icon: <Wrench size={16} />, color: 'bg-red-100 text-red-700' },
  SYSTEM:         { icon: <Info size={16} />, color: 'bg-blue-100 text-blue-700' },
}

type NotificationsTitleKey = 'adminList' | 'alertsPage'

export function NotificationsClient({
  notifications: initial,
  titleKey = 'adminList',
}: {
  notifications: any[]
  /** adminList = หน้า Admin, alertsPage = หน้า Alerts แยกจาก Dashboard */
  titleKey?: NotificationsTitleKey
}) {
  const { locale } = useI18n()
  const [items, setItems] = useState(initial)

  const pageTitle =
    titleKey === 'alertsPage'
      ? (locale === 'th' ? 'การแจ้งเตือน' : 'Alerts')
      : (locale === 'th' ? 'การแจ้งเตือน' : 'Notifications')
  const [markingAll, setMarkingAll] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)

  const unreadIds = items.filter(n => !n.isRead).map(n => n.id)

  async function markRead(ids: string[]) {
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, isRead: true }),
    })
    if (!res.ok) throw new Error()
    setItems(prev => prev.map(n => ids.includes(n.id) ? { ...n, isRead: true } : n))
  }

  async function handleMarkAll() {
    if (unreadIds.length === 0) return
    setMarkingAll(true)
    try {
      await markRead(unreadIds)
      toast.success(locale === 'th' ? 'อ่านทั้งหมดแล้ว' : 'All marked as read')
    } catch {
      toast.error('Failed')
    } finally {
      setMarkingAll(false)
    }
  }

  async function handleMarkOne(id: string) {
    setMarkingId(id)
    try {
      await markRead([id])
    } catch {
      toast.error('Failed')
    } finally {
      setMarkingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Bell size={22} className="text-blue-600" />
          {pageTitle}
          {unreadIds.length > 0 && (
            <Badge variant="destructive" className="ml-1">{unreadIds.length}</Badge>
          )}
        </h1>
        {unreadIds.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAll} disabled={markingAll}>
            <CheckCheck size={16} className="mr-1" />
            {markingAll
              ? (locale === 'th' ? 'กำลังอ่าน...' : 'Marking...')
              : (locale === 'th' ? 'อ่านทั้งหมด' : 'Mark all read')}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl bg-white border border-slate-100 py-16 text-center">
          <CheckCircle2 size={40} className="mx-auto mb-3 text-green-300" />
          <p className="text-sm text-slate-400">{locale === 'th' ? 'ไม่มีการแจ้งเตือน' : 'No notifications'}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-100 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {items.map(n => {
            const meta = typeMeta[n.type] ?? typeMeta.SYSTEM
            return (
              <div key={n.id} className={cn(
                'flex items-start gap-3 px-5 py-3.5 transition-colors',
                n.isRead ? 'bg-slate-50' : 'bg-white',
              )}>
                <div className="mt-0.5 flex-shrink-0">{meta.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge className={cn('text-[10px]', meta.color)}>{n.type.replace('_', ' ')}</Badge>
                    {!n.isRead && <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />}
                  </div>
                  <p className="text-sm font-medium text-slate-800 mt-1">{n.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className="text-xs text-slate-400">
                    {formatNotifTime(n.createdAt, locale)}
                  </span>
                  {!n.isRead && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                      onClick={() => handleMarkOne(n.id)} disabled={markingId === n.id}>
                      <Check size={14} className="mr-1" />
                      {locale === 'th' ? 'อ่านแล้ว' : 'Read'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
