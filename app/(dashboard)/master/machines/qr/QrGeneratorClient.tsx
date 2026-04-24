'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import QRCode from 'qrcode'
import { QRCodeSVG } from 'qrcode.react'
import { QrCode, Download, Loader2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

interface Line {
  id: string
  lineCode: string
  lineName: string
  activeLineTargetCount: number
  qrReady: boolean
  section: {
    id: string
    sectionCode: string
    sectionName: string
    division: { id: string; divisionCode: string; divisionName: string }
  } | null
}

interface Props {
  lines: Line[]
}

async function buildLineRecordQrCanvas(line: Line, baseUrl: string, loc: string): Promise<HTMLCanvasElement> {
  const url = `${baseUrl}/production/record?lineId=${encodeURIComponent(line.id)}`
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 320,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  })

  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 480
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 400, 480)

  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = qrDataUrl
  })
  ctx.drawImage(img, 40, 20, 320, 320)

  ctx.fillStyle = '#000000'
  ctx.font = 'bold 22px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(loc === 'th' ? 'บันทึกการผลิต (ไลน์ผลิต)' : 'Production record (line)', 200, 380)
  ctx.font = 'bold 26px sans-serif'
  ctx.fillText(line.lineCode, 200, 420)
  ctx.font = '16px sans-serif'
  ctx.fillStyle = '#475569'
  ctx.fillText(line.lineName, 200, 450)

  return canvas
}

