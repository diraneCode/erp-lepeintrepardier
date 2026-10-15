/** Variables publiques (exposées au navigateur, protégées par la RLS). */
export const SUPABASE_URL = normalizeUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
/** Clé « anon » (ou « publishable ») du projet : sans privilège hors RLS. */
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export function assertSupabaseEnv() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase n'est pas configuré : renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local")
  }
}

/**
 * Ne garde que l'origine (https://<projet>.supabase.co) : une URL copiée avec
 * un chemin (/rest/v1/…) ferait échouer l'authentification
 * (« Invalid path specified in request URL »).
 */
function normalizeUrl(url: string) {
  try {
    return url ? new URL(url.trim()).origin : ""
  } catch {
    return url.trim()
  }
}
