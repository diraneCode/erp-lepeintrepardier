import { differenceInCalendarDays, eachDayOfInterval, isWeekend } from "date-fns"

import type { Attendance, Invoice, InvoiceStatus, LineItem, Payslip } from "@/lib/types"
import { toDate, toISODate } from "@/lib/format"

/* ---------- Lignes de document ---------- */

export function lineSubtotal(item: LineItem) {
  return item.quantity * item.unitPrice * (1 - item.discount / 100)
}

export function lineTax(item: LineItem) {
  return lineSubtotal(item) * (item.taxRate / 100)
}

export function documentTotals(items: LineItem[]) {
  const gross = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const subtotal = items.reduce((s, i) => s + lineSubtotal(i), 0)
  const tax = items.reduce((s, i) => s + lineTax(i), 0)
  return {
    gross: Math.round(gross),
    discount: Math.round(gross - subtotal),
    subtotal: Math.round(subtotal),
    tax: Math.round(tax),
    total: Math.round(subtotal + tax),
  }
}

export function itemsCost(items: LineItem[], purchasePrice: (productId: string) => number) {
  return items.reduce((s, i) => s + i.quantity * purchasePrice(i.productId), 0)
}

/* ---------- Factures ---------- */

export function invoiceTotal(invoice: Pick<Invoice, "items">) {
  return documentTotals(invoice.items).total
}

export function invoiceBalance(invoice: Invoice) {
  return Math.max(0, invoiceTotal(invoice) - invoice.amountPaid)
}

/** Statut affiché : une facture émise/partielle dont l'échéance est passée est "en retard". */
export function invoiceStatus(invoice: Invoice, today = toISODate(new Date())): InvoiceStatus {
  if ((invoice.status === "emise" || invoice.status === "partielle") && invoice.dueDate < today) {
    return "en_retard"
  }
  return invoice.status
}

export function daysOverdue(invoice: Invoice) {
  const due = toDate(invoice.dueDate)
  if (!due) return 0
  return Math.max(0, differenceInCalendarDays(new Date(), due))
}

/* ---------- Pointage ---------- */

