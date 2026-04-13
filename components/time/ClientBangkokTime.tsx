'use client'

import { useEffect, useState } from 'react'
import { formatInstantBangkok, parseIsoInstantUtcStrict } from '@/lib/time-utils'

type Props = {
  /** Serialized UTC instant, e.g. from `recordTime.toISOString()` — must end with `Z` */
  isoUtc: string
  /** Shown on SSR / before hydration; avoids server vs client locale clock skew in HTML */
  fallback?: string
  className?: string
}

/**
 * Hydration-safe Thai wall time: server renders `fallback`, client replaces after mount
 * using `Asia/Bangkok` formatting (independent of the visitor’s laptop timezone).
 */
export function ClientBangkokTime({ isoUtc, fallback = '—', className }: Props) {
  const [label, setLabel] = useState(fallback)

  useEffect(() => {
    const d = parseIsoInstantUtcStrict(isoUtc)
    setLabel(d ? formatInstantBangkok(d) : fallback)
  }, [isoUtc, fallback])

  return (
    <time className={className} dateTime={isoUtc} suppressHydrationWarning>
      {label}
    </time>
  )
}
