'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCircle2, Layers, MessageSquareText, Radio, SlidersHorizontal, X } from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils/cn'
import { useI18n } from '@/lib/i18n'
import type { AlertItem } from './page'

type Props = {
  items: AlertItem[]
  role: string
  scopedDivisionId: string | null
}

type ChannelFilter = 'all' | 'in_app' | 'telegram'
type StatusFilter = 'all' | 'unread' | 'read' | 'sent' | 'failed' | 'skipped'

const channelLabels: Record<ChannelFilter, { th: string; en: string }> = {
  all: { th: 'ทั้งหมด', en: 'All' },
  in_app: { th: 'ในระบบ', en: 'In-app' },
  telegram: { th: 'Telegram', en: 'Telegram' },
}

const statusLabels: Record<StatusFilter, { th: string; en: string }> = {
  all: { th: 'ทั้งหมด', en: 'All' },
  unread: { th: 'ยังไม่อ่าน', en: 'Unread' },
  read: { th: 'อ่านแล้ว', en: 'Read' },
  sent: { th: 'ส่งแล้ว', en: 'Sent' },
  failed: { th: 'ล้มเหลว', en: 'Failed' },
  skipped: { th: 'ข้าม', en: 'Skipped' },
}

function formatAlertTime(iso: string, locale: string): string {
  const d = new Date(iso)
  const dateStr = format(d, 'd MMM', { locale: locale === 'th' ? th : undefined })
  const timeStr = d.toLocaleTimeString(locale === 'th' ? 'th-TH' : 'en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  return `${dateStr} ${timeStr}`
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline' {
  if (status === 'unread' || status === 'sent') return 'success'
  if (status === 'failed') return 'destructive'
  if (status === 'skipped') return 'warning'
  if (status === 'read') return 'secondary'
  return 'outline'
}

function channelVariant(channel: ChannelFilter | 'in_app' | 'telegram'): 'default' | 'secondary' | 'outline' {
  if (channel === 'telegram') return 'default'
  if (channel === 'in_app') return 'secondary'
  return 'outline'
}

function prettyText(value: string | null | undefined): string {
  if (!value) return '—'
  return value.replaceAll('_', ' ')
}

function alertPriority(item: AlertItem): number {
  if (item.channel === 'telegram' && item.status === 'failed') return 0
  if (item.channel === 'telegram' && item.status === 'skipped') return 1
  if (item.status === 'unread') return 2
  if (item.channel === 'in_app' && item.status === 'read') return 3
  if (item.channel === 'telegram' && item.status === 'sent') return 4
  return 5
}

export function AlertsClient({ items, role, scopedDivisionId }: Props) {
  const { locale } = useI18n()
  const router = useRouter()
  const [selectedDivision, setSelectedDivision] = useState<string>(scopedDivisionId ?? 'all')
  const [channel, setChannel] = useState<ChannelFilter>('all')
  const [status, setStatus] = useState<StatusFilter>('all')

  useEffect(() => {
    const timer = window.setInterval(() => {
      router.refresh()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [router])

  const baseFilteredItems = useMemo(() => {
    return items.filter((item) => {
      if (channel !== 'all' && item.channel !== channel) return false
      if (status !== 'all' && item.status !== status) return false
      return true
    })
  }, [items, channel, status])

  const divisions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; unread: number; total: number }>()
    for (const item of baseFilteredItems) {
      const id = item.divisionId ?? 'unassigned'
      const prev = map.get(id) ?? { id, name: item.divisionName, unread: 0, total: 0 }
      prev.total += 1
      if (item.status === 'unread') prev.unread += 1
      map.set(id, prev)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [baseFilteredItems])

  const filteredItems = useMemo(() => {
    return baseFilteredItems.filter((item) => {
      if (selectedDivision !== 'all' && (item.divisionId ?? 'unassigned') !== selectedDivision) return false
      return true
    })
  }, [baseFilteredItems, selectedDivision])

  const groupedItems = useMemo(() => {
    const map = new Map<string, AlertItem[]>()
    for (const item of filteredItems) {
      const key = item.divisionId ?? 'unassigned'
      const prev = map.get(key) ?? []
      prev.push(item)
      map.set(key, prev)
    }
    for (const [key, value] of map.entries()) {
      map.set(
        key,
        [...value].sort((a, b) => {
          const priorityDiff = alertPriority(a) - alertPriority(b)
          if (priorityDiff !== 0) return priorityDiff
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        }),
      )
    }
    return map
  }, [filteredItems])

  const divisionSummary = divisions.find((d) => d.id === selectedDivision)
  const pageTitle = locale === 'th' ? 'การแจ้งเตือน' : 'Alerts'
  const subTitle = locale === 'th'
    ? 'รวมการแจ้งเตือนในระบบและผลการส่ง Telegram โดยแยกตามฝ่าย'
    : 'Combined in-app notifications and Telegram delivery logs grouped by division'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-slate-800">
            <Bell size={22} className="text-blue-600" />
            <h1 className="text-xl font-bold">{pageTitle}</h1>
            <Badge variant="outline">{role}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{subTitle}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <div className="text-xs text-slate-500">{locale === 'th' ? 'ทั้งหมด' : 'Total'}</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{items.length}</div>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <div className="text-xs text-slate-500">{locale === 'th' ? 'ยังไม่อ่าน' : 'Unread'}</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{items.filter((item) => item.status === 'unread').length}</div>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <div className="text-xs text-slate-500">Telegram</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{items.filter((item) => item.channel === 'telegram').length}</div>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <div className="text-xs text-slate-500">{locale === 'th' ? 'ฝ่าย' : 'Divisions'}</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{divisions.length}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <SlidersHorizontal size={18} className="shrink-0 text-blue-600" />
                {locale === 'th' ? 'กรองรายการ' : 'Refine list'}
              </div>
              {(channel !== 'all' || status !== 'all') && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1 px-2 text-xs text-slate-600"
                  onClick={() => {
                    setChannel('all')
                    setStatus('all')
                  }}
                >
                  <X size={14} />
                  {locale === 'th' ? 'ล้าง' : 'Clear'}
                </Button>
              )}
            </div>

            <p className="mb-4 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
              {locale === 'th'
                ? 'ค่าเริ่มต้นแสดงทุกรายการที่โหลดมา ไม่จำเป็นต้องกรอง — ปรับแหล่งที่มา สถานะ หรือฝ่ายเมื่อต้องการเท่านั้น'
                : 'By default you see every item loaded for this page. Filtering is optional — use source, status, or division when you want a shorter list.'}
            </p>

            <p className="mb-2 text-xs font-medium text-slate-500">
              {locale === 'th' ? 'แหล่งที่มา' : 'Source'}
            </p>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {(['all', 'in_app', 'telegram'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setChannel(value)}
                  className={cn(
                    'rounded-lg px-2 py-2 text-center text-xs font-medium transition-all sm:text-sm',
                    channel === value
                      ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {channelLabels[value][locale === 'th' ? 'th' : 'en']}
                </button>
              ))}
            </div>

            <p className="mb-2 mt-5 text-xs font-medium text-slate-500">
              {locale === 'th' ? 'สถานะ' : 'Status'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['all', 'unread', 'read', 'sent', 'failed', 'skipped'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-left text-xs font-medium transition-colors sm:text-sm',
                    status === value
                      ? 'border-blue-200 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  {statusLabels[value][locale === 'th' ? 'th' : 'en']}
                </button>
              ))}
            </div>

            <Separator className="my-5 bg-slate-200" />

            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
              <Layers size={14} className="text-slate-400" />
              {locale === 'th' ? 'ฝ่าย' : 'Division'}
            </div>
            <div className="max-h-[min(52vh,28rem)] space-y-1.5 overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => setSelectedDivision('all')}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                  selectedDivision === 'all'
                    ? 'border-blue-200 bg-blue-50 text-blue-800'
                    : 'border-transparent bg-slate-50 text-slate-700 hover:bg-slate-100',
                )}
              >
                <span className="min-w-0 truncate font-medium">{locale === 'th' ? 'ทุกฝ่าย' : 'All divisions'}</span>
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  {baseFilteredItems.length}
                </Badge>
              </button>
              {divisions.map((division) => (
                <button
                  key={division.id}
                  type="button"
                  onClick={() => setSelectedDivision(division.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                    selectedDivision === division.id
                      ? 'border-blue-200 bg-blue-50 text-blue-800'
                      : 'border-transparent bg-slate-50 text-slate-700 hover:bg-slate-100',
                  )}
                >
                  <span className="min-w-0 truncate font-medium">{division.name}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {division.unread > 0 && (
                      <Badge variant="destructive" className="tabular-nums">
                        {division.unread}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="tabular-nums">
                      {division.total}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  {selectedDivision === 'all'
                    ? (locale === 'th' ? 'ทุกฝ่าย' : 'All divisions')
                    : (divisionSummary?.name ?? 'Unassigned')}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {locale === 'th'
                    ? `พบ ${filteredItems.length} รายการตามเงื่อนไขที่เลือก`
                    : `${filteredItems.length} items match the current filters`}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Radio size={14} className="shrink-0" />
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  {channelLabels[channel][locale === 'th' ? 'th' : 'en']}
                </span>
                <span className="text-slate-300">|</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  {statusLabels[status][locale === 'th' ? 'th' : 'en']}
                </span>
              </div>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-20 text-center shadow-sm">
              <CheckCircle2 size={42} className="mx-auto mb-3 text-green-300" />
              <p className="text-sm text-slate-500">{locale === 'th' ? 'ไม่พบการแจ้งเตือนตามเงื่อนไขที่เลือก' : 'No alerts found for the selected filters'}</p>
            </div>
          ) : (
            Array.from(groupedItems.entries()).map(([divisionKey, divisionItems]) => (
              <div key={divisionKey} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-800">{divisionItems[0]?.divisionName ?? 'Unassigned'}</div>
                    <Badge variant="outline">{divisionItems.length}</Badge>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {divisionItems.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'px-5 py-4',
                        item.channel === 'telegram' && item.status === 'sent'
                          ? 'bg-slate-50/30 opacity-75'
                          : item.status === 'unread'
                            ? 'bg-white'
                            : 'bg-slate-50/50',
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant={channelVariant(item.channel)}>{item.channel === 'telegram' ? 'Telegram' : 'In-app'}</Badge>
                            <Badge variant={statusVariant(item.status)}>{prettyText(item.status)}</Badge>
                            <Badge variant="outline">{prettyText(item.alertType)}</Badge>
                            {item.route && <Badge variant="outline">{prettyText(item.route)}</Badge>}
                          </div>
                          <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.message}</p>
                          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                            <span>{locale === 'th' ? 'เวลา' : 'Time'}: {formatAlertTime(item.createdAt, locale)}</span>
                            {item.windowLabel && <span>{locale === 'th' ? 'ช่วงเวลา' : 'Window'}: {item.windowLabel}</span>}
                            {item.lineCode && <span>{locale === 'th' ? 'สาย' : 'Line'}: {item.lineCode}</span>}
                            {item.machineLabel && <span>{locale === 'th' ? 'เครื่อง' : 'Machine'}: {item.machineLabel}</span>}
                            {item.sentAt && <span>{locale === 'th' ? 'ส่งเมื่อ' : 'Sent at'}: {formatAlertTime(item.sentAt, locale)}</span>}
                          </div>
                          {item.channel === 'telegram' && item.status === 'sent' && (
                            <p className="mt-2 text-xs text-slate-400">
                              {locale === 'th'
                                ? 'รายการนี้เป็นประวัติการส่งสำเร็จ ไม่ใช่รายการที่ต้องติดตามทันที'
                                : 'This item is successful delivery history, not an immediate action item'}
                            </p>
                          )}
                          {item.channel === 'telegram' && (
                            <p className="mt-2 text-xs text-slate-400">
                              {locale === 'th' ? 'อัปเดตอัตโนมัติทุก 1 นาที' : 'Auto-refreshes every 1 minute'}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          {item.channel === 'telegram' ? <MessageSquareText size={18} /> : <Bell size={18} />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
