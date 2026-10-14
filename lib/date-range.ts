import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns"

import { formatDate, toISODate } from "@/lib/format"

export interface DateRange {
  from?: Date
  to?: Date
}

export interface DatePreset {
  id: string
  label: string
  range: () => DateRange
}

export const DATE_PRESETS: DatePreset[] = [
  { id: "today", label: "Aujourd'hui", range: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { id: "yesterday", label: "Hier", range: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }) },
  { id: "7d", label: "7 derniers jours", range: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }) },
  { id: "30d", label: "30 derniers jours", range: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }) },
  { id: "month", label: "Ce mois-ci", range: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { id: "last-month", label: "Mois dernier", range: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { id: "quarter", label: "Ce trimestre", range: () => ({ from: startOfQuarter(new Date()), to: endOfQuarter(new Date()) }) },
  { id: "6m", label: "6 derniers mois", range: () => ({ from: startOfMonth(subMonths(new Date(), 5)), to: endOfDay(new Date()) }) },
  { id: "year", label: "Cette année", range: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }) },
  { id: "last-year", label: "Année dernière", range: () => ({ from: startOfYear(subYears(new Date(), 1)), to: endOfYear(subYears(new Date(), 1)) }) },
]

/** Teste si une date ISO ("yyyy-MM-dd" ou avec heure) est dans l'intervalle (bornes incluses). */
export function inRange(value: string | undefined | null, range: DateRange | undefined) {
  if (!range || (!range.from && !range.to)) return true
  if (!value) return false
  const day = value.slice(0, 10)
  if (range.from && day < toISODate(range.from)) return false
  if (range.to && day > toISODate(range.to)) return false
  return true
}

/** Intervalle précédent de même durée (pour les comparaisons N-1). */
export function previousRange(range: DateRange): DateRange | undefined {
  if (!range.from || !range.to) return undefined
  // Une période en cours est tronquée à aujourd'hui, puis comparée à la même durée juste avant
  const to = range.to > new Date() ? endOfDay(new Date()) : range.to
  const span = to.getTime() - range.from.getTime()
  return { from: new Date(range.from.getTime() - span - 86_400_000), to: new Date(range.from.getTime() - 86_400_000) }
}

export function describeRange(range?: DateRange) {
  if (!range?.from && !range?.to) return "Toutes les dates"
  if (range.from && range.to) return `Du ${formatDate(range.from)} au ${formatDate(range.to)}`
  if (range.from) return `Depuis le ${formatDate(range.from)}`
  return `Jusqu'au ${formatDate(range.to)}`
}
