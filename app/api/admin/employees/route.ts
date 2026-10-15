import { NextResponse } from "next/server"
import { z } from "zod"

import { DEFAULT_PASSWORD } from "@/lib/access"
import { toUserMessage } from "@/lib/errors"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { toDb } from "@/lib/supabase/mapping"
import { isSupabaseConfigured } from "@/lib/supabase/env"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Gestion des comptes employés (création du compte de connexion, synchronisation
 * de l'e-mail, désactivation, suppression, réinitialisation du mot de passe).
 * Réservé au super administrateur ; la clé service_role ne quitte jamais le serveur.
 */

const ROLES = ["super_admin", "caissiere", "gestionnaire_stock", "commercial", "magasinier"] as const
const STATUSES = ["actif", "conge", "suspendu", "sorti"] as const
const INACTIVE = new Set(["suspendu", "sorti"])
/** Durée de blocage d'un compte désactivé (~100 ans) */
const BAN = "876000h"

const fileSchema = z.object({ id: z.string(), name: z.string(), size: z.number(), type: z.string() }).loose()

const employeeSchema = z
  .object({
    id: z.string().min(1).max(100),
    matricule: z.string().max(30).default(""),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    gender: z.enum(["H", "F"]),
    email: z.email().max(200),
    phone: z.string().max(40),
    birthDate: z.string().optional(),
    hireDate: z.string(),
    department: z.string().max(60),
    position: z.string().max(100),
    contractType: z.enum(["cdi", "cdd", "stage", "interim"]),
    baseSalary: z.number().min(0),
    locationId: z.string().max(100),
    status: z.enum(STATUSES),
    cnpsNumber: z.string().max(60).default(""),
    bankAccount: z.string().max(60).optional(),
    address: z.string().max(300).default(""),
    maritalStatus: z.enum(["celibataire", "marie", "divorce", "veuf"]),
    children: z.number().int().min(0).max(20).optional(),
    documents: z.record(z.enum(["photo", "cni", "cv", "plan", "diplome"]), fileSchema).optional(),
    emergencyContact: z.object({ name: z.string(), relation: z.string(), phone: z.string() }).loose().optional(),
    role: z.enum(ROLES),
  })
  .strip()

const patchSchema = z.object({
  id: z.string().min(1),
  patch: employeeSchema.omit({ id: true }).partial().optional(),
  resetPassword: z.boolean().optional(),
})

const deleteSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) })

const error = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

/** Vérifie que l'appelant est un super administrateur actif. */
async function requireAdmin() {
  if (!isSupabaseConfigured) return null
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getClaims()
  const sub = data?.claims?.sub
  if (!sub) return null
  const { data: me } = await supabase.from("employees").select("id, role, status").eq("user_id", sub).maybeSingle()
  if (!me || me.role !== "super_admin" || INACTIVE.has(me.status)) return null
  return me as { id: string; role: string; status: string }
}

async function readJson(request: Request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/** Réponse d'erreur sans détail technique (le détail est journalisé côté serveur). */
function dbError(e: { code?: string; message?: string } | null) {
  console.error("[api/admin/employees]", e)
  if (e?.code === "23505") return error("Un employé utilise déjà ce matricule ou cet e-mail.", 409)
  if (e?.code === "23503") return error("Cet employé est lié à des ventes, clients ou documents : passez plutôt son statut à « Sorti ».", 409)
  return error(toUserMessage(e, "L'enregistrement de l'employé a échoué. Réessayez."), 500)
}

function authError(e: { code?: string; message?: string; status?: number } | null, fallback: string) {
  console.error("[api/admin/employees]", e)
  if (/already|registered|exists/i.test(e?.message ?? "")) return error("Un compte existe déjà avec cette adresse e-mail.", 409)
  return error(toUserMessage(e, fallback), 500)
}

async function handlePOST(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return error("Action réservée au super administrateur.", 403)
  const parsed = employeeSchema.safeParse(await readJson(request))
  if (!parsed.success) return error("Certaines informations de l'employé sont invalides. Vérifiez le formulaire.")
  const employee = parsed.data
  const db = createSupabaseAdminClient()

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email: employee.email.toLowerCase(),
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { employee_id: employee.id, first_name: employee.firstName, last_name: employee.lastName },
    ...(INACTIVE.has(employee.status) ? { ban_duration: BAN } : {}),
  })
  if (createError || !created.user) return authError(createError, "La création du compte de connexion a échoué. Réessayez.")

  const { error: insertError } = await db
    .from("employees")
    .insert({ ...toDb({ ...employee, email: employee.email.toLowerCase() }), user_id: created.user.id })
  if (insertError) {
    // Annule la création du compte pour ne pas laisser d'utilisateur orphelin
    await db.auth.admin.deleteUser(created.user.id)
    return dbError(insertError)
  }
  await db.from("activity_logs").insert({ user_id: admin.id, action: "Création", module: "Employés", details: `${employee.firstName} ${employee.lastName}` })
  return NextResponse.json({ ok: true }, { status: 201 })
}

