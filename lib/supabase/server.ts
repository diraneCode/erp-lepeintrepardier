import "server-only"

import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseEnv } from "@/lib/supabase/env"

/** Client serveur agissant au nom de l'utilisateur connecté (RLS appliquée). */
export async function createSupabaseServerClient() {
  assertSupabaseEnv()
  const store = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          // Appel depuis un contexte en lecture seule : le proxy rafraîchit la session.
        }
      },
    },
  })
}
