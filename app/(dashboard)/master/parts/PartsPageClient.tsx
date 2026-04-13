'use client'

import { useMemo, useState, useCallback } from 'react'
import { CrudPage, type Column, type Field } from '@/components/master/CrudPage'
import { useI18n } from '@/lib/i18n'
import { PartsMcTargetsCell } from './PartsMcTargetsCell'
import { PartsLineTargetsCell } from './PartsLineTargetsCell'

interface Props {
  parts: any[]
  customers: { id: string; customerCode: string; customerName: string | null }[]
}

export function PartsPageClient({ parts, customers }: Props) {
  const { locale } = useI18n()
  const t = useCallback((th: string, en: string) => (locale === 'th' ? th : en), [locale])
  const [filterCustomerId, setFilterCustomerId] = useState('')

  const filteredParts = useMemo(() => {
    if (!filterCustomerId) return parts
    return parts.filter((p) => p.customerId === filterCustomerId)
  }, [parts, filterCustomerId])

  const columns: Column[] = useMemo(
    () => [
      { key: 'partSamco', label: 'SAMCO', labelEn: 'SAMCO' },
      { key: 'partNo', label: 'Part No', labelEn: 'Part No' },
      { key: 'partName', label: 'ชื่อ', labelEn: 'Name' },
      { key: 'customer.customerCode', label: 'ลูกค้า', labelEn: 'Customer' },
      {
        key: 'machineTargets',
        label: 'เป้า M/C',
        labelEn: 'M/C targets',
        cellClassName: 'align-top min-w-[12rem]',
      },
      {
        key: 'lineTargets',
        label: 'สายการผลิต',
        labelEn: 'Line targets',
        cellClassName: 'align-top min-w-[12rem]',
      },
    ],
    [],
  )

  const fields: Field[] = useMemo(
    () => [
      { key: 'partSamco', label: 'SAMCO', labelEn: 'SAMCO', type: 'number', required: true },
      { key: 'partNo', label: 'Part No', labelEn: 'Part No', type: 'text', required: true },
      { key: 'partName', label: 'ชื่อ Part', labelEn: 'Part Name', type: 'text', required: true },
      {
        key: 'customerId',
        label: 'ลูกค้า',
        labelEn: 'Customer',
        type: 'select',
        options: customers.map((c) => ({
          value: c.id,
          label: c.customerCode + (c.customerName ? ` - ${c.customerName}` : ''),
        })),
      },
    ],
    [customers],
  )

  const filterBar = (
    <div className="min-w-[200px] space-y-1.5">
      <label className="block text-xs font-medium text-slate-600">
        {t('ลูกค้า', 'Customer')}
      </label>
      <select
        value={filterCustomerId}
        onChange={(e) => setFilterCustomerId(e.target.value)}
        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        <option value="">{t('— ทุกลูกค้า —', '— All customers —')}</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.customerCode}
            {c.customerName ? ` — ${c.customerName}` : ''}
          </option>
        ))}
      </select>
    </div>
  )

  return (
    <CrudPage
      title="Part / ชิ้นส่วน"
      titleEn="Parts"
      columns={columns}
      data={filteredParts}
      apiEndpoint="/api/master/parts"
      fields={fields}
      filterBar={filterBar}
      columnRenders={{
        machineTargets: (row) => <PartsMcTargetsCell targets={row.targets} />,
        lineTargets: (row) => <PartsLineTargetsCell lineTargets={row.lineTargets} />,
      }}
      columnSearchText={{
        machineTargets: (row) => {
          const ts = row.targets as
            | {
                machine?: {
                  mcNo?: string
                  mcName?: string
                  line?: { lineCode?: string }
                }
              }[]
            | undefined
          if (!ts?.length) return ''
          return ts
            .map((t) =>
              [t.machine?.line?.lineCode, t.machine?.mcNo, t.machine?.mcName].filter(Boolean).join(' '),
            )
            .join(' ')
        },
        lineTargets: (row) => {
          const lt = row.lineTargets as { line?: { lineCode?: string; lineName?: string } }[] | undefined
          if (!lt?.length) return ''
          return lt
            .map((t) => [t.line?.lineCode, t.line?.lineName].filter(Boolean).join(' '))
            .join(' ')
        },
      }}
    />
  )
}
