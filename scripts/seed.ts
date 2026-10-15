/**
 * Charge le jeu de démonstration dans Supabase et crée un compte de connexion
 * par employé (mot de passe initial : voir DEFAULT_PASSWORD dans lib/access.ts).
 *
 * Usage : pnpm seed            (refuse si la base contient déjà des employés)
 *         pnpm seed --force    (met à jour les lignes existantes, mêmes identifiants)
 *
 * Nécessite NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local.
 */
import { config } from "dotenv"
import { createClient } from "@supabase/supabase-js"

import { DEFAULT_PASSWORD } from "@/lib/access"
import { generateSeed } from "@/lib/data/seed"
import { toDb } from "@/lib/supabase/mapping"

config({ path: ".env.local" })
config()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("✖ Renseignez NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local")
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const force = process.argv.includes("--force")

/** Ordre d'insertion compatible avec les clés étrangères. */
const ORDER = [
  ["warehouses", "warehouses"],
  ["shops", "shops"],
  ["shopTargets", "shop_targets"],
  ["employees", "employees"],
  ["categories", "categories"],
  ["products", "products"],
  ["clients", "clients"],
  ["prospects", "prospects"],
  ["opportunities", "opportunities"],
  ["quotes", "quotes"],
  ["sales", "sales"],
  ["invoices", "invoices"],
  ["payments", "payments"],
  ["followups", "followups"],
  ["stockLevels", "stock_levels"],
  ["stockMovements", "stock_movements"],
  ["campaigns", "campaigns"],
  ["promotions", "promotions"],
  ["appointments", "appointments"],
  ["events", "events"],
  ["attendance", "attendance"],
  ["leaves", "leaves"],
  ["payslips", "payslips"],
  ["expenses", "expenses"],
  ["journalEntries", "journal_entries"],
  ["notifications", "notifications"],
  ["activity", "activity_logs"],
] as const

async function authUserId(email: string, meta: Record<string, string>) {
  const { data, error } = await db.auth.admin.createUser({ email, password: DEFAULT_PASSWORD, email_confirm: true, user_metadata: meta })
  if (data.user) return data.user.id
  if (!/already|registered|exists/i.test(error?.message ?? "")) throw error
  // Compte déjà existant : on le retrouve
  for (let page = 1; ; page++) {
    const { data: list, error: e } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (e) throw e
    const found = list.users.find((u) => u.email?.toLowerCase() === email)
    if (found) return found.id
    if (list.users.length < 1000) throw new Error(`Utilisateur ${email} introuvable`)
  }
}

async function main() {
  const { count } = await db.from("employees").select("id", { count: "exact", head: true })
  if (count && !force) {
    console.error(`✖ La base contient déjà ${count} employé(s). Relancez avec --force pour mettre à jour les données de démonstration.`)
    process.exit(1)
  }

  const seed = generateSeed()
  console.log("→ Création des comptes de connexion…")
  const userIds = new Map<string, string>()
  for (const e of seed.employees) {
    const email = e.email.toLowerCase()
    userIds.set(e.id, await authUserId(email, { employee_id: e.id, first_name: e.firstName, last_name: e.lastName }))
  }

  for (const [collection, table] of ORDER) {
    const rows = (seed[collection] as object[]).map((item) => {
      const row = toDb(item as Record<string, unknown>)
      if (collection === "employees") {
        row.email = String(row.email).toLowerCase()
        row.user_id = userIds.get(String(row.id))
      }
      return row
    })
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict: "id" })
      if (error) {
        console.error(`✖ ${table} : ${error.message}`)
        process.exit(1)
      }
    }
    console.log(`✓ ${table.padEnd(16)} ${rows.length}`)
  }

  console.log(`\nTerminé. Connectez-vous avec l'un des e-mails ci-dessous (mot de passe : ${DEFAULT_PASSWORD}) :`)
  for (const e of seed.employees.filter((x) => x.status === "actif")) console.log(`  ${e.role.padEnd(20)} ${e.email}`)
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e)
  process.exit(1)
})
