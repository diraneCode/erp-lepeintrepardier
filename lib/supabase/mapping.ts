/**
 * Conversion entre le modèle TypeScript (camelCase) et les colonnes SQL
 * (snake_case). Seules les clés de premier niveau sont converties : le contenu
 * des colonnes jsonb (lignes de documents, participants…) reste en camelCase.
 */
const toSnakeKey = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
const toCamelKey = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())

/** Ligne SQL → objet applicatif (les NULL deviennent undefined). */
export function fromDb<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v === null) continue
    // Les colonnes numeric arrivent parfois en chaîne : on les ramène en nombre
    out[toCamelKey(k)] = typeof v === "string" && NUMERIC_COLUMNS.has(k) ? Number(v) : v
  }
  return out as T
}

/** Objet applicatif → ligne SQL (undefined devient NULL pour effacer une valeur). */
export function toDb(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (LOCAL_ONLY.has(k)) continue
    out[toSnakeKey(k)] = v === undefined || (typeof v === "number" && Number.isNaN(v)) ? null : v
  }
  return out
}

/** Champs calculés côté application, absents des tables. */
const LOCAL_ONLY = new Set(["read"])

const NUMERIC_COLUMNS = new Set([
  "monthly_target", "amount", "base_salary", "purchase_price", "sale_price", "tax_rate", "promo_price", "coverage",
  "credit_limit", "potential", "amount_paid", "budget", "spent", "revenue", "value", "min_amount", "cost", "fee",
  "overtime", "bonuses", "transport_allowance", "housing_allowance", "other_deductions",
])
