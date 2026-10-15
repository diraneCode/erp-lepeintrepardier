"use client"

import * as React from "react"
import Link from "next/link"
import {
  LuArrowRight,
  LuCalendarDays,
  LuCircleAlert,
  LuCircleDollarSign,
  LuLayoutDashboard,
  LuPackageX,
  LuReceipt,
  LuScale,
  LuShoppingCart,
  LuUserPlus,
  LuWallet,
  LuUsers,
  LuPlus,
  LuTimer,
  LuBellRing,
} from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartCard } from "@/components/shared/chart-card"
import { DonutChart, RankingBars, TimeBarChart, bucketByPeriod, topWithOther } from "@/components/shared/charts"
import { DateRangePicker } from "@/components/shared/date-range-picker"
import { ExportMenu } from "@/components/shared/export-menu"
import { Page, PageHeader } from "@/components/shared/page"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { useLookups } from "@/hooks/use-lookups"
import { useAccess, useScopedData } from "@/hooks/use-access"
import { PersonalHome } from "@/components/modules/home/personal-home"
import { Progress } from "@/components/ui/progress"
import { monthTarget } from "@/lib/targets"
import type { Expense, Leave, Opportunity, Sale, Shop, ShopTarget } from "@/lib/types"
import { daysOverdue, documentTotals, invoiceBalance, invoiceStatus as computeInvoiceStatus, itemsCost, pctChange } from "@/lib/calc"
import { DATE_PRESETS, describeRange, inRange, previousRange, type DateRange } from "@/lib/date-range"
import { formatDate, formatMoney, formatNumber, formatPercent, toISODate } from "@/lib/format"
import { leaveType, saleStatus } from "@/lib/labels"
import { useStore } from "@/lib/store"

// Références stables (évitent de recalculer les indicateurs à chaque rendu)
const NONE_LEAVES: Leave[] = []
const NONE_EXPENSES: Expense[] = []
const NONE_OPPS: Opportunity[] = []

export default function HomePage() {
  const { can } = useAccess()
  return can("dashboard") ? <Dashboard /> : <PersonalHome />
}

