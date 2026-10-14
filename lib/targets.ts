import { differenceInCalendarDays, eachMonthOfInterval, endOfMonth, format, getDaysInMonth, max, min, startOfMonth } from "date-fns"

import type { DateRange } from "@/lib/date-range"
import type { Shop, ShopTarget } from "@/lib/types"

/** Objectif d'une boutique pour un mois ; à défaut, l'objectif mensuel par défaut de la boutique. */
export function monthTarget(targets: ShopTarget[], shop: Shop, period: string) {
  return targets.find((t) => t.shopId === shop.id && t.period === period)?.amount ?? shop.monthlyTarget
}

/**
 * Objectif sur un intervalle : somme des objectifs mensuels, proratisés au
 * nombre de jours de chaque mois couverts par l'intervalle.
 */
export function targetForRange(targets: ShopTarget[], shop: Shop, range?: DateRange) {
  if (!range?.from || !range?.to) return 0
  return eachMonthOfInterval({ start: range.from, end: range.to }).reduce((sum, m) => {
    const from = max([startOfMonth(m), range.from!])
    const to = min([endOfMonth(m), range.to!])
    const days = differenceInCalendarDays(to, from) + 1
    return sum + (monthTarget(targets, shop, format(m, "yyyy-MM")) * days) / getDaysInMonth(m)
  }, 0)
}

export const MONTHS_FR = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."]
