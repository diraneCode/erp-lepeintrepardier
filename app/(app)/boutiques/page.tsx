"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { format } from "date-fns"
import { LuClock, LuMapPin, LuPencil, LuPlus, LuShoppingBag, LuStore, LuTarget, LuTrash2, LuTrendingUp, LuUser, LuUsers } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChartCard } from "@/components/shared/chart-card"
import { SERIES_COLORS, TimeBarChart, TimeLineChart, bucketByPeriod } from "@/components/shared/charts"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ExportMenu } from "@/components/shared/export-menu"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { ShopFormDialog } from "@/components/modules/locations/forms"
import { ShopTargetsDialog } from "@/components/modules/locations/targets-form"
import { useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useTransientState } from "@/hooks/use-transient-state"
import { documentTotals, itemsCost } from "@/lib/calc"
import { inRange } from "@/lib/date-range"
import { formatMoney, formatNumber, formatPercent } from "@/lib/format"
import { CITIES } from "@/lib/labels"
import { useStore } from "@/lib/store"
import { MONTHS_FR, monthTarget, targetForRange } from "@/lib/targets"
import type { Shop } from "@/lib/types"
import { cn } from "@/lib/utils"

const statusDef = {
  ouverte: { label: "Ouverte", tone: "success" as const },
  travaux: { label: "En travaux", tone: "warning" as const },
  fermee: { label: "Fermée", tone: "neutral" as const },
}

const achievementTone = (pct: number) => (pct >= 100 ? "text-success" : pct >= 80 ? "text-foreground" : pct >= 50 ? "text-warning" : "text-destructive")

export default function ShopsPage() {
  const acc = useModuleAccess("boutiques")
  const { shops } = useScopedData()
  const [tab, setTab] = React.useState("performance")
  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<Shop | undefined>(undefined)
  const [targetsOpen, setTargetsOpen] = useTransientState(false)
  const [targetShop, setTargetShop] = useTransientState<string | undefined>(undefined)
  const [year, setYear] = React.useState(new Date().getFullYear())

  const openTargets = (shopId?: string) => {
    setTargetShop(shopId)
    setTargetsOpen(true)
  }

  return (
    <Page>
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <PageHeader
          icon={LuStore}
          title={acc.global ? "Boutiques" : "Ma boutique"}
          description="Performance des points de vente, objectifs mensuels et équipes."
          actions={
            <>
              <TabsList>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="objectifs">Objectifs mensuels</TabsTrigger>
              </TabsList>
              {acc.write &&
                (tab === "performance" ? (
                  <Button onClick={() => { setEditing(undefined); setFormOpen(true) }}>
                    <LuPlus /> Nouvelle boutique
                  </Button>
                ) : (
                  <Button onClick={() => openTargets()}>
                    <LuTarget /> Définir les objectifs
                  </Button>
                ))}
            </>
          }
        />
        <TabsContent value="performance">
          <PerformanceTab
            onEdit={acc.write ? (s) => { setEditing(s); setFormOpen(true) } : undefined}
            onTargets={acc.write ? openTargets : undefined}
            canDelete={acc.write && acc.global}
          />
        </TabsContent>
        <TabsContent value="objectifs">
          {tab === "objectifs" && <TargetsTab year={year} onYearChange={setYear} onEdit={acc.write ? openTargets : undefined} />}
        </TabsContent>
      </Tabs>
      <ShopFormDialog open={formOpen} onOpenChange={setFormOpen} shop={editing} />
      <ShopTargetsDialog open={targetsOpen} onOpenChange={setTargetsOpen} shops={shops} shopId={targetShop} year={year} />
    </Page>
  )
}

/* ---------- Performance sur une période ---------- */

