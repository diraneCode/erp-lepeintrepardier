"use client"

import { useEffect, useSyncExternalStore } from "react"
import { useQuery, type QueryKey } from "@tanstack/react-query"
import { toast } from "sonner"

import { errorTitle, toUserMessage } from "@/lib/errors"

import type { SeedData } from "@/lib/data/seed"
import { queryClient } from "@/lib/query-client"
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseConfigured } from "@/lib/supabase/env"
import { fromDb, toDb } from "@/lib/supabase/mapping"
import type { AppNotification, Employee, Followup, Invoice, Leave, Expense, Payment, Sale, StockMovement } from "@/lib/types"

/* ---------- Types ---------- */

type Data = Omit<SeedData, "passwords">
type CollectionKey = { [K in keyof Data]: Data[K] extends Array<{ id: string }> ? K : never }[keyof Data]
export type Entity<K extends CollectionKey> = Data[K][number]

interface Actions {
  /* CRUD générique — chaque action renvoie true si l'opération a réussi */
  add: <K extends CollectionKey>(key: K, item: Entity<K>) => Promise<boolean>
  update: <K extends CollectionKey>(key: K, id: string, patch: Partial<Entity<K>>) => Promise<boolean>
  /** Applique la même modification à plusieurs lignes en une seule requête */
  updateMany: <K extends CollectionKey>(key: K, ids: string[], patch: Partial<Entity<K>>) => Promise<boolean>
  remove: <K extends CollectionKey>(key: K, ids: string[]) => Promise<boolean>
  /** Connexion : renvoie un message d'erreur, ou null si réussie */
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  /** Changement de mot de passe : renvoie un message d'erreur, ou null si réussi */
  changePassword: (current: string, next: string) => Promise<string | null>
  setShopTargets: (shopId: string, targets: { period: string; amount: number }[]) => Promise<boolean>
  /** Crée la fiche client à partir d'un prospect ; renvoie le code client */
  convertProspect: (prospectId: string) => Promise<string | null>
  /** Clôture une relance ; programme éventuellement la suivante */
  completeFollowup: (id: string, outcome: string, next?: { dueDate: string; channel: Followup["channel"] }) => Promise<boolean>
  /** Crée les relances manquantes (factures échues, devis envoyés depuis 7 jours) ; renvoie le nombre créé (-1 si échec) */
  generateFollowups: () => Promise<number>
  log: (action: string, module: string, details: string) => void
  markNotificationsRead: (ids?: string[]) => Promise<void>

  /* Actions métier (fonctions SQL transactionnelles) */
  createSale: (sale: Sale, opts?: { createInvoice?: boolean }) => Promise<boolean>
  cancelSale: (id: string) => Promise<boolean>
  createInvoice: (invoice: Invoice) => Promise<boolean>
  recordPayment: (payment: Payment) => Promise<boolean>
  convertQuoteToInvoice: (quoteId: string) => Promise<Invoice | null>
  createStockMovement: (movement: StockMovement) => Promise<boolean>
  setLeaveStatus: (id: string, status: Leave["status"], comment?: string) => Promise<boolean>
  setExpenseStatus: (ids: string[], status: Expense["status"]) => Promise<boolean>
  /** Renvoie le nombre de bulletins créés (-1 si échec) */
  generatePayslips: (period: string) => Promise<number>
}

export type AppState = Data & Actions & { hydrated: boolean; currentUserId: string | null }

