import { differenceInCalendarDays } from "date-fns"

import { toDate, toISODate } from "@/lib/format"
import type { Product } from "@/lib/types"

/** Promotion en cours (prix promotionnel renseigné et non échu). */
export function hasActivePromo(p: Product, today = toISODate(new Date())) {
  return p.promoPrice !== undefined && p.promoPrice > 0 && (!p.promoEndDate || p.promoEndDate >= today)
}

/** Prix de vente HT appliqué en caisse (promotion comprise). */
export function effectivePrice(p: Product, today = toISODate(new Date())) {
  return hasActivePromo(p, today) ? (p.promoPrice as number) : p.salePrice
}

export type ExpiryState = "perime" | "critique" | "proche" | "ok" | "sans"

/** Seuils d'alerte : critique ≤ 30 jours, proche ≤ 90 jours. */
export function expiryState(p: Product, now = new Date()): ExpiryState {
  const d = toDate(p.expiryDate)
  if (!d) return "sans"
  const days = differenceInCalendarDays(d, now)
  if (days < 0) return "perime"
  if (days <= 30) return "critique"
  if (days <= 90) return "proche"
  return "ok"
}

export function daysToExpiry(p: Product, now = new Date()) {
  const d = toDate(p.expiryDate)
  return d ? differenceInCalendarDays(d, now) : null
}

export const expiryDef = {
  perime: { label: "Périmé", tone: "destructive" as const },
  critique: { label: "≤ 30 jours", tone: "warning" as const },
  proche: { label: "≤ 90 jours", tone: "info" as const },
  ok: { label: "Valide", tone: "success" as const },
  sans: { label: "Sans péremption", tone: "neutral" as const },
}
