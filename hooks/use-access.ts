"use client"

import { useCallback, useMemo } from "react"

import { ROLE_LABEL, permissionFor, seesAllClients, type ModuleKey, type Permission } from "@/lib/access"
import { useCollection, useMe } from "@/lib/store"
import type { Employee } from "@/lib/types"

/** Employé connecté (null si aucune session). */
export function useCurrentUser(): Employee | null {
  return useMe().data ?? null
}

export interface ModuleAccess extends Permission {
  /** Voit les données de toute l'entreprise (filtres par personne autorisés) */
  global: boolean
}

export function useAccess() {
  const user = useCurrentUser()
  const role = user?.role

  const access = useCallback(
    (module: ModuleKey): ModuleAccess | null => {
      const p = permissionFor(role, module)
      return p ? { ...p, global: p.scope === "all" } : null
    },
    [role]
  )

  return {
    user,
    role,
    roleLabel: role ? ROLE_LABEL[role] : "",
    isSuperAdmin: role === "super_admin",
    access,
    can: (module: ModuleKey) => access(module) !== null,
  }
}

/** Permission obligatoire pour une page : la garde de route empêche d'y arriver sans accès. */
export function useModuleAccess(module: ModuleKey): ModuleAccess {
  const { access } = useAccess()
  return access(module) ?? { scope: "own", write: false, global: false }
}

/** Options de clients limitées au périmètre de l'utilisateur (formulaires). */
export function useScopedClientOptions() {
  const { clients } = useScopedData(["clients"])
  return useMemo(() => clients.map((c) => ({ value: c.id, label: c.name, hint: c.code })), [clients])
}

export type ScopedKey =
  | "prospects" | "followups" | "appointments" | "clients" | "clientIds" | "myClients" | "opportunities" | "quotes" | "sales"
  | "invoices" | "payments" | "expenses" | "stockLevels" | "stockMovements" | "shops" | "warehouses"

type Table = Parameters<typeof useCollection>[0]

/** Tables nécessaires pour calculer chaque collection filtrée. */
const NEEDS: Record<ScopedKey, Table[]> = {
  prospects: ["prospects"],
  followups: ["followups"],
  appointments: ["appointments", "employees"],
  clients: ["clients", "sales"],
  clientIds: ["clients", "sales"],
  myClients: ["clients", "sales"],
  opportunities: ["opportunities"],
  quotes: ["quotes"],
  sales: ["sales"],
  invoices: ["invoices", "sales", "clients", "quotes"],
  payments: ["payments", "invoices", "sales", "clients", "quotes"],
  expenses: ["expenses"],
  stockLevels: ["stockLevels"],
  stockMovements: ["stockMovements"],
  shops: ["shops"],
  warehouses: ["warehouses"],
}

/**
 * Collections filtrées selon la portée de l'utilisateur pour chaque module :
 * - all  : toutes les données
 * - shop : données de son site d'affectation (boutique, entrepôt)
 * - own  : ses propres enregistrements (clients suivis, ventes réalisées…)
 *
 * `keys` liste les collections utilisées : seules les tables correspondantes
 * sont chargées (les autres restent vides).
 */
