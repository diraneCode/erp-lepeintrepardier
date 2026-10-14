import { z } from "zod"

// Messages de validation par défaut en français (complète les messages personnalisés)
z.config(z.locales.fr())

/**
 * Nombre facultatif : un champ numérique vidé vaut NaN (voir NumberField) ;
 * il est accepté puis ignoré à l'enregistrement.
 */
export const optionalNumber = (schema: z.ZodNumber = z.number()) => z.union([z.nan(), schema]).optional()

/** Valeur numérique exploitable, sinon undefined. */
export const numberOrUndefined = (v?: number) => (v !== undefined && Number.isFinite(v) ? v : undefined)
