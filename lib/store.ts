"use client"

import { create } from "zustand"
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware"
import { format } from "date-fns"

import { generateSeed, type SeedData } from "@/lib/data/seed"
import { clearSessionCookie, setSessionCookie } from "@/lib/session"
import { EXPENSE_ACCOUNT } from "@/lib/data/accounts"
import { documentTotals, invoiceTotal } from "@/lib/calc"
import type {
  ActivityLog,
  Followup,
  Expense,
  Invoice,
  JournalEntry,
  Leave,
  Payment,
  PaymentMethod,
  Sale,
  StockMovement,
} from "@/lib/types"

/* ---------- Types ---------- */

type Data = SeedData
type CollectionKey = { [K in keyof Data]: Data[K] extends Array<{ id: string }> ? K : never }[keyof Data]
export type Entity<K extends CollectionKey> = Data[K][number]

interface Actions {
  /* CRUD générique */
  add: <K extends CollectionKey>(key: K, item: Entity<K>) => void
  update: <K extends CollectionKey>(key: K, id: string, patch: Partial<Entity<K>>) => void
  remove: <K extends CollectionKey>(key: K, ids: string[]) => void
  /** Connexion : renvoie un message d'erreur, ou null si réussie */
  login: (email: string, password: string) => string | null
  logout: () => void
  /** Changement de mot de passe : renvoie un message d'erreur, ou null si réussi */
  changePassword: (current: string, next: string) => string | null
  setShopTargets: (shopId: string, targets: { period: string; amount: number }[]) => void
  /** Crée la fiche client à partir d'un prospect et le marque comme converti */
  convertProspect: (prospectId: string) => string | null
  /** Clôture une relance ; programme éventuellement la suivante */
  completeFollowup: (id: string, outcome: string, next?: { dueDate: string; channel: Followup["channel"] }) => void
  /** Crée les relances manquantes (factures échues, devis envoyés depuis 7 jours) ; renvoie le nombre créé */
  generateFollowups: () => number
  log: (action: string, module: string, details: string) => void
  markNotificationsRead: (ids?: string[]) => void
  resetData: () => void

  /* Actions métier */
  createSale: (sale: Sale, opts?: { createInvoice?: boolean }) => void
  cancelSale: (id: string) => void
  createInvoice: (invoice: Invoice) => void
  recordPayment: (payment: Payment) => void
  convertQuoteToInvoice: (quoteId: string) => Invoice | null
  createStockMovement: (movement: StockMovement) => void
  setLeaveStatus: (id: string, status: Leave["status"], comment?: string) => void
  setExpenseStatus: (ids: string[], status: Expense["status"]) => void
  generatePayslips: (period: string) => number
}

export type AppState = Data & Actions & { hydrated: boolean; seeded: boolean; currentUserId: string | null }

/* ---------- Utilitaires ---------- */

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/** Prochain numéro de document : PREFIX-AAAA-00001 */
export function nextNumber(prefix: string, existing: { number: string }[], size = 5) {
  const year = new Date().getFullYear()
  const max = existing.reduce((m, x) => {
    const n = Number(x.number.split("-").pop())
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `${prefix}-${year}-${(max + 1).toString().padStart(size, "0")}`
}

/** Prochain code séquentiel sans année : PREFIX-0001 */
export function nextCode(prefix: string, codes: string[], size = 4) {
  const max = codes.reduce((m, c) => {
    const n = Number(c.split("-").pop())
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `${prefix}-${(max + 1).toString().padStart(size, "0")}`
}

const treasuryAccount = (m: PaymentMethod) => (m === "especes" ? "571" : m === "mobile_money" ? "585" : "521")
const nowStamp = () => format(new Date(), "yyyy-MM-dd'T'HH:mm")

const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value)
    } catch {
      // Quota dépassé ou stockage indisponible : les données restent en mémoire.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name)
    } catch {}
  },
}