export function useScopedData(keys: readonly ScopedKey[]) {
  const { user, access } = useAccess()
  const need = new Set(keys.flatMap((k) => NEEDS[k]))
  const clients = useCollection("clients", need.has("clients"))
  const opportunities = useCollection("opportunities", need.has("opportunities"))
  const quotes = useCollection("quotes", need.has("quotes"))
  const sales = useCollection("sales", need.has("sales"))
  const invoices = useCollection("invoices", need.has("invoices"))
  const payments = useCollection("payments", need.has("payments"))
  const expenses = useCollection("expenses", need.has("expenses"))
  const stockLevels = useCollection("stockLevels", need.has("stockLevels"))
  const stockMovements = useCollection("stockMovements", need.has("stockMovements"))
  const shops = useCollection("shops", need.has("shops"))
  const warehouses = useCollection("warehouses", need.has("warehouses"))
  const prospects = useCollection("prospects", need.has("prospects"))
  const followups = useCollection("followups", need.has("followups"))
  const appointments = useCollection("appointments", need.has("appointments"))
  const employees = useCollection("employees", need.has("employees"))

  return useMemo(() => {
    const me = user?.id ?? ""
    const loc = user?.locationId ?? ""
    const scope = (m: ModuleKey) => access(m)?.scope

    const salesScope = scope("ventes") ?? scope("dashboard")
    const scopedSales =
      salesScope === "all" ? sales : salesScope === "shop" ? sales.filter((s) => s.boutiqueId === loc) : sales.filter((s) => s.sellerId === me)

    const clientScope = scope("clients") ?? scope("dashboard")
    // Clients « à soi » : ceux qu'on suit ou à qui l'on a vendu (shop : ceux de sa boutique)
    let myClients = clients
    if (clientScope === "own") {
      const soldTo = new Set(sales.filter((s) => s.sellerId === me && s.clientId).map((s) => s.clientId))
      myClients = clients.filter((c) => c.ownerId === me || soldTo.has(c.id))
    } else if (clientScope === "shop") {
      const boughtHere = new Set(sales.filter((s) => s.boutiqueId === loc && s.clientId).map((s) => s.clientId))
      myClients = clients.filter((c) => boughtHere.has(c.id) || c.ownerId === me)
    }
    // Ceux qui facturent voient (et peuvent choisir) tous les clients
    const scopedClients = seesAllClients(user?.role) ? clients : myClients
    const clientIds = new Set(scopedClients.map((c) => c.id))

    const invoiceScope = scope("facturation") ?? scope("dashboard")
    let scopedInvoices = invoices
    if (invoiceScope === "own") {
      const mySales = new Set(sales.filter((s) => s.sellerId === me).map((s) => s.id))
      const ownedClients = new Set(clients.filter((c) => c.ownerId === me).map((c) => c.id))
      const myQuotes = new Set(quotes.filter((q) => q.ownerId === me).map((q) => q.id))
      // Ses ventes, ses clients, et les factures issues de ses proformas
      scopedInvoices = invoices.filter((i) => (i.saleId && mySales.has(i.saleId)) || ownedClients.has(i.clientId) || (i.quoteId && myQuotes.has(i.quoteId)))
    } else if (invoiceScope === "shop") {
      scopedInvoices = invoices.filter((i) => i.boutiqueId === loc)
    }
    const invoiceIds = new Set(scopedInvoices.map((i) => i.id))

    const ownOnly = <T,>(rows: T[], module: ModuleKey, owner: (r: T) => string) => (scope(module) === "all" ? rows : rows.filter((r) => owner(r) === me))

    const expenseScope = scope("depenses")
    const scopedExpenses =
      expenseScope === "all"
        ? expenses
        : expenseScope === "shop"
          ? expenses.filter((e) => e.locationId === loc || e.submittedBy === me)
          : expenses.filter((e) => e.submittedBy === me)

    const stockScope = scope("stock")
    const atSite = (id?: string) => stockScope === "all" || id === loc

    const rdvScope = scope("rendez_vous")
    const locOf = new Map(employees.map((e) => [e.id, e.locationId]))

    return {
      prospects: ownOnly(prospects, "prospects", (p) => p.ownerId),
      followups: ownOnly(followups, "relances", (f) => f.ownerId),
      appointments:
        rdvScope === "all"
          ? appointments
          : rdvScope === "shop"
            ? appointments.filter((a) => locOf.get(a.assignedTo) === loc)
            : appointments.filter((a) => a.assignedTo === me),
      clients: scopedClients,
      myClients,
      clientIds,
      opportunities: ownOnly(opportunities, "opportunites", (o) => o.ownerId),
      quotes: ownOnly(quotes, "devis", (q) => q.ownerId),
      sales: scopedSales,
      invoices: scopedInvoices,
      payments: payments.filter((p) => invoiceIds.has(p.invoiceId)),
      expenses: scopedExpenses,
      stockLevels: stockScope === "all" ? stockLevels : stockLevels.filter((l) => atSite(l.locationId)),
      stockMovements: stockScope === "all" ? stockMovements : stockMovements.filter((m) => atSite(m.fromLocationId) || atSite(m.toLocationId)),
      shops: scope("boutiques") === "all" || scope("dashboard") === "all" ? shops : shops.filter((s) => s.id === loc),
      warehouses: scope("magasins") === "all" ? warehouses : warehouses.filter((w) => w.id === loc),
    }
  }, [user, access, clients, opportunities, quotes, sales, invoices, payments, expenses, stockLevels, stockMovements, shops, warehouses, prospects, followups, appointments, employees])
}
