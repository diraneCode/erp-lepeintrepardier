"use client"

import { useCallback, useDeferredValue, useMemo, useState } from "react"

import { DATE_PRESETS, describeRange, inRange, type DateRange } from "@/lib/date-range"
import { formatNumber } from "@/lib/format"

export interface FacetOption {
  value: string
  label: string
}

export interface FacetDef<T> {
  id: string
  label: string
  options: FacetOption[]
  accessor: (row: T) => string | null | undefined
}

export interface RangeDef<T> {
  id: string
  label: string
  accessor: (row: T) => number
  unit?: string
}

export interface FilterConfig<T> {
  search?: { placeholder: string; fields: (row: T) => (string | number | null | undefined)[] }
  /** `filter: false` : la période sert aux calculs de la page sans filtrer les lignes. */
  date?: { label: string; accessor: (row: T) => string | null | undefined; defaultPreset?: string; filter?: boolean }
  facets?: FacetDef<T>[]
  ranges?: RangeDef<T>[]
}

export interface FilterState {
  search: string
  date?: DateRange
  datePreset?: string
  facets: Record<string, string[]>
  ranges: Record<string, { min?: number; max?: number }>
}

export function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

function initialState<T>(config: FilterConfig<T>): FilterState {
  const preset = config.date?.defaultPreset ? DATE_PRESETS.find((p) => p.id === config.date?.defaultPreset) : undefined
  return { search: "", date: preset?.range(), datePreset: preset?.id, facets: {}, ranges: {} }
}

/**
 * Filtrage côté client : recherche plein texte (sans accents), intervalle de
 * dates, facettes multi-valeurs et intervalles numériques.
 */
export function useFilters<T>(data: T[], config: FilterConfig<T>) {
  const [state, setState] = useState<FilterState>(() => initialState(config))
  const deferredSearch = useDeferredValue(state.search)

  const setSearch = useCallback((search: string) => setState((s) => ({ ...s, search })), [])
  const setDate = useCallback((date: DateRange | undefined, datePreset?: string) => setState((s) => ({ ...s, date, datePreset })), [])
  const setFacet = useCallback((id: string, values: string[]) => setState((s) => ({ ...s, facets: { ...s.facets, [id]: values } })), [])
  const setRange = useCallback(
    (id: string, range: { min?: number; max?: number }) => setState((s) => ({ ...s, ranges: { ...s.ranges, [id]: range } })),
    []
  )
  const reset = useCallback(() => setState({ search: "", facets: {}, ranges: {} }), [])

  /** Applique tous les filtres sauf ceux listés (utile pour les compteurs de facettes). */
  const apply = useCallback(
    (rows: T[], except?: string) => {
      const q = normalize(deferredSearch.trim())
      const terms = q ? q.split(/\s+/) : []
      return rows.filter((row) => {
        if (terms.length && config.search) {
          const haystack = normalize(config.search.fields(row).filter((v) => v !== null && v !== undefined).join(" "))
          if (!terms.every((t) => haystack.includes(t))) return false
        }
        if (config.date && config.date.filter !== false && except !== "__date" && !inRange(config.date.accessor(row), state.date)) return false
        for (const f of config.facets ?? []) {
          if (f.id === except) continue
          const selected = state.facets[f.id]
          if (selected?.length && !selected.includes(String(f.accessor(row) ?? ""))) return false
        }
        for (const r of config.ranges ?? []) {
          const range = state.ranges[r.id]
          if (!range) continue
          const v = r.accessor(row)
          if (range.min !== undefined && v < range.min) return false
          if (range.max !== undefined && v > range.max) return false
        }
        return true
      })
    },
    [deferredSearch, state.date, state.facets, state.ranges, config]
  )

  const filtered = useMemo(() => apply(data), [apply, data])

  const facetCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {}
    for (const f of config.facets ?? []) {
      const rows = apply(data, f.id)
      const c: Record<string, number> = {}
      for (const r of rows) {
        const k = String(f.accessor(r) ?? "")
        c[k] = (c[k] ?? 0) + 1
      }
      counts[f.id] = c
    }
    return counts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply, data])

  const activeCount =
    (state.search.trim() ? 1 : 0) +
    (state.date?.from || state.date?.to ? 1 : 0) +
    Object.values(state.facets).filter((v) => v.length).length +
    Object.values(state.ranges).filter((r) => r.min !== undefined || r.max !== undefined).length

  /** Description lisible des filtres actifs (en-tête des exports). */
  const describe = useCallback(() => {
    const parts: string[] = []
    if (config.date) parts.push(describeRange(state.date))
    if (state.search.trim()) parts.push(`Recherche « ${state.search.trim()} »`)
    for (const f of config.facets ?? []) {
      const sel = state.facets[f.id]
      if (sel?.length) parts.push(`${f.label} : ${sel.map((v) => f.options.find((o) => o.value === v)?.label ?? v).join(", ")}`)
    }
    for (const r of config.ranges ?? []) {
      const range = state.ranges[r.id]
      if (range && (range.min !== undefined || range.max !== undefined))
        parts.push(
          `${r.label} : ${range.min !== undefined ? formatNumber(range.min) : "…"} – ${range.max !== undefined ? formatNumber(range.max) : "…"}${r.unit ? ` ${r.unit}` : ""}`
        )
    }
    return parts.join(" · ")
  }, [config, state])

  return { state, config, setSearch, setDate, setFacet, setRange, reset, filtered, facetCounts, activeCount, describe }
}

export type FiltersApi<T> = ReturnType<typeof useFilters<T>>
