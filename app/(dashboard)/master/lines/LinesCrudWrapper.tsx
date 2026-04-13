'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { CrudPage, type Column, type Field } from '@/components/master/CrudPage'
import { useI18n } from '@/lib/i18n'

type DivisionOpt = { id: string; divisionCode: string; divisionName: string }
type SectionOpt = { id: string; sectionCode: string; sectionName: string; divisionId: string }

interface Props {
  lines: any[]
  divisions: DivisionOpt[]
  sections: SectionOpt[]
  title: string
  titleEn: string
  columns: Column[]
  apiEndpoint: string
  fields: Field[]
}

export function LinesCrudWrapper({
  lines,
  divisions,
  sections,
  title,
  titleEn,
  columns,
  apiEndpoint,
  fields,
}: Props) {
  const { locale } = useI18n()
  const [filterDivisionId, setFilterDivisionId] = useState('')
  const [filterSectionId, setFilterSectionId] = useState('')

  const t = useCallback((th: string, en: string) => (locale === 'th' ? th : en), [locale])

  const sectionFilterOptions = useMemo(() => {
    if (!filterDivisionId) return sections
    return sections.filter((s) => s.divisionId === filterDivisionId)
  }, [sections, filterDivisionId])

  const filteredLines = useMemo(() => {
    return lines.filter((l) => {
      if (filterSectionId) return l.sectionId === filterSectionId
      if (filterDivisionId) return l.section?.division?.id === filterDivisionId
      return true
    })
  }, [lines, filterDivisionId, filterSectionId])

  const onDivisionChange = useCallback((id: string) => {
    setFilterDivisionId(id)
    setFilterSectionId('')
  }, [])

  useEffect(() => {
    if (!filterSectionId) return
    if (!sectionFilterOptions.some((s) => s.id === filterSectionId)) {
      setFilterSectionId('')
    }
  }, [sectionFilterOptions, filterSectionId])

  const columnRenders = useMemo(
    () => ({
      _partTargetsLink: (row: { id: string }) => (
        <Link
          href={`/master/lines/${row.id}/part-targets`}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          {t('เป้าตามสาย', 'Line targets')}
        </Link>
      ),
    }),
    [t],
  )

  const columnSearchText = useMemo(
    () => ({
      _partTargetsLink: (row: { lineCode?: string; lineName?: string }) =>
        `${row.lineCode ?? ''} ${row.lineName ?? ''}`,
    }),
    [],
  )

  const filterBar = (
    <>
      <div className="min-w-[180px] space-y-1.5">
        <label className="block text-xs font-medium text-slate-600">
          {t('ฝ่าย (Division)', 'Division')}
        </label>
        <select
          value={filterDivisionId}
          onChange={(e) => onDivisionChange(e.target.value)}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">{t('— ทุกฝ่าย —', '— All divisions —')}</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.divisionCode} — {d.divisionName}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[180px] space-y-1.5">
        <label className="block text-xs font-medium text-slate-600">Section</label>
        <select
          value={filterSectionId}
          onChange={(e) => {
            const id = e.target.value
            setFilterSectionId(id)
            if (id) {
              const divId = sections.find((s) => s.id === id)?.divisionId
              if (divId) setFilterDivisionId(divId)
            }
          }}
          className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">{t('— ทุก Section —', '— All sections —')}</option>
          {sectionFilterOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.sectionCode} — {s.sectionName}
            </option>
          ))}
        </select>
      </div>
    </>
  )

  return (
    <CrudPage
      title={title}
      titleEn={titleEn}
      columns={columns}
      data={filteredLines}
      apiEndpoint={apiEndpoint}
      fields={fields}
      filterBar={filterBar}
      columnRenders={columnRenders}
      columnSearchText={columnSearchText}
    />
  )
}