function PerformanceTab({ onEdit, onTargets, canDelete }: { onEdit?: (s: Shop) => void; onTargets?: (shopId: string) => void; canDelete: boolean }) {
  const { shops } = useScopedData()
  const sales = useStore((s) => s.sales)
  const employees = useStore((s) => s.employees)
  const levels = useStore((s) => s.stockLevels)
  const targets = useStore((s) => s.shopTargets)
  const remove = useStore((s) => s.remove)
  const acc = useModuleAccess("boutiques")
  const { employeeName, employeeOptions, productById, locationName } = useLookups()
  const [toDelete, setToDelete] = useTransientState<Shop | null>(null)

  const config = React.useMemo<FilterConfig<Shop>>(
    () => ({
      search: { placeholder: "Nom, code, adresse…", fields: (s) => [s.name, s.code, s.address] },
      date: { label: "Période d'analyse", accessor: () => null, filter: false, defaultPreset: "month" },
      facets: acc.global
        ? [
            { id: "city", label: "Ville", options: CITIES.map((c) => ({ value: c, label: c })), accessor: (s) => s.city },
            { id: "status", label: "Statut", options: Object.entries(statusDef).map(([value, d]) => ({ value, label: d.label })), accessor: (s) => s.status },
            { id: "manager", label: "Responsable", options: employeeOptions, accessor: (s) => s.managerId },
          ]
        : [],
    }),
    [employeeOptions, acc.global]
  )
  const filters = useFilters(shops, config)
  const period = filters.state.date

  const periodSales = React.useMemo(
    () => sales.filter((s) => s.status !== "annulee" && s.status !== "brouillon" && inRange(s.date, period ?? undefined)),
    [sales, period]
  )

  const data = React.useMemo(
    () =>
      filters.filtered.map((shop) => {
        const own = periodSales.filter((s) => s.boutiqueId === shop.id)
        const revenue = own.reduce((s, x) => s + documentTotals(x.items).total, 0)
        const subtotal = own.reduce((s, x) => s + documentTotals(x.items).subtotal, 0)
        const cost = own.reduce((s, x) => s + itemsCost(x.items, (id) => productById.get(id)?.purchasePrice ?? 0), 0)
        const target = targetForRange(targets, shop, period)
        const stock = levels.filter((l) => l.locationId === shop.id)
        return {
          ...shop,
          revenue,
          count: own.length,
          basket: own.length ? revenue / own.length : 0,
          margin: subtotal - cost,
          target,
          achievement: target ? (revenue / target) * 100 : 0,
          staff: employees.filter((e) => e.locationId === shop.id && e.status !== "sorti").length,
          stockValue: stock.reduce((s, l) => s + l.quantity * (productById.get(l.productId)?.purchasePrice ?? 0), 0),
          lowStock: stock.filter((l) => l.quantity <= (productById.get(l.productId)?.minStock ?? 0)).length,
        }
      }),
    [filters.filtered, periodSales, targets, period, levels, employees, productById]
  )
  type Row = (typeof data)[number]

  const k = {
    revenue: data.reduce((s, x) => s + x.revenue, 0),
    target: data.reduce((s, x) => s + x.target, 0),
    count: data.reduce((s, x) => s + x.count, 0),
    staff: data.reduce((s, x) => s + x.staff, 0),
  }

  const trend = React.useMemo(() => {
    const ids = data.slice(0, 5).map((s) => s.id)
    const fns = Object.fromEntries(ids.map((id) => [id, (x: (typeof periodSales)[number]) => (x.boutiqueId === id ? documentTotals(x.items).total : 0)]))
    return bucketByPeriod(periodSales.filter((s) => ids.includes(s.boutiqueId)), (s) => s.date, fns, period)
  }, [data, periodSales, period])

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <FilterBar filters={filters}>
            <ExportMenu
              getOptions={() => ({
                filename: "boutiques",
                title: "Performance des boutiques",
                subtitle: filters.describe(),
                summary: [
                  { label: "CA TTC", value: formatMoney(k.revenue) },
                  { label: "Objectif", value: formatMoney(k.target) },
                  { label: "Réalisation", value: formatPercent(k.target ? (k.revenue / k.target) * 100 : 0) },
                  { label: "Ventes", value: formatNumber(k.count) },
                ],
                rows: data,
                columns: [
                  { header: "Code", value: (s: Row) => s.code },
                  { header: "Boutique", value: (s: Row) => s.name },
                  { header: "Responsable", value: (s: Row) => employeeName(s.managerId) },
                  { header: "CA TTC", value: (s: Row) => s.revenue, type: "money" },
                  { header: "Objectif", value: (s: Row) => Math.round(s.target), type: "money" },
                  { header: "Réalisation", value: (s: Row) => s.achievement, type: "percent" },
                  { header: "Ventes", value: (s: Row) => s.count, type: "number" },
                  { header: "Panier moyen", value: (s: Row) => Math.round(s.basket), type: "money" },
                  { header: "Marge brute", value: (s: Row) => s.margin, type: "money" },
                  { header: "Effectif", value: (s: Row) => s.staff, type: "number" },
                ],
              })}
            />
          </FilterBar>
        </CardContent>
      </Card>
      <StatGrid>
        <StatCard index={0} label="Chiffre d'affaires" value={formatMoney(k.revenue, { compact: true })} icon={LuTrendingUp} hint={`${formatNumber(data.length)} boutique(s)`} />
        <StatCard index={1} label="Réalisation des objectifs" value={formatPercent(k.target ? (k.revenue / k.target) * 100 : 0, 0)} icon={LuTarget} tone="green" hint={`objectif ${formatMoney(k.target, { compact: true })}`} />
        <StatCard index={2} label="Tickets" value={formatNumber(k.count)} icon={LuShoppingBag} tone="blue" hint={`panier ${formatMoney(k.count ? k.revenue / k.count : 0, { compact: true })}`} />
        <StatCard index={3} label="Effectif en boutique" value={formatNumber(k.staff)} icon={LuUsers} tone="orange" />
      </StatGrid>
      {data.length > 1 && (
        <ChartCard title="Chiffre d'affaires par boutique" description={`CA TTC par ${trend.granularity} sur la période`}>
          <TimeLineChart data={trend.data} series={data.slice(0, 5).map((s, i) => ({ key: s.id, label: s.name.replace("Boutique ", ""), color: SERIES_COLORS[i] }))} />
        </ChartCard>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {data.map((s, i) => (
          <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="h-full gap-5">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {s.name}
                  <StatusBadge def={statusDef[s.status]} />
                </CardTitle>
                <CardDescription>{s.code} · approvisionnée par {locationName(s.supplyWarehouseId)}</CardDescription>
                {onEdit && (
                  <CardAction>
                    <RowActions
                      actions={[
                        { label: "Modifier", icon: LuPencil, onSelect: () => onEdit(s) },
                        { label: "Objectifs mensuels", icon: LuTarget, onSelect: () => onTargets?.(s.id) },
                        { label: "Supprimer", icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => setToDelete(s), hidden: !canDelete },
                      ]}
                    />
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2"><LuMapPin className="size-4" />{s.address}, {s.city}</span>
                  <span className="flex items-center gap-2"><LuUser className="size-4" />{employeeName(s.managerId)} · {s.staff} employé(s)</span>
                  <span className="flex items-center gap-2"><LuClock className="size-4" />{s.openingHours}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold tabular">{formatMoney(s.revenue, { compact: true })}</span>
                    <span className={cn("text-sm font-medium tabular", achievementTone(s.achievement))}>{formatPercent(s.achievement, 0)}</span>
                  </div>
                  <Progress value={Math.min(100, s.achievement)} className="h-2" />
                  <span className="text-xs text-muted-foreground">Objectif sur la période : {formatMoney(s.target, { compact: true })}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  {[
                    ["Ventes", formatNumber(s.count)],
                    ["Panier", formatMoney(s.basket, { compact: true })],
                    ["Marge", formatMoney(s.margin, { compact: true })],
                    ["Stock", formatMoney(s.stockValue, { compact: true })],
                  ].map(([l, v]) => (
                    <div key={l} className="rounded-lg bg-muted/60 p-2.5">
                      <div className="text-xs text-muted-foreground">{l}</div>
                      <div className="font-semibold tabular">{v}</div>
                    </div>
                  ))}
                </div>
                {s.lowStock > 0 && <p className="border-t pt-3 text-xs text-warning">{s.lowStock} référence(s) sous le seuil d&apos;alerte</p>}
              </CardContent>
            </Card>
          </motion.div>
        ))}
        {data.length === 0 && <p className="col-span-full py-12 text-center text-sm text-muted-foreground">Aucune boutique ne correspond aux filtres.</p>}
      </div>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer « ${toDelete?.name ?? ""} » ?`}
        description="L'historique des ventes est conservé, mais la boutique n'apparaîtra plus dans les sélections."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (!toDelete) return
          remove("shops", [toDelete.id])
          remove("stockLevels", useStore.getState().stockLevels.filter((l) => l.locationId === toDelete.id).map((l) => l.id))
          toast.success("Boutique supprimée")
          setToDelete(null)
        }}
      />
    </div>
  )
}

/* ---------- Objectifs mensuels ---------- */

function TargetsTab({ year, onYearChange, onEdit }: { year: number; onYearChange: (y: number) => void; onEdit?: (shopId?: string) => void }) {
  const { shops } = useScopedData()
  const sales = useStore((s) => s.sales)
  const targets = useStore((s) => s.shopTargets)
  const [focus, setFocus] = React.useState<string>("all")
  const currentPeriod = format(new Date(), "yyyy-MM")
  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 2 + i)

  const realized = React.useMemo(() => {
    const m = new Map<string, number>()
    sales.forEach((s) => {
      if (s.status === "annulee" || s.status === "brouillon" || !s.date.startsWith(String(year))) return
      const key = `${s.boutiqueId}|${s.date.slice(0, 7)}`
      m.set(key, (m.get(key) ?? 0) + documentTotals(s.items).total)
    })
    return m
  }, [sales, year])

  const periods = MONTHS_FR.map((_, i) => `${year}-${String(i + 1).padStart(2, "0")}`)
  const rows = shops.map((shop) => {
    const cells = periods.map((p) => {
      const target = monthTarget(targets, shop, p)
      const done = realized.get(`${shop.id}|${p}`) ?? 0
      return { period: p, target, done, pct: target ? (done / target) * 100 : 0, future: p > currentPeriod }
    })
    const ytd = cells.filter((c) => !c.future)
    const ytdTarget = ytd.reduce((s, c) => s + c.target, 0)
    const ytdDone = ytd.reduce((s, c) => s + c.done, 0)
    return { shop, cells, annual: cells.reduce((s, c) => s + c.target, 0), ytdTarget, ytdDone, reached: ytd.filter((c) => c.pct >= 100).length, months: ytd.length }
  })
  type R = (typeof rows)[number]

  const selected = focus === "all" ? rows : rows.filter((r) => r.shop.id === focus)
  const chartData = periods.map((p, i) => ({
    label: MONTHS_FR[i],
    target: selected.reduce((s, r) => s + r.cells[i].target, 0),
    done: selected.reduce((s, r) => s + r.cells[i].done, 0),
  }))
  const totals = {
    annual: selected.reduce((s, r) => s + r.annual, 0),
    ytdTarget: selected.reduce((s, r) => s + r.ytdTarget, 0),
    ytdDone: selected.reduce((s, r) => s + r.ytdDone, 0),
    reached: selected.reduce((s, r) => s + r.reached, 0),
    months: selected.reduce((s, r) => s + r.months, 0),
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Select value={String(year)} onValueChange={(v) => onYearChange(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          {shops.length > 1 && (
            <Select value={focus} onValueChange={setFocus}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les boutiques</SelectItem>
                {shops.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="ml-auto">
            <ExportMenu
              getOptions={() => ({
                filename: `objectifs-boutiques-${year}`,
                title: `Objectifs mensuels ${year}`,
                subtitle: "Objectif / réalisé (CA TTC) par mois",
                orientation: "landscape",
                rows: selected,
                columns: [
                  { header: "Boutique", value: (r: R) => r.shop.name },
                  ...periods.map((p, i) => ({ header: MONTHS_FR[i], value: (r: R) => `${formatMoney(r.cells[i].done, { compact: true, currency: false })} / ${formatMoney(r.cells[i].target, { compact: true, currency: false })}` })),
                  { header: "Objectif annuel", value: (r: R) => r.annual, type: "money" as const },
                  { header: "Réalisé (cumul)", value: (r: R) => r.ytdDone, type: "money" as const },
                ],
              })}
            />
          </div>
        </CardContent>
      </Card>
      <StatGrid>
        <StatCard index={0} label={`Objectif annuel ${year}`} value={formatMoney(totals.annual, { compact: true })} icon={LuTarget} />
        <StatCard index={1} label="Réalisé à date" value={formatMoney(totals.ytdDone, { compact: true })} icon={LuTrendingUp} tone="green" hint={`objectif à date ${formatMoney(totals.ytdTarget, { compact: true })}`} />
        <StatCard index={2} label="Taux d'atteinte à date" value={formatPercent(totals.ytdTarget ? (totals.ytdDone / totals.ytdTarget) * 100 : 0, 0)} icon={LuShoppingBag} tone="blue" />
        <StatCard index={3} label="Mois objectif atteint" value={`${totals.reached} / ${totals.months}`} icon={LuStore} tone="orange" hint="boutique × mois écoulés" />
      </StatGrid>
      <ChartCard title="Objectif et réalisé par mois" description={focus === "all" ? "Toutes les boutiques" : shops.find((s) => s.id === focus)?.name}>
        <TimeBarChart
          data={chartData}
          series={[
            { key: "target", label: "Objectif", color: "var(--chart-6)" },
            { key: "done", label: "Réalisé", color: "var(--chart-1)" },
          ]}
        />
      </ChartCard>
      <div className="overflow-x-auto rounded-xl border bg-card scrollbar-thin">
        <table className="w-full min-w-275 text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 min-w-48 bg-muted px-3 py-2 text-left font-medium">Boutique</th>
              {MONTHS_FR.map((m, i) => (
                <th key={m} className={cn("px-2 py-2 text-right font-medium", periods[i] === currentPeriod && "text-primary")}>{m}</th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Annuel</th>
              {onEdit && <th className="w-12" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.shop.id} className="hover:bg-muted/30">
                <td className="sticky left-0 z-10 bg-card px-3 py-2">
                  <div className="font-medium">{r.shop.name}</div>
                  <div className="text-[11px] text-muted-foreground">{r.reached}/{r.months} mois atteints</div>
                </td>
                {r.cells.map((c) => (
                  <td key={c.period} className={cn("px-2 py-2 text-right align-top tabular", c.period === currentPeriod && "bg-primary/5")}>
                    <div className="text-muted-foreground">{formatMoney(c.target, { compact: true, currency: false })}</div>
                    {!c.future && (
                      <>
                        <div className="font-medium">{formatMoney(c.done, { compact: true, currency: false })}</div>
                        <div className={cn("font-semibold", achievementTone(c.pct))}>{formatNumber(c.pct, 0)} %</div>
                      </>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2 text-right align-top font-semibold tabular">{formatMoney(r.annual, { compact: true })}</td>
                {onEdit && (
                  <td className="px-2 py-2 align-top">
                    <Button variant="ghost" size="icon-sm" aria-label="Modifier les objectifs" onClick={() => onEdit(r.shop.id)}>
                      <LuPencil />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Chaque cellule : objectif (gris), réalisé et taux d&apos;atteinte. Les montants sont en FCFA TTC.</p>
    </div>
  )
}