function Dashboard() {
  const scoped = useScopedData(["sales", "invoices", "payments", "clients", "stockLevels", "shops", "opportunities", "followups"])
  const { sales, invoices, payments, clients, stockLevels: levels, shops } = scoped
  const { user, can, access } = useAccess()
  const global = access("dashboard")?.global ?? false
  const allLeaves = useStore((s) => s.leaves)
  const leaves = can("rh_conges") ? allLeaves : NONE_LEAVES
  const attendance = useStore((s) => s.attendance)
  const allExpenses = useStore((s) => s.expenses)
  // Les charges d'exploitation ne sont visibles qu'avec une vision globale
  const expenses = global ? allExpenses : NONE_EXPENSES
  const opportunities = can("opportunites") ? scoped.opportunities : NONE_OPPS
  const targets = useStore((s) => s.shopTargets)
  const followupsDue = scoped.followups.filter((f) => (f.status === "a_faire" || f.status === "reporte") && f.dueDate <= toISODate(new Date())).length
  const { productById, categoryById, shopName, clientName, employeeName } = useLookups(["productById", "categoryById", "shopName", "clientName", "employeeName"])

  const [range, setRange] = React.useState<DateRange | undefined>(() => DATE_PRESETS.find((p) => p.id === "month")!.range())
  const [preset, setPreset] = React.useState<string | undefined>("month")
  const prev = range ? previousRange(range) : undefined
  const today = toISODate(new Date())

  const m = React.useMemo(() => {
    const valid = (s: (typeof sales)[number]) => s.status !== "annulee" && s.status !== "brouillon"
    const cur = sales.filter((s) => valid(s) && inRange(s.date, range))
    const before = prev ? sales.filter((s) => valid(s) && inRange(s.date, prev)) : []
    const revenue = cur.reduce((a, s) => a + documentTotals(s.items).total, 0)
    const revenuePrev = before.reduce((a, s) => a + documentTotals(s.items).total, 0)
    const subtotal = cur.reduce((a, s) => a + documentTotals(s.items).subtotal, 0)
    const cogs = cur.reduce((a, s) => a + itemsCost(s.items, (id) => productById.get(id)?.purchasePrice ?? 0), 0)
    const exp = expenses.filter((e) => e.status !== "rejetee" && e.category !== "achats" && inRange(e.date, range)).reduce((a, e) => a + e.amount, 0)
    const expPrev = prev ? expenses.filter((e) => e.status !== "rejetee" && e.category !== "achats" && inRange(e.date, prev)).reduce((a, e) => a + e.amount, 0) : 0
    const collected = payments.filter((p) => inRange(p.date, range)).reduce((a, p) => a + p.amount, 0)
    const collectedPrev = prev ? payments.filter((p) => inRange(p.date, prev)).reduce((a, p) => a + p.amount, 0) : 0
    const overdue = invoices.filter((i) => computeInvoiceStatus(i) === "en_retard")
    const newClients = clients.filter((c) => inRange(c.createdAt, range)).length
    const minOf = new Map([...productById].map(([id, p]) => [id, p.minStock]))
    return {
      cur,
      revenue,
      revenueDelta: prev ? pctChange(revenue, revenuePrev) : undefined,
      count: cur.length,
      basket: cur.length ? revenue / cur.length : 0,
      margin: subtotal - cogs,
      expenses: exp,
      expensesDelta: prev ? pctChange(exp, expPrev) : undefined,
      result: subtotal - cogs - exp,
      collected,
      collectedDelta: prev ? pctChange(collected, collectedPrev) : undefined,
      overdue,
      overdueAmount: overdue.reduce((a, i) => a + invoiceBalance(i), 0),
      newClients,
      stockAlerts: levels.filter((l) => l.quantity <= (minOf.get(l.productId) ?? 0)).length,
      pendingLeaves: leaves.filter((l) => l.status === "en_attente"),
      pipeline: opportunities.filter((o) => o.stage !== "gagnee" && o.stage !== "perdue").reduce((a, o) => a + (o.amount * o.probability) / 100, 0),
    }
  }, [sales, expenses, payments, invoices, clients, levels, leaves, opportunities, range, prev, productById])

  const trend = React.useMemo(() => {
    const exp = expenses.filter((e) => e.status !== "rejetee" && inRange(e.date, range))
    const rows = [...m.cur.map((s) => ({ date: s.date, revenue: documentTotals(s.items).total, expense: 0 })), ...exp.map((e) => ({ date: e.date, revenue: 0, expense: e.amount }))]
    return bucketByPeriod(rows, (r) => r.date, { revenue: (r) => r.revenue, expense: (r) => r.expense }, range)
  }, [m.cur, expenses, range])

  const byShop = React.useMemo(() => {
    const map = new Map<string, number>()
    m.cur.forEach((s) => map.set(s.boutiqueId, (map.get(s.boutiqueId) ?? 0) + documentTotals(s.items).total))
    return [...map].map(([id, value]) => ({ label: shopName(id).replace("Boutique ", ""), value })).sort((a, b) => b.value - a.value)
  }, [m.cur, shopName])

  const byCategory = React.useMemo(() => {
    const map = new Map<string, number>()
    m.cur.forEach((s) =>
      s.items.forEach((i) => {
        const cat = i.productId ? categoryById.get(productById.get(i.productId)?.categoryId ?? "")?.name ?? "Autres" : "Services & lignes libres"
        map.set(cat, (map.get(cat) ?? 0) + i.quantity * i.unitPrice * (1 - i.discount / 100))
      })
    )
    return topWithOther([...map].map(([name, value]) => ({ name, value })))
  }, [m.cur, categoryById, productById])

  const topClients = React.useMemo(() => {
    const map = new Map<string, number>()
    m.cur.forEach((s) => s.clientId && map.set(s.clientId, (map.get(s.clientId) ?? 0) + documentTotals(s.items).total))
    return [...map].map(([id, value]) => ({ label: clientName(id), value })).sort((a, b) => b.value - a.value).slice(0, 6)
  }, [m.cur, clientName])
  const todayAtt = attendance.filter((a) => a.date === today)
  const presentToday = todayAtt.filter((a) => a.status === "present" || a.status === "retard" || a.status === "mission").length
  const recentSales = [...m.cur].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)).slice(0, 6)
  const topOverdue = [...m.overdue].sort((a, b) => invoiceBalance(b) - invoiceBalance(a)).slice(0, 5)
  const hour = new Date().getHours()

  return (
    <Page>
      <PageHeader
        icon={LuLayoutDashboard}
        title={`${hour < 18 ? "Bonjour" : "Bonsoir"} ${user?.firstName ?? ""}`}
        description={`${global ? "Vue d'ensemble de l'activité Le Peintre Pardier" : "Vos indicateurs"} · ${describeRange(range).toLowerCase()}`}
        actions={
          <>
            <DateRangePicker value={range} preset={preset} onChange={(r, p) => { setRange(r); setPreset(p) }} align="end" />
            <ExportMenu
              getOptions={() => ({
                filename: "tableau-de-bord",
                title: "Synthèse d'activité",
                subtitle: describeRange(range),
                rows: [
                  ["Chiffre d'affaires TTC", formatMoney(m.revenue)],
                  ["Nombre de ventes", formatNumber(m.count)],
                  ["Panier moyen", formatMoney(m.basket)],
                  ["Marge brute", formatMoney(m.margin)],
                  ["Dépenses d'exploitation", formatMoney(m.expenses)],
                  ["Résultat estimé", formatMoney(m.result)],
                  ["Encaissements", formatMoney(m.collected)],
                  ["Factures en retard", `${m.overdue.length} — ${formatMoney(m.overdueAmount)}`],
                  ["Nouveaux clients", formatNumber(m.newClients)],
                  ["Pipeline pondéré", formatMoney(m.pipeline)],
                  ["Alertes de stock", formatNumber(m.stockAlerts)],
                  ["Congés en attente", formatNumber(m.pendingLeaves.length)],
                ],
                columns: [
                  { header: "Indicateur", value: (r: string[]) => r[0] },
                  { header: "Valeur", value: (r: string[]) => r[1] },
                ],
              })}
            />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard index={0} label="Chiffre d'affaires TTC" value={formatMoney(m.revenue, { compact: true })} icon={LuCircleDollarSign} delta={m.revenueDelta} hint={m.revenueDelta === undefined ? `${m.count} ventes` : undefined} />
        <StatCard index={1} label="Encaissements" value={formatMoney(m.collected, { compact: true })} icon={LuWallet} tone="green" delta={m.collectedDelta} />
        {global ? (
          <>
            <StatCard index={2} label="Dépenses d'exploitation" value={formatMoney(m.expenses, { compact: true })} icon={LuReceipt} tone="orange" delta={m.expensesDelta} invertDelta />
            <StatCard index={3} label="Résultat estimé" value={formatMoney(m.result, { compact: true })} icon={LuScale} tone={m.result >= 0 ? "blue" : "red"} hint={`marge brute ${formatMoney(m.margin, { compact: true })}`} />
          </>
        ) : (
          <>
            <StatCard index={2} label="Nombre de ventes" value={formatNumber(m.count)} icon={LuShoppingCart} tone="orange" hint={`panier ${formatMoney(m.basket, { compact: true })}`} />
            <StatCard index={3} label="Marge brute" value={formatMoney(m.margin, { compact: true })} icon={LuScale} tone="blue" />
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { href: "/facturation", module: "facturation" as const, icon: LuCircleAlert, label: "Factures en retard", value: `${m.overdue.length}`, sub: formatMoney(m.overdueAmount, { compact: true }), tone: "text-destructive bg-destructive/10" },
          { href: "/stock", module: "stock" as const, icon: LuPackageX, label: "Alertes de stock", value: `${m.stockAlerts}`, sub: "lignes sous le seuil", tone: "text-warning bg-warning/10" },
          { href: "/rh/conges", module: "rh_conges" as const, icon: LuCalendarDays, label: "Congés à valider", value: `${m.pendingLeaves.length}`, sub: "demandes", tone: "text-info bg-info/10" },
          { href: "/commercial/relances", module: "relances" as const, icon: LuBellRing, label: "Relances du jour", value: `${followupsDue}`, sub: "à traiter ou en retard", tone: "text-warning bg-warning/10" },
          { href: "/commercial/clients", module: "clients" as const, icon: LuUserPlus, label: "Nouveaux clients", value: `${m.newClients}`, sub: `pipeline ${formatMoney(m.pipeline, { compact: true })}`, tone: "text-primary bg-primary/10" },
        ]
          .filter((x) => can(x.module))
          .slice(0, 4)
          .map((x) => (
          <Link key={x.href} href={x.href} className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${x.tone}`}>
              <x.icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-muted-foreground">{x.label}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-semibold tabular">{x.value}</span>
                <span className="truncate text-xs text-muted-foreground">{x.sub}</span>
              </div>
            </div>
            <LuArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title={global ? "Chiffre d'affaires et dépenses" : "Évolution de mon chiffre d'affaires"} description={`Par ${trend.granularity}`} className="xl:col-span-2">
          <TimeBarChart
            data={trend.data}
            series={[
              { key: "revenue", label: "CA TTC", color: "var(--chart-1)" },
              ...(global ? [{ key: "expense", label: "Dépenses", color: "var(--chart-2)" }] : []),
            ]}
          />
        </ChartCard>
        <ChartCard title="Ventes par catégorie" description="CA HT de la période">
          <DonutChart data={byCategory} centerValue={formatMoney(m.revenue, { compact: true })} centerLabel="CA TTC" />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Dernières ventes</CardTitle>
            <CardDescription>{m.count} vente(s) sur la période</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/ventes">Tout voir <LuArrowRight /></Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {recentSales.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Aucune vente sur la période.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {recentSales.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <UserAvatar name={clientName(s.clientId)} className="size-8" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{clientName(s.clientId)}</div>
                      <div className="truncate text-xs text-muted-foreground">{s.number} · {shopName(s.boutiqueId)} · {formatDate(s.date)}</div>
                    </div>
                    <StatusBadge def={saleStatus[s.status]} className="hidden sm:inline-flex" />
                    <span className="w-28 text-right font-medium tabular">{formatMoney(documentTotals(s.items).total, { compact: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {global ? (
          <ChartCard title="Classement des boutiques" description="CA TTC de la période">
            <RankingBars items={byShop} />
          </ChartCard>
        ) : shops.length > 0 ? (
          <ChartCard title="Objectif du mois" description={shops.map((s) => s.name).join(", ")}>
            <MonthObjective shops={shops} targets={targets} sales={sales} />
          </ChartCard>
        ) : (
          <ChartCard title="Mes meilleurs clients" description="CA TTC de la période">
            <RankingBars items={topClients} />
          </ChartCard>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {can("facturation") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Factures à relancer</CardTitle>
            <CardDescription>Plus gros soldes en retard</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/facturation">Voir <LuArrowRight /></Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {topOverdue.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucune facture en retard.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {topOverdue.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{clientName(i.clientId)}</div>
                      <div className="text-xs text-muted-foreground">{i.number} · <span className="text-destructive">{daysOverdue(i)} j de retard</span></div>
                    </div>
                    <span className="shrink-0 font-medium tabular">{formatMoney(invoiceBalance(i), { compact: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        )}
        {can("rh_pointage") ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Présences du jour</CardTitle>
            <CardDescription>{formatDate(today, "EEEE d MMMM")}</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/rh/pointage">Pointage <LuArrowRight /></Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              {[
                ["Présents", presentToday, "text-success"],
                ["Retards", todayAtt.filter((a) => a.status === "retard").length, "text-warning"],
                ["Absents", todayAtt.filter((a) => a.status === "absent" || a.status === "conge").length, "text-destructive"],
              ].map(([l, v, c]) => (
                <div key={l as string} className="rounded-lg bg-muted/60 p-3">
                  <div className={`text-xl font-semibold tabular ${c}`}>{v as number}</div>
                  <div className="text-xs text-muted-foreground">{l as string}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">Congés en attente</span>
              {m.pendingLeaves.length === 0 && <span className="text-sm text-muted-foreground">Aucune demande.</span>}
              {m.pendingLeaves.slice(0, 3).map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-sm">
                  <UserAvatar name={employeeName(l.employeeId)} className="size-6" />
                  <span className="min-w-0 flex-1 truncate">{employeeName(l.employeeId)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{leaveType[l.type]} · {l.days} j</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mon espace</CardTitle>
              <CardDescription>Pointage, congés et bulletins de paie</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button asChild><Link href="/moi/pointage"><LuTimer /> Mon pointage</Link></Button>
              <Button asChild variant="outline"><Link href="/moi/conges"><LuCalendarDays /> Mes congés</Link></Button>
              <Button asChild variant="outline"><Link href="/moi/paie"><LuReceipt /> Mes bulletins de paie</Link></Button>
            </CardContent>
          </Card>
        )}
        <Card className="lg:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Actions rapides</CardTitle>
            <CardDescription>Raccourcis vers les saisies courantes</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              { href: "/ventes?nouveau=1", label: "Nouvelle vente", icon: LuShoppingCart, module: "ventes" as const },
              { href: "/facturation?nouveau=1", label: "Nouvelle facture", icon: LuReceipt, module: "facturation" as const },
              { href: "/commercial/clients?nouveau=1", label: "Nouveau client", icon: LuUsers, module: "clients" as const },
              { href: "/depenses?nouveau=1", label: "Nouvelle dépense", icon: LuWallet, module: "depenses" as const },
              { href: "/commercial/devis?nouveau=1", label: "Nouveau devis", icon: LuPlus, module: "devis" as const },
              { href: "/stock", label: "Mouvement de stock", icon: LuPackageX, module: "stock" as const },
              { href: "/moi/conges?nouveau=1", label: "Demander un congé", icon: LuCalendarDays, module: undefined },
            ]
              .filter((a) => !a.module || access(a.module)?.write)
              .map((a) => (
              <Button key={a.href} variant="outline" className="h-auto justify-start gap-2 py-2.5" asChild>
                <Link href={a.href}>
                  <a.icon className="text-primary" />
                  <span className="truncate">{a.label}</span>
                </Link>
              </Button>
            ))}
            <p className="col-span-2 pt-1 text-xs text-muted-foreground">
              Taux d&apos;encaissement : {formatPercent(m.revenue ? (m.collected / m.revenue) * 100 : 0)}
            </p>
          </CardContent>
        </Card>
      </div>
    </Page>
  )
}

function MonthObjective({ shops, targets, sales }: { shops: Shop[]; targets: ShopTarget[]; sales: Sale[] }) {
  const period = toISODate(new Date()).slice(0, 7)
  const dayRatio = new Date().getDate() / new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  return (
    <div className="flex flex-col gap-5">
      {shops.map((shop) => {
        const target = monthTarget(targets, shop, period)
        const done = sales
          .filter((s) => s.boutiqueId === shop.id && s.date.startsWith(period) && s.status !== "annulee" && s.status !== "brouillon")
          .reduce((a, s) => a + documentTotals(s.items).total, 0)
        const pct = target ? (done / target) * 100 : 0
        return (
          <div key={shop.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xl font-semibold tabular">{formatPercent(pct, 0)}</span>
              <span className="text-xs text-muted-foreground">rythme attendu {formatPercent(dayRatio * 100, 0)}</span>
            </div>
            <Progress value={Math.min(100, pct)} className="h-2.5" />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Réalisé {formatMoney(done, { compact: true })}</span>
              <span className="font-medium">Objectif {formatMoney(target, { compact: true })}</span>
            </div>
            <p className="text-xs text-muted-foreground">Reste à réaliser : {formatMoney(Math.max(0, target - done), { compact: true })}</p>
          </div>
        )
      })}
    </div>
  )
}
