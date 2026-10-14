import { format, parseISO, isValid, differenceInCalendarDays } from "date-fns"
import { fr } from "date-fns/locale"

/** Groupe les milliers avec une espace simple (compatible PDF/Excel/CSV). */
export function formatNumber(value: number, decimals = 0) {
  if (!Number.isFinite(value)) return "0"
  const negative = value < 0
  const [int, dec] = Math.abs(value).toFixed(decimals).split(".")
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
  return `${negative ? "-" : ""}${grouped}${dec ? `,${dec}` : ""}`
}

export const CURRENCY = "FCFA"

export function formatMoney(value: number, opts: { compact?: boolean; currency?: boolean } = {}) {
  const { compact = false, currency = true } = opts
  const suffix = currency ? ` ${CURRENCY}` : ""
  if (compact) {
    const abs = Math.abs(value)
    if (abs >= 1_000_000_000) return `${formatNumber(value / 1_000_000_000, 1)} Md${suffix}`
    if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} M${suffix}`
    if (abs >= 10_000) return `${formatNumber(value / 1_000, 0)} k${suffix}`
  }
  return `${formatNumber(Math.round(value))}${suffix}`
}

export function formatPercent(value: number, decimals = 1) {
  return `${formatNumber(value, decimals)} %`
}

export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = typeof value === "string" ? parseISO(value) : value
  return isValid(d) ? d : null
}

export function formatDate(value: string | Date | null | undefined, pattern = "dd/MM/yyyy") {
  const d = toDate(value)
  return d ? format(d, pattern, { locale: fr }) : "—"
}

export function formatDateLong(value: string | Date | null | undefined) {
  return formatDate(value, "d MMMM yyyy")
}

export function formatDateTime(value: string | Date | null | undefined) {
  return formatDate(value, "dd/MM/yyyy HH:mm")
}

export function formatMonth(period: string) {
  return formatDate(`${period}-01`, "MMMM yyyy")
}

export function toISODate(d: Date) {
  return format(d, "yyyy-MM-dd")
}

export function relativeDays(value: string) {
  const d = toDate(value)
  if (!d) return ""
  const diff = differenceInCalendarDays(d, new Date())
  if (diff === 0) return "aujourd'hui"
  if (diff === 1) return "demain"
  if (diff === -1) return "hier"
  return diff > 0 ? `dans ${diff} j` : `il y a ${-diff} j`
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${h} h ${m.toString().padStart(2, "0")}`
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
