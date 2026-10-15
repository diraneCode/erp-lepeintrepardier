"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseEnv } from "@/lib/supabase/env"

let client: SupabaseClient | null = null

/** Client navigateur unique (session stockée en cookies, partagée avec le serveur). */
export function getSupabase() {
  if (!client) {
    assertSupabaseEnv()
    client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return client
}
