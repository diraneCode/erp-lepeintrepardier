"use client"

import { useCallback, useMemo } from "react"

import { ROLE_LABEL, permissionFor, type ModuleKey, type Permission } from "@/lib/access"
import { useStore } from "@/lib/store"
import type { Employee } from "@/lib/types"

/** Employé connecté (null si aucune session). */
export function useCurrentUser(): Employee | null {
  const id = useStore((s) => s.currentUserId)
  const employees = useStore((s) => s.employees)
  return useMemo(() => employees.find((e) => e.id === id) ?? null, [employees, id])
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
  const { clients } = useScopedData()
  return useMemo(() => clients.map((c) => ({ value: c.id, label: c.name, hint: c.code })), [clients])
}

/**
 * Collections filtrées selon la portée de l'utilisateur pour chaque module :
 * - all  : toutes les données
 * - shop : données de son site d'affectation (boutique, entrepôt)
 * - own  : ses propres enregistrements (clients suivis, ventes réalisées…)
 */
export function useScopedData() {
  const { user, access } = useAccess()
  const clients = useStore((s) => s.clients)
  const opportunities = useStore((s) => s.opportunities)
  const quotes = useStore((s) => s.quotes)
  const sales = useStore((s) => s.sales)
  const invoices = useStore((s) => s.invoices)
  const payments = useStore((s) => s.payments)
  const expenses = useStore((s) => s.expenses)
  const stockLevels = useStore((s) => s.stockLevels)
  const stockMovements = useStore((s) => s.stockMovements)
  const shops = useStore((s) => s.shops)
  const warehouses = useStore((s) => s.warehouses)
  const prospects = useStore((s) => s.prospects)
  const followups = useStore((s) => s.followups)
  const appointments = useStore((s) => s.appointments)
  const employees = useStore((s) => s.employees)

  return useMemo(() => {
    const me = user?.id ?? ""
    const loc = user?.locationId ?? ""
    const scope = (m: ModuleKey) => access(m)?.scope

    const salesScope = scope("ventes") ?? scope("dashboard")
    const scopedSales =
      salesScope === "all" ? sales : salesScope === "shop" ? sales.filter((s) => s.boutiqueId === loc) : sales.filter((s) => s.sellerId === me)

    const clientScope = scope("clients") ?? scope("dashboard")
    let scopedClients = clients
    if (clientScope === "own") {
      const soldTo = new Set(sales.filter((s) => s.sellerId === me && s.clientId).map((s) => s.clientId))
      scopedClients = clients.filter((c) => c.ownerId === me || soldTo.has(c.id))
    } else if (clientScope === "shop") {
      const boughtHere = new Set(sales.filter((s) => s.boutiqueId === loc && s.clientId).map((s) => s.clientId))
      scopedClients = clients.filter((c) => boughtHere.has(c.id) || c.ownerId === me)
    }
    const clientIds = new Set(scopedClients.map((c) => c.id))

    const invoiceScope = scope("facturation") ?? scope("dashboard")
    let scopedInvoices = invoices
    if (invoiceScope === "own") {
      const mySales = new Set(sales.filter((s) => s.sellerId === me).map((s) => s.id))
      const myClients = new Set(clients.filter((c) => c.ownerId === me).map((c) => c.id))
      scopedInvoices = invoices.filter((i) => (i.saleId && mySales.has(i.saleId)) || myClients.has(i.clientId))
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