function toMinutes(time: string | null) {
  if (!time) return null
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

export const WORK_START = "08:00"
export const DAILY_MINUTES = 8 * 60

export function workedMinutes(a: Pick<Attendance, "checkIn" | "checkOut" | "breakMinutes">) {
  const start = toMinutes(a.checkIn)
  const end = toMinutes(a.checkOut)
  if (start == null || end == null || end <= start) return 0
  return Math.max(0, end - start - a.breakMinutes)
}

export function lateMinutes(a: Pick<Attendance, "checkIn">) {
  const start = toMinutes(a.checkIn)
  if (start == null) return 0
  return Math.max(0, start - (toMinutes(WORK_START) ?? 0))
}

/** Dépassement de la journée de 8 h (calcul brut à partir des heures pointées). */
export function overtimeMinutes(a: Pick<Attendance, "checkIn" | "checkOut" | "breakMinutes">) {
  return Math.max(0, workedMinutes(a) - DAILY_MINUTES)
}

/** Heures supplémentaires retenues sur un pointage (saisie RH, sinon dépassement calculé). */
export function recordedOvertime(a: Pick<Attendance, "checkIn" | "checkOut" | "breakMinutes" | "overtimeMinutes">) {
  return a.overtimeMinutes ?? overtimeMinutes(a)
}

/** Plafond d'heures supplémentaires sur une journée (12 h, comme en base) */
export const MAX_DAILY_OVERTIME = 720

/**
 * Montant des heures supplémentaires du mois (identique à app.overtime_pay) :
 * taux horaire = base / 173,33 h, majoré de 20 % jusqu'à 32 h, 30 % jusqu'à 64 h, 40 % au-delà.
 */
export function overtimePay(baseSalary: number, minutes: number) {
  const h = Math.max(0, minutes) / 60
  const rate = baseSalary / 173.33
  const amount = rate * (Math.min(h, 32) * 1.2 + Math.min(Math.max(h - 32, 0), 32) * 1.3 + Math.max(h - 64, 0) * 1.4)
  return Math.round(amount / 100) * 100
}

/* ---------- Congés ---------- */

export function businessDaysBetween(start: string, end: string) {
  const s = toDate(start)
  const e = toDate(end)
  if (!s || !e || e < s) return 0
  return eachDayOfInterval({ start: s, end: e }).filter((d) => !isWeekend(d)).length
}

/** 1,5 jour ouvrable par mois de service (Code du travail camerounais), plafonné à 18 j/an */
export const ANNUAL_LEAVE_DAYS = 18

/* ---------- Paie (modèle camerounais simplifié) ---------- */

const CNPS_RATE = 0.042
const CNPS_CEILING = 750_000
const CFC_RATE = 0.01

/** Barème IRPP annuel progressif (simplifié). */
function irppAnnual(taxableAnnual: number) {
  const brackets: [number, number][] = [
    [2_000_000, 0.1],
    [3_000_000, 0.15],
    [5_000_000, 0.25],
    [Infinity, 0.35],
  ]
  let remaining = taxableAnnual
  let previous = 0
  let tax = 0
  for (const [limit, rate] of brackets) {
    const slice = Math.min(remaining, limit - previous)
    if (slice <= 0) break
    tax += slice * rate
    remaining -= slice
    previous = limit
  }
  return tax
}

function ravMonthly(gross: number) {
  if (gross <= 50_000) return 0
  if (gross <= 100_000) return 750
  if (gross <= 200_000) return 1_950
  if (gross <= 300_000) return 3_250
  if (gross <= 500_000) return 4_550
  if (gross <= 700_000) return 5_850
  if (gross <= 800_000) return 6_500
  return 13_000
}

function tdlMonthly(base: number) {
  if (base <= 62_000) return 0
  if (base <= 75_000) return 250
  if (base <= 100_000) return 500
  if (base <= 125_000) return 750
  if (base <= 150_000) return 1_000
  if (base <= 200_000) return 1_250
  if (base <= 250_000) return 1_500
  if (base <= 300_000) return 2_000
  if (base <= 500_000) return 2_250
  return 2_500
}

export function computePayslip(p: Pick<Payslip, "baseSalary" | "overtime" | "bonuses" | "transportAllowance" | "housingAllowance" | "otherDeductions">) {
  const gross = p.baseSalary + p.overtime + p.bonuses + p.transportAllowance + p.housingAllowance
  const cnps = Math.round(Math.min(gross, CNPS_CEILING) * CNPS_RATE)
  // Base imposable : brut - 30 % d'abattement - cotisation CNPS, annualisée - 500 000 FCFA
  const taxableAnnual = Math.max(0, (gross * 0.7 - cnps) * 12 - 500_000)
  const irpp = gross < 62_000 ? 0 : Math.round(irppAnnual(taxableAnnual) / 12)
  const cac = Math.round(irpp * 0.1)
  const cfc = Math.round(gross * CFC_RATE)
  const rav = ravMonthly(gross)
  const tdl = tdlMonthly(p.baseSalary)
  const deductions = cnps + irpp + cac + cfc + rav + tdl + p.otherDeductions
  return {
    gross: Math.round(gross),
    cnps,
    irpp,
    cac,
    cfc,
    rav,
    tdl,
    otherDeductions: p.otherDeductions,
    deductions,
    net: Math.round(gross - deductions),
    employerCost: Math.round(gross + Math.min(gross, CNPS_CEILING) * 0.112 + gross * 0.025),
  }
}

/* ---------- Divers ---------- */

export function sum<T>(rows: T[], fn: (row: T) => number) {
  return rows.reduce((s, r) => s + fn(r), 0)
}

export function pctChange(current: number, previous: number) {
  if (!previous) return current ? 100 : 0
  return ((current - previous) / Math.abs(previous)) * 100
}

export function groupBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    const list = map.get(k)
    if (list) list.push(r)
    else map.set(k, [r])
  }
  return map
}
