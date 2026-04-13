'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export type BannerImage = {
  id: string
  url: string
  caption: string | null
}

export function MachineImageBanner({
  images,
  machineName,
}: {
  images: BannerImage[]
  machineName: string
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const open = lightboxIndex !== null
  const count = images.length
  const current = lightboxIndex != null ? images[lightboxIndex] : null

  const goPrev = useCallback(() => {
    setLightboxIndex(i => (i == null || count < 2 ? i : (i - 1 + count) % count))
  }, [count])

  const goNext = useCallback(() => {
    setLightboxIndex(i => (i == null || count < 2 ? i : (i + 1) % count))
  }, [count])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, goPrev, goNext])

  if (count === 0) return null

  return (
    <>
      <div className="flex gap-1 h-48 bg-slate-100 overflow-hidden">
        {images.map((img, idx) => (
          <button
            key={img.id}
            type="button"
            className="relative flex-1 min-w-0 cursor-zoom-in text-left outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-blue-400"
            onClick={() => setLightboxIndex(idx)}
            title="คลิกเพื่อดูขนาดใหญ่"
          >
            <img
              src={img.url}
              alt={img.caption ?? machineName}
              className="h-full w-full object-cover transition-opacity hover:opacity-95"
            />
            {img.caption ? (
              <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                {img.caption}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={v => !v && setLightboxIndex(null)}>
        <DialogContent className="max-h-[95vh] w-[min(96vw,1200px)] max-w-none border-none bg-black/95 p-2 text-white shadow-2xl sm:p-4 [&>button]:right-3 [&>button]:top-3 [&>button]:text-white [&>button]:opacity-90 [&>button]:ring-offset-black [&>button]:hover:bg-white/15 [&>button]:hover:opacity-100">
          <DialogTitle className="sr-only">
            รูปเครื่อง {machineName}
            {current?.caption ? ` — ${current.caption}` : ''}
          </DialogTitle>
          <DialogDescription className="sr-only">
            ดูรูปขนาดใหญ่ กดปุ่มปิดหรือคลิกนอกกรอบเพื่อปิด
          </DialogDescription>
          {current ? (
            <div className="relative flex max-h-[min(88vh,900px)] min-h-[200px] items-center justify-center">
              <img
                src={current.url}
                alt={current.caption ?? machineName}
                className="max-h-[min(88vh,900px)] max-w-full object-contain"
              />
              {count > 1 ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute left-1 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/90 text-slate-800 shadow-md hover:bg-white"
                    onClick={e => {
                      e.stopPropagation()
                      goPrev()
                    }}
                    aria-label="รูปก่อนหน้า"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="absolute right-1 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-white/90 text-slate-800 shadow-md hover:bg-white"
                    onClick={e => {
                      e.stopPropagation()
                      goNext()
                    }}
                    aria-label="รูปถัดไป"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          {current?.caption ? (
            <p className="mt-2 text-center text-sm text-white/90">{current.caption}</p>
          ) : null}
          {count > 1 ? (
            <p className="mt-1 text-center text-xs text-white/60">
              {(lightboxIndex ?? 0) + 1} / {count} · ลูกศรซ้าย/ขวา
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