/* ---------- Utilitaires ---------- */

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`
}

/**
 * Numéro de document provisoire : PREFIX-AAAA-00001. La base attribue le
 * numéro définitif (séquence transactionnelle) en cas de doublon.
 */
export function nextNumber(prefix: string, existing: { number: string }[], size = 5) {
  const year = new Date().getFullYear()
  const max = existing.reduce((m, x) => {
    const n = Number(x.number.split("-").pop())
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `${prefix}-${year}-${(max + 1).toString().padStart(size, "0")}`
}

/** Code séquentiel provisoire sans année : PREFIX-0001 */
export function nextCode(prefix: string, codes: string[], size = 4) {
  const max = codes.reduce((m, c) => {
    const n = Number(c.split("-").pop())
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `${prefix}-${(max + 1).toString().padStart(size, "0")}`
}

/* ---------- Correspondance collections ↔ tables ---------- */

const TABLES: Record<CollectionKey, string> = {
  warehouses: "warehouses",
  shops: "shops",
  employees: "employees",
  categories: "categories",
  products: "products",
  clients: "clients",
  opportunities: "opportunities",
  quotes: "quotes",
  sales: "sales",
  invoices: "invoices",
  payments: "payments",
  stockLevels: "stock_levels",
  stockMovements: "stock_movements",
  campaigns: "campaigns",
  promotions: "promotions",
  attendance: "attendance",
  leaves: "leaves",
  payslips: "payslips",
  expenses: "expenses",
  journalEntries: "journal_entries",
  shopTargets: "shop_targets",
  prospects: "prospects",
  followups: "followups",
  appointments: "appointments",
  events: "events",
  notifications: "notifications",
  activity: "activity_logs",
}

/** Tri par défaut (les plus récents d'abord) pour un affichage cohérent. */
const ORDER: Partial<Record<CollectionKey, string>> = {
  sales: "date",
  invoices: "date",
  quotes: "date",
  payments: "date",
  stockMovements: "date",
  expenses: "date",
  journalEntries: "date",
  attendance: "date",
  leaves: "requested_at",
  notifications: "date",
  activity: "date",
  clients: "created_at",
  prospects: "created_at",
  followups: "due_date",
  appointments: "date",
  events: "start_date",
  payslips: "period",
}

/** Tables modifiées en cascade par les déclencheurs SQL. */
const DEPENDENTS: Partial<Record<CollectionKey, CollectionKey[]>> = {
  invoices: ["journalEntries"],
  payments: ["invoices", "journalEntries"],
  stockMovements: ["stockLevels"],
  expenses: ["journalEntries"],
  products: ["stockLevels"],
  warehouses: ["stockLevels"],
  shops: ["stockLevels", "shopTargets"],
}

const isCollection = (k: string): k is CollectionKey => k in TABLES
const ACTIVITY_LIMIT = 500
const PAGE = 1000

export const dbKey = (key: CollectionKey): QueryKey => ["db", key]
const ME_KEY: QueryKey = ["me"]

/* ---------- Erreurs ---------- */

type DbError = { code?: string; message?: string; details?: string } | null | undefined

/** Message lisible (jamais de détail technique), voir lib/errors.ts. */
export function errorMessage(error: DbError | Error | unknown): string {
  return toUserMessage(error)
}

/** Affiche l'erreur à l'utilisateur ; le détail technique ne va qu'en console. */
function fail(error: DbError | Error | unknown) {
  console.error(error)
  toast.error(errorTitle(error), { description: errorMessage(error) })
  return false as const
}

const BY_SAME_PASSWORD = "Le nouveau mot de passe doit être différent de l'actuel."

/* ---------- Lecture ---------- */

async function fetchTable<T>(table: string, order?: string, limit?: number): Promise<T[]> {
  const supabase = getSupabase()
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select("*")
    q = order ? q.order(order, { ascending: false }).order("id") : q.order("id")
    const to = limit ? Math.min(from + PAGE, limit) - 1 : from + PAGE - 1
    const { data, error } = await q.range(from, to)
    if (error) throw error
    rows.push(...data.map((r) => fromDb<T>(r)))
    if (data.length < to - from + 1 || (limit && rows.length >= limit)) break
  }
  return rows
}

/** Employé connecté (fiche complète, accessible à lui-même). */
async function fetchMe(): Promise<Employee | null> {
  if (!isSupabaseConfigured) return null
  const supabase = getSupabase()
  const { data: session } = await supabase.auth.getSession()
  const authId = session.session?.user.id
  if (!authId) return null
  const { data, error } = await supabase.from("employees").select("*").eq("user_id", authId).maybeSingle()
  if (error) throw error
  return data ? fromDb<Employee>(data) : null
}

/** Annuaire : fiches complètes pour l'administration, colonnes non sensibles pour les autres. */
async function fetchEmployees(): Promise<Employee[]> {
  const me = await queryClient.ensureQueryData({ queryKey: ME_KEY, queryFn: fetchMe })
  if (me?.role === "super_admin") return fetchTable<Employee>("employees", undefined)
  const { data, error } = await getSupabase().rpc("employee_directory")
  if (error) throw error
  return (data as Record<string, unknown>[]).map((row) => {
    const { photo, ...rest } = row
    if (me && rest.id === me.id) return me
    return {
      ...fromDb<Employee>(rest),
      documents: photo ? { photo } : {},
      // Données RH non communiquées hors administration
      hireDate: "",
      baseSalary: 0,
      contractType: "cdi",
      cnpsNumber: "",
      address: "",
      maritalStatus: "celibataire",
    } as Employee
  })
}

async function fetchCollection(key: CollectionKey): Promise<unknown[]> {
  if (key === "employees") return fetchEmployees()
  const rows = await fetchTable<Record<string, unknown>>(TABLES[key], ORDER[key], key === "activity" ? ACTIVITY_LIMIT : undefined)
  if (key === "notifications") {
    const me = queryClient.getQueryData<Employee | null>(ME_KEY)
    return rows.map((n) => ({ ...n, read: Array.isArray(n.readBy) && !!me && (n.readBy as string[]).includes(me.id) }))
  }
  return rows
}

/**
 * Données de référence (catalogue, sites, annuaire) : elles changent rarement,
 * on les garde en mémoire 30 minutes sans les recharger. Les données
 * transactionnelles sont revalidées après 1 minute.
 */
const REFERENCE: ReadonlySet<CollectionKey> = new Set(["warehouses", "shops", "categories", "products", "employees", "shopTargets", "promotions", "campaigns"])

const collectionQuery = (key: CollectionKey) => ({
  queryKey: dbKey(key),
  queryFn: () => fetchCollection(key),
  staleTime: REFERENCE.has(key) ? 30 * 60_000 : 60_000,
  refetchOnWindowFocus: !REFERENCE.has(key),
})

/* ---------- Cache ---------- */

const EMPTY: never[] = []

function getCached<K extends CollectionKey>(key: K): Data[K] {
  return (queryClient.getQueryData<Data[K]>(dbKey(key)) ?? EMPTY) as Data[K]
}

function setCached<K extends CollectionKey>(key: K, fn: (rows: Data[K]) => Data[K]) {
  queryClient.setQueryData<Data[K]>(dbKey(key), (old) => (old ? fn(old) : old))
}

function refresh(...keys: CollectionKey[]) {
  const all = new Set<CollectionKey>()
  for (const k of keys) {
    all.add(k)
    DEPENDENTS[k]?.forEach((d) => all.add(d))
  }
  all.add("activity")
  all.forEach((k) => void queryClient.invalidateQueries({ queryKey: dbKey(k) }))
  void queryClient.invalidateQueries({ queryKey: NAV_KEY })
}

const me = () => queryClient.getQueryData<Employee | null>(ME_KEY) ?? null
const todayIso = () => new Date().toLocaleDateString("sv-SE")

/** Prépare une ligne pour l'écriture : supprime le flag local et les clés vides. */
function row(obj: object) {
  return toDb(obj as Record<string, unknown>)
}

/* ---------- Employés : comptes de connexion gérés côté serveur ---------- */

async function employeeApi(method: "POST" | "PATCH" | "DELETE", body: unknown) {
  let res: Response
  try {
    res = await fetch("/api/admin/employees", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return fail(new TypeError("Failed to fetch"))
  }
  if (res.ok) return true
  const payload = (await res.json().catch(() => null)) as { error?: string } | null
  return fail({ message: payload?.error ?? "", status: res.status })
}

/* ---------- Actions ---------- */

const rawActions: Actions = {
  add: async (key, item) => {
    if (key === "employees") {
      const ok = await employeeApi("POST", item)
      refresh("employees")
      return ok
    }
    setCached(key, (rows) => [item, ...rows] as typeof rows)
    const { error } = await getSupabase().from(TABLES[key]).insert(row(item))
    refresh(key)
    return error ? fail(error) : true
  },

  update: async (key, id, patch) => {
    setCached(key, (rows) => (rows as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) as typeof rows)
    if (key === "employees") {
      const ok = await employeeApi("PATCH", { id, patch })
      refresh("employees")
      void queryClient.invalidateQueries({ queryKey: ME_KEY })
      return ok
    }
    const { error } = await getSupabase().from(TABLES[key]).update(row(patch)).eq("id", id)
    refresh(key)
    return error ? fail(error) : true
  },

  updateMany: async (key, ids, patch) => {
    if (!ids.length) return true
    if (key === "employees") {
      for (const id of ids) if (!(await rawActions.update(key, id, patch))) return false
      return true
    }
    const set = new Set(ids)
    setCached(key, (rows) => (rows as { id: string }[]).map((x) => (set.has(x.id) ? { ...x, ...patch } : x)) as typeof rows)
    const { error, count } = await getSupabase().from(TABLES[key]).update(row(patch), { count: "exact" }).in("id", ids)
    refresh(key)
    if (error) return fail(error)
    if (count !== null && count < ids.length) return fail({ code: "42501" })
    return true
  },

  remove: async (key, ids) => {
    if (!ids.length) return true
    const set = new Set(ids)
    setCached(key, (rows) => (rows as { id: string }[]).filter((x) => !set.has(x.id)) as typeof rows)
    if (key === "employees") {
      const ok = await employeeApi("DELETE", { ids })
      refresh("employees")
      return ok
    }
    const { error, count } = await getSupabase().from(TABLES[key]).delete({ count: "exact" }).in("id", ids)
    refresh(key)
    if (error) return fail(error)
    // La RLS ignore silencieusement les lignes non autorisées
    if (count !== null && count < ids.length) return fail({ code: "42501" })
    return true
  },

  login: async (email, password) => {
    const supabase = getSupabase()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) {
      console.error(error)
      return errorMessage(error)
    }
    queryClient.clear()
    const user = await queryClient.fetchQuery({ queryKey: ME_KEY, queryFn: fetchMe })
    if (!user) {
      await supabase.auth.signOut()
      queryClient.clear()
      return "Ce compte est désactivé ou n'est rattaché à aucun employé. Contactez les ressources humaines."
    }
    rawActions.log("Connexion", "Compte", "Connexion à la plateforme")
    return null
  },

  logout: async () => {
    await getSupabase().auth.signOut()
    queryClient.clear()
  },

  changePassword: async (current, next) => {
    const supabase = getSupabase()
    const { data } = await supabase.auth.getSession()
    const email = data.session?.user.email
    if (!email) return "Votre session a expiré. Reconnectez-vous."
    // Vérifie le mot de passe actuel avant de le remplacer
    const check = await supabase.auth.signInWithPassword({ email, password: current })
    if (check.error) {
      console.error(check.error)
      return /invalid login credentials/i.test(check.error.message) ? "Mot de passe actuel incorrect." : errorMessage(check.error)
    }
    const { error } = await supabase.auth.updateUser({ password: next })
    if (error) {
      console.error(error)
      if (/different from the old/i.test(error.message)) return BY_SAME_PASSWORD
      if (/weak|at least|characters/i.test(error.message)) return "Mot de passe trop faible : choisissez-en un plus robuste."
      return errorMessage(error)
    }
    rawActions.log("Sécurité", "Compte", "Changement de mot de passe")
    return null
  },

  setShopTargets: async (shopId, targets) => {
    const { error } = await getSupabase()
      .from("shop_targets")
      .upsert(targets.map((t) => ({ shop_id: shopId, period: t.period, amount: t.amount })), { onConflict: "shop_id,period" })
    refresh("shopTargets")
    if (error) return fail(error)
    rawActions.log("Objectifs", "Boutiques", `${targets.length} objectif(s) mensuel(s) mis à jour`)
    return true
  },

  convertProspect: async (prospectId) => {
    const { data, error } = await getSupabase().rpc("convert_prospect", { p_id: prospectId })
    refresh("prospects", "clients", "followups")
    if (error) {
      fail(error)
      return null
    }
    return (data as string | null) ?? null
  },

  completeFollowup: async (id, outcome, next) => {
    setCached("followups", (rows) => rows.map((f) => (f.id === id ? { ...f, status: "fait", outcome, doneAt: todayIso() } : f)))
    const { error } = await getSupabase().rpc("complete_followup", {
      p_id: id,
      p_outcome: outcome,
      p_next_date: next?.dueDate ?? null,
      p_next_channel: next?.channel ?? null,
    })
    refresh("followups", "prospects")
    return error ? fail(error) : true
  },

  generateFollowups: async () => {
    const { data, error } = await getSupabase().rpc("generate_followups")
    refresh("followups")
    if (error) {
      fail(error)
      return -1
    }
    return Number(data ?? 0)
  },

  log: (action, module, details) => {
    const user = me()
    if (!user) return
    void getSupabase()
      .from("activity_logs")
      .insert({ user_id: user.id, action, module, details })
      .then(() => queryClient.invalidateQueries({ queryKey: dbKey("activity") }))
  },

  markNotificationsRead: async (ids) => {
    setCached("notifications", (rows) => rows.map((n: AppNotification) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)))
    const { error } = await getSupabase().rpc("mark_notifications_read", { p_ids: ids ?? null })
    if (error) fail(error)
    void queryClient.invalidateQueries({ queryKey: dbKey("notifications") })
  },

  createSale: async (sale, opts) => {
    setCached("sales", (rows) => [sale, ...rows])
    const { error } = await getSupabase().rpc("create_sale", { p_sale: row(sale), p_create_invoice: !!opts?.createInvoice })
    refresh("sales", "invoices", "payments", "stockMovements", "clients")
    return error ? fail(error) : true
  },

  cancelSale: async (id) => {
    const { error } = await getSupabase().rpc("cancel_sale", { p_id: id })
    refresh("sales", "invoices", "stockMovements")
    return error ? fail(error) : true
  },

  createInvoice: async (invoice) => {
    const ok = await rawActions.add("invoices", invoice)
    if (ok) rawActions.log("Création", "Facturation", `Facture ${invoice.number}`)
    return ok
  },

  recordPayment: async (payment) => {
    const ok = await rawActions.add("payments", payment)
    if (ok) rawActions.log("Encaissement", "Facturation", `${payment.reference} — ${payment.amount} FCFA`)
    return ok
  },

  convertQuoteToInvoice: async (quoteId) => {
    const { data, error } = await getSupabase().rpc("convert_quote_to_invoice", { p_quote_id: quoteId })
    refresh("quotes", "invoices")
    if (error) {
      fail(error)
      return null
    }
    return fromDb<Invoice>(data as Record<string, unknown>)
  },

  createStockMovement: async (movement) => {
    const ok = await rawActions.add("stockMovements", { ...movement, userId: me()?.id ?? movement.userId })
    if (ok) rawActions.log("Mouvement", "Stock", `${movement.reference} (${movement.type})`)
    return ok
  },

  setLeaveStatus: async (id, status, comment) => {
    const ok = await rawActions.update("leaves", id, { status, comment, approverId: me()?.id })
    if (ok) rawActions.log("Décision", "Congés", `Demande ${status}`)
    return ok
  },

  setExpenseStatus: async (ids, status) => {
    const patch = { status, approvedBy: status === "en_attente" ? undefined : me()?.id }
    setCached("expenses", (rows) => rows.map((e) => (ids.includes(e.id) ? { ...e, ...patch } : e)))
    const { error } = await getSupabase().from("expenses").update(row(patch)).in("id", ids)
    refresh("expenses")
    if (error) return fail(error)
    rawActions.log("Statut", "Dépenses", `${ids.length} dépense(s) → ${status}`)
    return true
  },

  generatePayslips: async (period) => {
    const { data, error } = await getSupabase().rpc("generate_payslips", { p_period: period })
    refresh("payslips")
    if (error) {
      fail(error)
      return -1
    }
    return Number(data ?? 0)
  },
}

/** Valeur renvoyée par une action interrompue par une exception inattendue. */
const FALLBACK: Partial<Record<keyof Actions, unknown>> = {
  login: "Connexion impossible pour le moment. Réessayez.",
  changePassword: "Modification impossible pour le moment. Réessayez.",
  convertProspect: null,
  convertQuoteToInvoice: null,
  generateFollowups: -1,
  generatePayslips: -1,
  logout: undefined,
  markNotificationsRead: undefined,
}

/**
 * Aucune action ne rejette sa promesse : une exception (réseau coupé, réponse
 * inattendue) est affichée à l'utilisateur et l'action renvoie une valeur d'échec.
 */
const actions = Object.fromEntries(
  Object.entries(rawActions).map(([name, fn]) => {
    if (name === "log") return [name, fn]
    const guarded = async (...args: unknown[]) => {
      try {
        return await (fn as (...a: unknown[]) => Promise<unknown>)(...args)
      } catch (error) {
        console.error(error)
        fail(error as Error)
        return name in FALLBACK ? FALLBACK[name as keyof Actions] : false
      }
    }
    return [name, guarded]
  })
) as unknown as Actions

/* ---------- Façade useStore ---------- */

/** Détermine la clé lue par un sélecteur de la forme `(s) => s.cle`. */
function selectedKey(selector: (s: AppState) => unknown): string {
  let key = ""
  const probe = new Proxy({} as AppState, {
    get(_, prop) {
      if (!key) key = String(prop)
      return undefined
    },
  })
  try {
    selector(probe)
  } catch {
    // Le sélecteur ne lit qu'une clé : l'erreur éventuelle vient du `undefined` renvoyé
  }
  return key
}

/** Employé connecté, chargé depuis la session Supabase. */
export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 5 * 60_000 })
}

/**
 * Accès aux données et actions avec la même API qu'auparavant :
 * `useStore((s) => s.sales)` charge (et met en cache) la table « sales »,
 * `useStore((s) => s.add)` renvoie l'action correspondante.
 */
export function useStore<T>(selector: (s: AppState) => T): T {
  const key = selectedKey(selector as (s: AppState) => unknown)
  const collection = isCollection(key) ? key : null
  const meQuery = useMe()
  const rows = useCollection(collection ?? "warehouses", !!collection)

  if (collection) return rows as T
  if (key === "currentUserId") return (meQuery.data?.id ?? null) as T
  if (key === "hydrated") return !meQuery.isPending as T
  return actions[key as keyof Actions] as T
}

/**
 * Charge une table (une seule requête partagée par tous les composants) et la
 * garde en cache. `enabled: false` ne déclenche aucun chargement : on ne charge
 * que ce qui est réellement affiché.
 */
export function useCollection<K extends CollectionKey>(key: K, enabled = true): Data[K] {
  const { data: user } = useMe()
  const q = useQuery({ ...collectionQuery(key), enabled: enabled && !!user })
  return (enabled ? (q.data ?? EMPTY) : EMPTY) as Data[K]
}

/**
 * État des données utilisées par les composants affichés : premier chargement
 * en cours, ou échec sans données à montrer.
 */
export function useDbStatus() {
  const snapshot = useSyncExternalStore(subscribeCache, dbSnapshot, serverSnapshot)
  const [loading, failed] = snapshot.split("|").map(Number)
  return { loading: loading > 0, failed: failed > 0, retry: retryFailed }
}

const subscribeCache = (cb: () => void) => queryClient.getQueryCache().subscribe(cb)
const serverSnapshot = () => "0|0"
const activeDbQueries = () =>
  queryClient
    .getQueryCache()
    .findAll({ queryKey: ["db"] })
    .filter((q) => q.isActive() && q.state.data === undefined)
function dbSnapshot() {
  const qs = activeDbQueries()
  return `${qs.filter((q) => q.state.fetchStatus === "fetching").length}|${qs.filter((q) => q.state.status === "error" && q.state.fetchStatus === "idle").length}`
}
/** Lecture ponctuelle de l'état des données affichées. */
export function readDbStatus() {
  const [loading, failed] = dbSnapshot().split("|").map(Number)
  return { loading: loading > 0, failed: failed > 0 }
}
function retryFailed() {
  activeDbQueries()
    .filter((q) => q.state.status === "error")
    .forEach((q) => void queryClient.refetchQueries({ queryKey: q.queryKey, exact: true }))
}

const NAV_KEY: QueryKey = ["nav-counters"]

/** Compteurs de la barre latérale (fonction SQL nav_counters, soumise à la RLS). */
export function useNavCounters() {
  const { data: user } = useMe()
  const { data } = useQuery({
    queryKey: NAV_KEY,
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc("nav_counters")
      if (error) throw error
      return data as { leaves: number; invoices: number; stock: number; expenses: number; followups: number }
    },
    enabled: !!user,
    staleTime: 60_000,
  })
  return data
}

/** Lecture ponctuelle hors rendu (gestionnaires d'évènements, validations). */
useStore.getState = (): AppState =>
  new Proxy({} as AppState, {
    get(_, prop: string) {
      if (isCollection(prop)) return getCached(prop)
      if (prop === "currentUserId") return me()?.id ?? null
      if (prop === "hydrated") return queryClient.getQueryState(ME_KEY)?.status === "success"
      return actions[prop as keyof Actions]
    },
  })

/** Précharge une collection (ex. avant d'ouvrir un formulaire). */
export function prefetchCollection(key: CollectionKey) {
  return queryClient.prefetchQuery(collectionQuery(key))
}

/**
 * Synchronise le cache avec la session : vidage à la déconnexion (aucune donnée
 * d'un compte ne reste visible pour le suivant), rechargement à la connexion.
 */
export function useAuthSync() {
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") queryClient.clear()
      if (event === "USER_UPDATED") void queryClient.invalidateQueries({ queryKey: ME_KEY })
    })
    return () => data.subscription.unsubscribe()
  }, [])
}
