import { format } from "date-fns"

import { documentTotals, lineSubtotal } from "@/lib/calc"
import type { LineItem, LineSection } from "@/lib/types"

export const SECTIONS: LineSection[] = ["traitement", "main_oeuvre", "accessoires"]

export const SECTION_LABEL: Record<LineSection, { title: string; total: string }> = {
  traitement: { title: "Traitement", total: "Total traitement" },
  main_oeuvre: { title: "Main d'œuvre", total: "Total main d'œuvre" },
  accessoires: { title: "Accessoires", total: "Total accessoires" },
}

export const sectionOf = (i: LineItem): LineSection => i.section ?? "traitement"

/**
 * Quantité calculée : surface à traiter ÷ couverture d'un conditionnement,
 * arrondie à l'unité (au minimum 1). Renvoie null si le calcul est impossible.
 */
export function computedQuantity(surface?: number, coverage?: number) {
  if (!surface || !coverage || surface <= 0 || coverage <= 0) return null
  return Math.max(1, Math.round(surface / coverage))
}

export function sectionTotals(items: LineItem[]) {
  const totals = Object.fromEntries(SECTIONS.map((s) => [s, 0])) as Record<LineSection, number>
  for (const i of items) totals[sectionOf(i)] += Math.round(lineSubtotal(i))
  const t = documentTotals(items)
  return { ...totals, subtotal: t.subtotal, tax: t.tax, total: t.total }
}

/** Numéro de proforma : NN/AAAA/MM (séquence du mois). */
export function nextProformaNumber(existing: { number: string; date: string }[], date = new Date()) {
  const ym = format(date, "yyyy/MM")
  const max = existing.reduce((m, q) => {
    const match = q.number.match(/^(\d+)\/(\d{4})\/(\d{2})$/)
    if (!match || `${match[2]}/${match[3]}` !== ym) return m
    return Math.max(m, Number(match[1]))
  }, 0)
  return `${String(max + 1).padStart(2, "0")}/${ym}`
}

/* ---------- Montant en lettres ---------- */

const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"]
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"]

function below100(n: number): string {
  if (n < 20) return UNITS[n]
  const t = Math.floor(n / 10)
  let u = n % 10
  if (t === 7 || t === 9) u += 10
  let word = TENS[t]
  if (u === 0) return t === 8 ? "quatre-vingts" : word
  if ((u === 1 || u === 11) && t < 8) word += " et"
  return `${word}${word.endsWith(" et") ? " " : "-"}${UNITS[u]}`
}

function below1000(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  const head = h === 0 ? "" : h === 1 ? "cent" : `${UNITS[h]} cent${r === 0 ? "s" : ""}`
  if (r === 0) return head
  return head ? `${head} ${below100(r)}` : below100(r)
}

/** Écrit un entier en toutes lettres (orthographe traditionnelle). */
export function numberToFrenchWords(value: number): string {
  let n = Math.round(Math.abs(value))
  if (n === 0) return "zéro"
  const parts: string[] = []
  const scales: [number, string, string][] = [
    [1_000_000_000, "milliard", "milliards"],
    [1_000_000, "million", "millions"],
  ]
  for (const [size, one, many] of scales) {
    const q = Math.floor(n / size)
    if (q) {
      parts.push(`${below1000(q).replace(/cents$/, "cent")} ${q > 1 ? many : one}`)
      n %= size
    }
  }
  const thousands = Math.floor(n / 1000)
  if (thousands) {
    parts.push(thousands === 1 ? "mille" : `${below1000(thousands).replace(/cents$/, "cent").replace(/vingts$/, "vingt")} mille`)
    n %= 1000
  }
  if (n) parts.push(below1000(n))
  return parts.join(" ")
}

/** « Deux Millions Neuf Cent Quatre Vingt Mille Francs CFA » (présentation des proformas). */
export function amountInWords(value: number) {
  const words = numberToFrenchWords(value)
    .replace(/-/g, " ")
    .split(" ")
    .map((w) => (w === "et" ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
  return `${words} Francs CFA`
}