const emptyData = (): Data => ({
  warehouses: [],
  shops: [],
  employees: [],
  categories: [],
  products: [],
  clients: [],
  opportunities: [],
  quotes: [],
  sales: [],
  invoices: [],
  payments: [],
  stockLevels: [],
  stockMovements: [],
  campaigns: [],
  promotions: [],
  attendance: [],
  leaves: [],
  payslips: [],
  expenses: [],
  journalEntries: [],
  shopTargets: [],
  prospects: [],
  followups: [],
  appointments: [],
  events: [],
  passwords: {},
  notifications: [],
  activity: [],
})

/* ---------- Store ---------- */

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      const journal = (entry: Omit<JournalEntry, "id" | "number">) => {
        const entries = get().journalEntries
        set({ journalEntries: [...entries, { ...entry, id: uid("je"), number: nextNumber("EC", entries) }] })
      }

      /** Ajuste la quantité en stock d'un produit sur un emplacement. */
      const adjustStock = (productId: string, locationId: string | undefined, delta: number) => {
        if (!locationId || !delta) return
        const levels = get().stockLevels
        const existing = levels.find((l) => l.productId === productId && l.locationId === locationId)
        if (existing) {
          set({ stockLevels: levels.map((l) => (l === existing ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l)) })
        } else {
          set({ stockLevels: [...levels, { id: uid("sl"), productId, locationId, quantity: Math.max(0, delta) }] })
        }
      }

      return {
        ...emptyData(),
        hydrated: false,
        seeded: false,
        currentUserId: null,

        add: (key, item) => set({ [key]: [item, ...(get()[key] as unknown[])] } as Partial<AppState>),
        update: (key, id, patch) =>
          set({
            [key]: (get()[key] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)),
          } as Partial<AppState>),
        remove: (key, ids) => {
          const set_ = new Set(ids)
          set({ [key]: (get()[key] as { id: string }[]).filter((x) => !set_.has(x.id)) } as Partial<AppState>)
        },
        login: (email, password) => {
          const user = get().employees.find((e) => e.email.toLowerCase() === email.trim().toLowerCase())
          if (!user || get().passwords[user.id] !== password) return "Adresse e-mail ou mot de passe incorrect"
          if (user.status === "sorti" || user.status === "suspendu") return "Ce compte est désactivé. Contactez les ressources humaines."
          set({ currentUserId: user.id })
          setSessionCookie()
          get().log("Connexion", "Compte", "Connexion à la plateforme")
          return null
        },
        logout: () => {
          get().log("Déconnexion", "Compte", "Fin de session")
          set({ currentUserId: null })
          clearSessionCookie()
        },
        changePassword: (current, next) => {
          const id = get().currentUserId
          if (!id) return "Session expirée"
          if (get().passwords[id] !== current) return "Mot de passe actuel incorrect"
          set({ passwords: { ...get().passwords, [id]: next } })
          get().log("Sécurité", "Compte", "Changement de mot de passe")
          return null
        },
        setShopTargets: (shopId, targets) => {
          const periods = new Set(targets.map((t) => t.period))
          const kept = get().shopTargets.filter((t) => !(t.shopId === shopId && periods.has(t.period)))
          set({ shopTargets: [...kept, ...targets.map((t) => ({ id: `obj_${shopId}_${t.period}`, shopId, ...t }))] })
          get().log("Objectifs", "Boutiques", `${targets.length} objectif(s) mensuel(s) mis à jour`)
        },
        convertProspect: (prospectId) => {
          const p = get().prospects.find((x) => x.id === prospectId)
          if (!p || p.status === "converti") return null
          const id = uid("cl")
          const code = nextCode("CLI", get().clients.map((c) => c.code))
          const today = format(new Date(), "yyyy-MM-dd")
          get().add("clients", {
            id,
            code,
            type: p.type,
            name: p.name,
            contactName: p.contactName,
            email: p.email,
            phone: p.phone,
            city: p.city,
            address: p.city,
            segment: p.segment,
            status: "actif",
            ownerId: p.ownerId,
            creditLimit: 0,
            createdAt: today,
            notes: `Converti depuis le prospect ${p.code} — besoin : ${p.need}`,
          })
          get().update("prospects", p.id, { status: "converti", clientId: id, lastContact: today, nextAction: undefined })
          // Les relances ouvertes du prospect sont reportées sur le client
          set({
            followups: get().followups.map((f) =>
              f.targetType === "prospect" && f.targetId === p.id && f.status === "a_faire" ? { ...f, targetType: "client", targetId: id } : f
            ),
          })
          get().log("Conversion", "Prospects", `${p.name} → client ${code}`)
          return code
        },
        completeFollowup: (id, outcome, next) => {
          const f = get().followups.find((x) => x.id === id)
          if (!f) return
          const today = format(new Date(), "yyyy-MM-dd")
          get().update("followups", id, { status: "fait", outcome, doneAt: today })
          if (f.targetType === "prospect") {
            const p = get().prospects.find((x) => x.id === f.targetId)
            if (p) get().update("prospects", p.id, { lastContact: today, status: p.status === "nouveau" ? "contacte" : p.status })
          }
          if (next) {
            set({
              followups: [
                { ...f, id: uid("rl"), status: "a_faire", dueDate: next.dueDate, channel: next.channel, outcome: undefined, doneAt: undefined, notes: `Suite : ${outcome}`, createdAt: today },
                ...get().followups,
              ],
            })
          }
          get().log("Relance", "Relances", `${f.subject} — ${outcome}`)
        },
        generateFollowups: () => {
          const today = format(new Date(), "yyyy-MM-dd")
          const open = new Set(get().followups.filter((f) => f.status === "a_faire" || f.status === "reporte").map((f) => `${f.targetType}|${f.targetId}`))
          const created: Followup[] = []
          const weekAgo = format(new Date(Date.now() - 7 * 86_400_000), "yyyy-MM-dd")
          for (const inv of get().invoices) {
            if ((inv.status === "emise" || inv.status === "partielle") && inv.dueDate < today && !open.has(`facture|${inv.id}`)) {
              created.push({
                id: uid("rl"),
                targetType: "facture",
                targetId: inv.id,
                subject: `Relance paiement ${inv.number}`,
                channel: "appel",
                priority: inv.dueDate < format(new Date(Date.now() - 30 * 86_400_000), "yyyy-MM-dd") ? "haute" : "normale",
                dueDate: today,
                status: "a_faire",
                ownerId: get().clients.find((c) => c.id === inv.clientId)?.ownerId ?? get().currentUserId ?? "",
                createdAt: today,
              })
            }
          }
          for (const q of get().quotes) {
            if (q.status === "envoye" && q.date <= weekAgo && !open.has(`devis|${q.id}`)) {
              created.push({
                id: uid("rl"),
                targetType: "devis",
                targetId: q.id,
                subject: `Relance devis ${q.number}`,
                channel: "appel",
                priority: "normale",
                dueDate: today,
                status: "a_faire",
                ownerId: q.ownerId,
                createdAt: today,
              })
            }
          }
          set({ followups: [...created, ...get().followups] })
          get().log("Génération", "Relances", `${created.length} relance(s) créée(s)`)
          return created.length
        },
        log: (action, module, details) => {
          const entry: ActivityLog = { id: uid("a"), userId: get().currentUserId ?? "", date: nowStamp(), action, module, details }
          set({ activity: [entry, ...get().activity].slice(0, 300) })
        },
        markNotificationsRead: (ids) =>
          set({ notifications: get().notifications.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)) }),
        resetData: () => {
          const userId = get().currentUserId
          const seed = generateSeed()
          set({ ...seed, seeded: true, currentUserId: seed.employees.some((e) => e.id === userId) ? userId : null })
        },

        createSale: (sale, opts) => {
          set({ sales: [sale, ...get().sales] })
          if (sale.status !== "brouillon" && sale.status !== "annulee") {
            // Seules les lignes d'articles du catalogue impactent le stock
            const stocked = sale.items.filter((i) => !!i.productId)
            const movements: StockMovement[] = stocked.map((item) => ({
              id: uid("m"),
              date: nowStamp(),
              productId: item.productId,
              type: "sortie",
              quantity: item.quantity,
              fromLocationId: sale.boutiqueId,
              reason: "Vente comptoir",
              reference: sale.number,
              userId: sale.sellerId,
            }))
            set({ stockMovements: [...get().stockMovements, ...movements] })
            stocked.forEach((item) => adjustStock(item.productId, sale.boutiqueId, -item.quantity))
          }
          if (opts?.createInvoice && sale.clientId && sale.status !== "brouillon") {
            const paidNow = sale.paymentMethod !== "credit"
            const total = documentTotals(sale.items).total
            const invoice: Invoice = {
              id: uid("f"),
              number: nextNumber("FAC", get().invoices),
              clientId: sale.clientId,
              boutiqueId: sale.boutiqueId,
              date: sale.date,
              dueDate: sale.date,
              items: sale.items,
              status: "emise",
              amountPaid: 0,
              saleId: sale.id,
            }
            get().createInvoice(invoice)
            get().update("sales", sale.id, { invoiceId: invoice.id })
            if (paidNow) {
              get().recordPayment({
                id: uid("pay"),
                invoiceId: invoice.id,
                date: sale.date,
                amount: total,
                method: sale.paymentMethod,
                reference: sale.number,
              })
            }
          }
          get().log("Création", "Ventes", `Vente ${sale.number}`)
        },

        cancelSale: (id) => {
          const sale = get().sales.find((s) => s.id === id)
          if (!sale || sale.status === "annulee") return
          if (sale.status !== "brouillon") {
            const stocked = sale.items.filter((i) => !!i.productId)
            stocked.forEach((item) => adjustStock(item.productId, sale.boutiqueId, item.quantity))
            set({
              stockMovements: [
                ...get().stockMovements,
                ...stocked.map<StockMovement>((item) => ({
                  id: uid("m"),
                  date: nowStamp(),
                  productId: item.productId,
                  type: "entree",
                  quantity: item.quantity,
                  toLocationId: sale.boutiqueId,
                  reason: "Annulation de vente",
                  reference: sale.number,
                  userId: sale.sellerId,
                })),
              ],
            })
          }
          get().update("sales", id, { status: "annulee" })
          if (sale.invoiceId) get().update("invoices", sale.invoiceId, { status: "annulee" })
          get().log("Annulation", "Ventes", `Vente ${sale.number}`)
        },

        createInvoice: (invoice) => {
          set({ invoices: [invoice, ...get().invoices] })
          if (invoice.status !== "brouillon") {
            const t = documentTotals(invoice.items)
            journal({
              date: invoice.date,
              journal: "VE",
              label: `Facture ${invoice.number}`,
              reference: invoice.number,
              status: "valide",
              lines: [
                { account: "411", label: `Client — ${invoice.number}`, debit: t.total, credit: 0 },
                { account: "701", label: "Ventes de marchandises", debit: 0, credit: t.subtotal },
                { account: "4431", label: "TVA collectée 19,25 %", debit: 0, credit: t.tax },
              ],
            })
          }
          get().log("Création", "Facturation", `Facture ${invoice.number}`)
        },

        recordPayment: (payment) => {
          const invoice = get().invoices.find((i) => i.id === payment.invoiceId)
          if (!invoice) return
          const paid = invoice.amountPaid + payment.amount
          const total = invoiceTotal(invoice)
          set({ payments: [payment, ...get().payments] })
          get().update("invoices", invoice.id, {
            amountPaid: paid,
            status: paid >= total ? "payee" : "partielle",
          })
          journal({
            date: payment.date,
            journal: payment.method === "especes" ? "CA" : "BQ",
            label: `Règlement ${invoice.number}`,
            reference: payment.reference,
            status: "valide",
            lines: [
              { account: treasuryAccount(payment.method), label: "Encaissement client", debit: payment.amount, credit: 0 },
              { account: "411", label: `Client — ${invoice.number}`, debit: 0, credit: payment.amount },
            ],
          })
          get().log("Encaissement", "Facturation", `${invoice.number} — ${payment.amount} FCFA`)
        },

        convertQuoteToInvoice: (quoteId) => {
          const quote = get().quotes.find((q) => q.id === quoteId)
          if (!quote) return null
          const today = format(new Date(), "yyyy-MM-dd")
          const client = get().clients.find((c) => c.id === quote.clientId)
          const invoice: Invoice = {
            id: uid("f"),
            number: nextNumber("FAC", get().invoices),
            clientId: quote.clientId,
            boutiqueId: get().shops[0]?.id ?? "",
            date: today,
            dueDate: format(new Date(Date.now() + (client?.type === "entreprise" ? 30 : 7) * 86_400_000), "yyyy-MM-dd"),
            items: quote.items,
            status: "emise",
            amountPaid: 0,
            quoteId: quote.id,
          }
          get().createInvoice(invoice)
          get().update("quotes", quoteId, { status: "accepte", invoiceId: invoice.id })
          return invoice
        },

        createStockMovement: (movement) => {
          set({ stockMovements: [...get().stockMovements, movement] })
          const { type, productId, quantity, fromLocationId, toLocationId } = movement
          if (type === "entree") adjustStock(productId, toLocationId, quantity)
          if (type === "sortie") adjustStock(productId, fromLocationId, -quantity)
          if (type === "transfert") {
            adjustStock(productId, fromLocationId, -quantity)
            adjustStock(productId, toLocationId, quantity)
          }
          if (type === "ajustement") adjustStock(productId, toLocationId, quantity)
          get().log("Mouvement", "Stock", `${movement.reference} (${type})`)
        },

        setLeaveStatus: (id, status, comment) => {
          get().update("leaves", id, { status, comment, approverId: get().currentUserId ?? undefined })
          get().log("Décision", "Congés", `Demande ${status}`)
        },

        setExpenseStatus: (ids, status) => {
          const targets = get().expenses.filter((e) => ids.includes(e.id))
          set({
            expenses: get().expenses.map((e) =>
              ids.includes(e.id) ? { ...e, status, approvedBy: status === "en_attente" ? undefined : get().currentUserId ?? undefined } : e
            ),
          })
          if (status === "payee") {
            targets
              .filter((e) => e.status !== "payee")
              .forEach((x) =>
                journal({
                  date: format(new Date(), "yyyy-MM-dd"),
                  journal: x.category === "achats" ? "AC" : x.paymentMethod === "especes" ? "CA" : "BQ",
                  label: `${x.description} — ${x.supplier}`,
                  reference: x.number,
                  status: "valide",
                  lines: [
                    { account: EXPENSE_ACCOUNT[x.category], label: x.description, debit: x.amount, credit: 0 },
                    { account: treasuryAccount(x.paymentMethod), label: "Paiement", debit: 0, credit: x.amount },
                  ],
                })
              )
          }
          get().log("Statut", "Dépenses", `${ids.length} dépense(s) → ${status}`)
        },

        generatePayslips: (period) => {
          const existing = new Set(get().payslips.filter((p) => p.period === period).map((p) => p.employeeId))
          const created = get()
            .employees.filter((e) => e.status !== "sorti" && !existing.has(e.id) && e.hireDate <= `${period}-28`)
            .map((e) => ({
              id: uid("bp"),
              employeeId: e.id,
              period,
              baseSalary: e.baseSalary,
              overtime: 0,
              bonuses: 0,
              transportAllowance: e.baseSalary < 300_000 ? 25_000 : 40_000,
              housingAllowance: e.baseSalary >= 400_000 ? Math.round((e.baseSalary * 0.15) / 1000) * 1000 : 0,
              otherDeductions: 0,
              status: "brouillon" as const,
            }))
          set({ payslips: [...created, ...get().payslips] })
          get().log("Génération", "Paie", `${created.length} bulletin(s) pour ${period}`)
          return created.length
        },
      }
    },
    {
      name: "pardier-data",
      version: 6,
      // Nouveau modèle (rôles, comptes, objectifs) : on régénère le jeu de démonstration
      migrate: () => ({}) as AppState,
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { hydrated, ...rest } = state
        return Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v !== "function")) as Partial<AppState>
      },
    }
  )
)

/** Charge les données persistées, ou génère le jeu de démonstration au premier lancement. */
export async function initStore() {
  if (useStore.getState().hydrated) return
  await useStore.persist.rehydrate()
  if (!useStore.getState().seeded) {
    useStore.setState({ ...generateSeed(), seeded: true })
  }
  // Aligne le témoin de session (lu par proxy.ts) sur l'état réel
  if (useStore.getState().currentUserId) setSessionCookie()
  else clearSessionCookie()
  useStore.setState({ hydrated: true })
}