function triggerCanvasDownload(canvas: HTMLCanvasElement, lineCode: string) {
  const link = document.createElement('a')
  const safe = lineCode.replace(/[^a-zA-Z0-9_-]/g, '_')
  link.download = `QR_LineRecord_${safe}.png`
  link.href = canvas.toDataURL('image/png')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function QrGeneratorClient({ lines }: Props) {
  const { locale } = useI18n()
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([])
  const [lineQrDownloading, setLineQrDownloading] = useState(false)
  const [filterDivisionId, setFilterDivisionId] = useState('')
  const [filterSectionId, setFilterSectionId] = useState('')

  const baseUrl =
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_BASE_URL || window.location.origin
      : ''

  const divisionOptions = useMemo(() => {
    const map = new Map<string, { id: string; divisionCode: string; divisionName: string }>()
    for (const l of lines) {
      const d = l.section?.division
      if (d) map.set(d.id, d)
    }
    return [...map.values()].sort((a, b) => a.divisionCode.localeCompare(b.divisionCode))
  }, [lines])

  const sectionOptions = useMemo(() => {
    const map = new Map<string, { id: string; sectionCode: string; sectionName: string }>()
    for (const l of lines) {
      const s = l.section
      if (!s) continue
      if (filterDivisionId && s.division.id !== filterDivisionId) continue
      map.set(s.id, { id: s.id, sectionCode: s.sectionCode, sectionName: s.sectionName })
    }
    return [...map.values()].sort((a, b) => a.sectionCode.localeCompare(b.sectionCode))
  }, [lines, filterDivisionId])

  const filteredLines = useMemo(() => {
    return lines.filter((l) => {
      if (filterSectionId) return l.section?.id === filterSectionId
      if (filterDivisionId) return l.section?.division.id === filterDivisionId
      return true
    })
  }, [lines, filterDivisionId, filterSectionId])
  const unreadyFilteredLines = useMemo(
    () => filteredLines.filter((line) => !line.qrReady),
    [filteredLines],
  )

  const selectedLinesOrdered = useMemo(
    () => filteredLines.filter((l) => l.qrReady && selectedLineIds.includes(l.id)),
    [filteredLines, selectedLineIds],
  )

  const previewLine = selectedLinesOrdered[0] ?? null

  const toggleLine = useCallback((id: string) => {
    const line = filteredLines.find((l) => l.id === id)
    if (!line?.qrReady) return
    setSelectedLineIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }, [filteredLines])

  const selectAllFiltered = useCallback(() => {
    setSelectedLineIds(filteredLines.filter((l) => l.qrReady).map((l) => l.id))
  }, [filteredLines])

  const clearSelection = useCallback(() => setSelectedLineIds([]), [])

  const onDivisionChange = useCallback((id: string) => {
    setFilterDivisionId(id)
    setFilterSectionId('')
  }, [])

  const onSectionChange = useCallback(
    (id: string) => {
      setFilterSectionId(id)
      if (id) {
        const divId = lines.find((l) => l.section?.id === id)?.section?.division.id
        if (divId) setFilterDivisionId(divId)
      }
    },
    [lines],
  )

  useEffect(() => {
    const allow = new Set(filteredLines.map((l) => l.id))
    const readyById = new Map(filteredLines.map((l) => [l.id, l.qrReady]))
    setSelectedLineIds((prev) => prev.filter((id) => allow.has(id) && readyById.get(id) === true))
  }, [filteredLines])

  const handleDownloadSelectedQrs = useCallback(async () => {
    if (selectedLinesOrdered.length === 0 || !baseUrl) return
    setLineQrDownloading(true)
    try {
      for (const line of selectedLinesOrdered) {
        const canvas = await buildLineRecordQrCanvas(line, baseUrl, locale)
        triggerCanvasDownload(canvas, line.lineCode)
        await new Promise((r) => setTimeout(r, 400))
      }
    } finally {
      setLineQrDownloading(false)
    }
  }, [selectedLinesOrdered, baseUrl, locale])

  const lineRecordUrl =
    previewLine && baseUrl
      ? `${baseUrl}/production/record?lineId=${encodeURIComponent(previewLine.id)}`
      : ''

  if (lines.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        {locale === 'th' ? 'ไม่มีไลน์ผลิต' : 'No production lines'}
      </p>
    )
  }

  return (
    <>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            <QrCode className="mr-2 inline-block" size={22} />
            {locale === 'th' ? 'สร้าง QR Code (ไลน์ผลิต)' : 'QR Code — production line'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {locale === 'th'
              ? 'สแกนแล้วกรอกรหัสพนักงาน — เลือกเครื่องได้เฉพาะในไลน์นั้น'
              : 'Scan, enter employee code, then pick a machine on that line only.'}
          </p>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800">
            {locale === 'th' ? 'QR เปิดหน้าบันทึกการผลิต (ไลน์ผลิต)' : 'QR — production record by line'}
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            {locale === 'th'
              ? 'ตั้งค่า NEXT_PUBLIC_BASE_URL ใน .env.local ให้ตรง IP ที่มือถือในโรงงาน แล้วรีสตาร์ทเซิร์ฟเวอร์'
              : 'Set NEXT_PUBLIC_BASE_URL in .env.local for factory devices, then restart the server.'}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                {locale === 'th' ? 'ฝ่าย (Division)' : 'Division'}
              </label>
              <select
                value={filterDivisionId}
                onChange={(e) => onDivisionChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">
                  {locale === 'th' ? '— ทุกฝ่าย —' : '— All divisions —'}
                </option>
                {divisionOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.divisionCode} — {d.divisionName}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Section
              </label>
              <select
                value={filterSectionId}
                onChange={(e) => onSectionChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              >
                <option value="">
                  {locale === 'th' ? '— ทุก Section —' : '— All sections —'}
                </option>
                {sectionOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sectionCode} — {s.sectionName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-600">
                {locale === 'th' ? 'เลือกไลน์ (หลายรายการได้)' : 'Select lines (multiple)'}
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  disabled={filteredLines.length === 0}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  {locale === 'th' ? 'เลือกทั้งหมดที่แสดง' : 'Select all shown'}
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={selectedLineIds.length === 0}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  {locale === 'th' ? 'ล้างการเลือก' : 'Clear'}
                </button>
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
              {unreadyFilteredLines.length > 0 ? (
                <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                  {locale === 'th'
                    ? `มี ${unreadyFilteredLines.length} ไลน์ยังไม่มี LinePartTarget (Active) — ระบบไม่อนุญาตออก QR`
                    : `${unreadyFilteredLines.length} line(s) have no active LinePartTarget — QR generation is blocked.`}
                </div>
              ) : null}
              {filteredLines.length === 0 ? (
                <p className="px-2 py-3 text-center text-sm text-slate-400">
                  {locale === 'th' ? 'ไม่มีไลน์ตามตัวกรอง' : 'No lines match filters'}
                </p>
              ) : (
                <ul className="space-y-1">
                  {filteredLines.map((l) => (
                    <li key={l.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selectedLineIds.includes(l.id) && l.qrReady}
                          onChange={() => toggleLine(l.id)}
                          disabled={!l.qrReady}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                        />
                        <span className="font-medium text-slate-800">{l.lineCode}</span>
                        {!l.qrReady ? (
                          <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            {locale === 'th' ? 'ไม่มี target' : 'No target'}
                          </span>
                        ) : (
                          <span className="ml-auto text-xs text-slate-400">
                            {l.activeLineTargetCount}
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={selectedLinesOrdered.length === 0 || !baseUrl || lineQrDownloading}
                onClick={handleDownloadSelectedQrs}
                className="flex items-center gap-2 rounded-lg border border-indigo-300 bg-white px-4 py-2.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-40"
              >
                <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden>
                  <Download
                    size={16}
                    className={lineQrDownloading ? 'invisible' : ''}
                    aria-hidden
                  />
                  <Loader2
                    size={16}
                    className={
                      lineQrDownloading
                        ? 'absolute inset-0 m-auto animate-spin'
                        : 'invisible absolute inset-0 m-auto'
                    }
                    aria-hidden
                  />
                </span>
                {locale === 'th'
                  ? `ดาวน์โหลด QR ที่เลือก (${selectedLinesOrdered.length})`
                  : `Download selected (${selectedLinesOrdered.length})`}
              </button>
              {selectedLinesOrdered.length > 0 ? (
                <span className="text-xs text-slate-500">
                  {locale === 'th'
                    ? `จะได้ไฟล์ PNG แยกตามไลน์ ${selectedLinesOrdered.length} ไฟล์`
                    : `${selectedLinesOrdered.length} PNG files (one per line)`}
                </span>
              ) : null}
            </div>
          </div>

          {previewLine && baseUrl ? (
            <div className="mt-4 border-t border-indigo-100/80 pt-4">
              <p className="mb-2 text-xs text-slate-500">
                {locale === 'th'
                  ? `ตัวอย่าง (ไลน์แรกที่เลือก): ${previewLine.lineCode}`
                  : `Preview (first selected): ${previewLine.lineCode}`}
              </p>
              <div className="inline-block rounded-lg border border-white bg-white p-3 shadow-sm">
                <QRCodeSVG value={lineRecordUrl} size={168} level="M" includeMargin />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