async function handlePATCH(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return error("Action réservée au super administrateur.", 403)
  const parsed = patchSchema.safeParse(await readJson(request))
  if (!parsed.success) return error("Les informations envoyées sont incomplètes ou invalides.")
  const { id, patch, resetPassword } = parsed.data
  const db = createSupabaseAdminClient()

  const { data: current } = await db.from("employees").select("id, user_id, email, status, role").eq("id", id).maybeSingle()
  if (!current) return error("Employé introuvable.", 404)

  if (id === admin.id && patch && ((patch.role && patch.role !== "super_admin") || (patch.status && INACTIVE.has(patch.status)))) {
    return error("Vous ne pouvez pas retirer vos propres droits d'administration ni désactiver votre compte.")
  }

  if (resetPassword) {
    if (!current.user_id) return error("Cet employé n'a pas de compte de connexion.")
    const { error: e } = await db.auth.admin.updateUserById(current.user_id, { password: DEFAULT_PASSWORD })
    if (e) return authError(e, "La réinitialisation du mot de passe a échoué. Réessayez.")
    await db.from("activity_logs").insert({ user_id: admin.id, action: "Sécurité", module: "Employés", details: `Réinitialisation du mot de passe (${current.email})` })
    return NextResponse.json({ ok: true })
  }

  if (!patch || !Object.keys(patch).length) return NextResponse.json({ ok: true })
  const email = patch.email?.toLowerCase()

  // Synchronise le compte de connexion (e-mail, blocage si suspendu / sorti)
  if (current.user_id) {
    const attrs: { email?: string; email_confirm?: boolean; ban_duration?: string } = {}
    if (email && email !== current.email) Object.assign(attrs, { email, email_confirm: true })
    if (patch.status && INACTIVE.has(patch.status) !== INACTIVE.has(current.status)) attrs.ban_duration = INACTIVE.has(patch.status) ? BAN : "none"
    if (Object.keys(attrs).length) {
      const { error: e } = await db.auth.admin.updateUserById(current.user_id, attrs)
      if (e) return authError(e, "La mise à jour du compte de connexion a échoué. Réessayez.")
    }
  }

  const { error: updateError } = await db
    .from("employees")
    .update(toDb({ ...patch, ...(email ? { email } : {}) }))
    .eq("id", id)
  if (updateError) return dbError(updateError)
  return NextResponse.json({ ok: true })
}

async function handleDELETE(request: Request) {
  const admin = await requireAdmin()
  if (!admin) return error("Action réservée au super administrateur.", 403)
  const parsed = deleteSchema.safeParse(await readJson(request))
  if (!parsed.success) return error("Les informations envoyées sont incomplètes ou invalides.")
  const ids = parsed.data.ids.filter((id) => id !== admin.id)
  if (!ids.length) return error("Vous ne pouvez pas supprimer votre propre compte.")
  const db = createSupabaseAdminClient()

  const { data: rows } = await db.from("employees").select("id, user_id, documents").in("id", ids)
  const { error: deleteError } = await db.from("employees").delete().in("id", ids)
  if (deleteError) return dbError(deleteError)

  for (const row of rows ?? []) {
    if (row.user_id) await db.auth.admin.deleteUser(row.user_id)
  }
  // Supprime les pièces du dossier de chaque employé
  for (const id of ids) {
    const { data: files } = await db.storage.from("employee-files").list(`employees/${id}`)
    if (files?.length) await db.storage.from("employee-files").remove(files.map((f) => `employees/${id}/${f.name}`))
  }
  return NextResponse.json({ ok: true })
}

/** Toute exception inattendue renvoie un message neutre (détail dans les journaux serveur). */
function guarded(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      return await handler(request)
    } catch (e) {
      console.error("[api/admin/employees]", e)
      return error("Le serveur n'a pas pu traiter la demande. Réessayez dans un instant.", 500)
    }
  }
}

export const POST = guarded(handlePOST)
export const PATCH = guarded(handlePATCH)
export const DELETE = guarded(handleDELETE)
