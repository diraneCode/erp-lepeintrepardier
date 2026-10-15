import { z } from "zod"

// Messages de validation par défaut en français (complète les messages personnalisés).
// Les messages de la locale zod (« Trop petit : nombre doit être >=0 », motifs
// d'expressions régulières…) sont trop techniques : on les remplace ci-dessous.
z.config(z.locales.fr())
z.config({ customError: friendlyError })

const num = (n: unknown) => (typeof n === "number" || typeof n === "bigint" ? Number(n).toLocaleString("fr-FR") : String(n))

/** Message simple et court pour chaque type d'erreur de saisie. */
function friendlyError(issue: z.core.$ZodRawIssue): string {
  const empty = issue.input === undefined || issue.input === null || issue.input === "" || (typeof issue.input === "number" && Number.isNaN(issue.input))
  switch (issue.code) {
    case "invalid_type":
      if (empty) return "Ce champ est requis"
      if (issue.expected === "int") return "Saisissez un nombre entier"
      if (issue.expected === "number") return "Saisissez un nombre valide"
      if (issue.expected === "date") return "Date invalide"
      return "Valeur invalide"
    case "too_small": {
      const min = Number(issue.minimum)
      if (issue.origin === "string") return min <= 1 ? "Ce champ est requis" : `${num(min)} caractères minimum`
      if (issue.origin === "array" || issue.origin === "set") return min <= 1 ? "Ajoutez au moins un élément" : `Au moins ${num(min)} éléments`
      if (issue.origin === "date") return "Date trop ancienne"
      if (min === 0) return issue.inclusive ? "La valeur doit être positive ou nulle" : "La valeur doit être supérieure à 0"
      return issue.inclusive ? `La valeur doit être au moins ${num(min)}` : `La valeur doit être supérieure à ${num(min)}`
    }
    case "too_big": {
      const max = Number(issue.maximum)
      if (issue.origin === "string") return `${num(max)} caractères maximum`
      if (issue.origin === "array" || issue.origin === "set") return `${num(max)} éléments maximum`
      if (issue.origin === "date") return "Date trop éloignée"
      return issue.inclusive ? `La valeur ne doit pas dépasser ${num(max)}` : `La valeur doit être inférieure à ${num(max)}`
    }
    case "invalid_format":
      if (issue.format === "email") return "Adresse e-mail invalide"
      if (issue.format === "url") return "Adresse web invalide"
      if (issue.format === "date" || issue.format === "datetime") return "Date invalide"
      if (issue.format === "time") return "Heure invalide"
      return "Format invalide"
    case "invalid_value":
      return "Choisissez une option dans la liste"
    case "not_multiple_of":
      return `Doit être un multiple de ${num(issue.divisor)}`
    default:
      return empty ? "Ce champ est requis" : "Valeur invalide"
  }
}

/**
 * Nombre facultatif : un champ numérique vidé vaut NaN (voir NumberField) ;
 * il est accepté puis ignoré à l'enregistrement.
 */
export const optionalNumber = (schema: z.ZodNumber = z.number()) => z.union([z.nan(), schema]).optional()

/** Valeur numérique exploitable, sinon undefined. */
export const numberOrUndefined = (v?: number) => (v !== undefined && Number.isFinite(v) ? v : undefined)
