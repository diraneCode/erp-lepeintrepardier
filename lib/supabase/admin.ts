import "server-only"

import { createClient } from "@supabase/supabase-js"

import { SUPABASE_URL } from "@/lib/supabase/env"

/**
 * Client « service_role » : contourne la RLS. À n'utiliser que côté serveur,
 * après avoir vérifié les droits de l'appelant. La clé ne doit jamais être
 * exposée au navigateur (pas de préfixe NEXT_PUBLIC_).
 */
export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante côté serveur")
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
