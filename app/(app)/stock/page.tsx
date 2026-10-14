"use client"

import * as React from "react"
import {
  LuArrowRightLeft,
  LuBoxes,
  LuCircleAlert,
  LuPackageMinus,
  LuPackagePlus,
  LuPackageX,
  LuPlus,
  LuScale,
  LuWarehouse,
} from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChartCard } from "@/components/shared/chart-card"
import { RankingBars, TimeBarChart, bucketByPeriod } from "@/components/shared/charts"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { MovementFormDialog, type MovementPreset } from "@/components/modules/stock/movement-form"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useTransientState } from "@/hooks/use-transient-state"
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format"
import { movementType, toOptions } from "@/lib/labels"
import type { StockLevel, StockMovement } from "@/lib/types"
import { cn } from "@/lib/utils"

type LevelState = "rupture" | "bas" | "ok" | "surstock"
const levelDef = {
  rupture: { label: "Rupture", tone: "destructive" as const },
  bas: { label: "Sous le seuil", tone: "warning" as const },
  ok: { label: "Normal", tone: "success" as const },
  surstock: { label: "Surstock", tone: "info" as const },
}
type LevelRow = StockLevel & { productName: string; sku: string; categoryId: string; kind: "entrepot" | "boutique"; min: number; value: number; state: LevelState }

export default function StockPage() {
  const acc = useModuleAccess("stock")
  const [tab, setTab] = React.useState("niveaux")
  const [formOpen, setFormOpen] = useTransientState(false)
  const [preset, setPreset] = useTransientState<MovementPreset | undefined>(undefined)
  const openMovement = (p?: MovementPreset) => {
    setPreset(p)
    setFormOpen(true)
  }

  return (
    <Page>
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <PageHeader
          icon={LuBoxes}
          title="Stock"
          description="Niveaux par entrepôt et boutique, alertes et traçabilité des mouvements."
          actions={
            <>
              <TabsList>
                <TabsTrigger value="niveaux">Niveaux</TabsTrigger>
                <TabsTrigger value="mouvements">Mouvements</TabsTrigger>
              </TabsList>
              {acc.write && (
                <Button onClick={() => openMovement()}>
                  <LuPlus /> Nouveau mouvement
                </Button>
              )}
            </>
          }
        />
        <TabsContent value="niveaux">
          <LevelsTab onMovement={acc.write ? openMovement : undefined} global={acc.global} />
        </TabsContent>
        <TabsContent value="mouvements">{tab === "mouvements" && <MovementsTab global={acc.global} />}</TabsContent>
      </Tabs>
      <MovementFormDialog open={formOpen} onOpenChange={setFormOpen} preset={preset} />
    </Page>
  )
}

function LevelsTab({ onMovement, global }: { onMovement?: (p: MovementPreset) => void; global: boolean }) {
  const { stockLevels: levels } = useScopedData()
  const { productById, locationById, categoryOptions, locationOptions, locationName } = useLookups()

  const rows = React.useMemo<LevelRow[]>(
    () =>
      levels
        .map((l) => {
          const p = productById.get(l.productId)
          const loc = locationById.get(l.locationId)
          if (!p || !loc) return null
          const min = p.minStock
          const state: LevelState = l.quantity === 0 ? "rupture" : l.quantity <= min ? "bas" : l.quantity > min * (loc.kind === "entrepot" ? 8 : 4) ? "surstock" : "ok"
          return { ...l, productName: p.name, sku: p.sku, categoryId: p.categoryId, kind: loc.kind, min, value: l.quantity * p.purchasePrice, state }
        })
        .filter((r): r is LevelRow => r !== null),
    [levels, productById, locationById]
  )

  const config = React.useMemo<FilterConfig<LevelRow>>(
    () => ({
      search: { placeholder: "Produit, SKU…", fields: (r) => [r.productName, r.sku] },
      facets: [
        ...(global
          ? [
              { id: "location", label: "Site", options: locationOptions, accessor: (r: LevelRow) => r.locationId },
              { id: "kind", label: "Type de site", options: [{ value: "entrepot", label: "Entrepôts" }, { value: "boutique", label: "Boutiques" }], accessor: (r: LevelRow) => r.kind },
            ]
          : []),
        { id: "state", label: "État", options: Object.entries(levelDef).map(([value, d]) => ({ value, label: d.label })), accessor: (r) => r.state },
        { id: "category", label: "Catégorie", options: categoryOptions, accessor: (r) => r.categoryId },
      ],
      ranges: [
        { id: "quantity", label: "Quantité", unit: "unités", accessor: (r) => r.quantity },
        { id: "value", label: "Valeur", unit: "FCFA", accessor: (r) => r.value },
      ],
    }),
    [locationOptions, categoryOptions, global]
  )
  const filters = useFilters(rows, config)
  const data = filters.filtered

  const k = {
    value: data.reduce((s, r) => s + r.value, 0),
    units: data.reduce((s, r) => s + r.quantity, 0),
    low: data.filter((r) => r.state === "bas").length,
    out: data.filter((r) => r.state === "rupture").length,
  }
  const byLocation = React.useMemo(() => {
    const m = new Map<string, number>()
    data.forEach((r) => m.set(r.locationId, (m.get(r.locationId) ?? 0) + r.value))
    return [...m].map(([id, value]) => ({ label: locationName(id), value })).sort((a, b) => b.value - a.value)
  }, [data, locationName])
  const alerts = React.useMemo(() => data.filter((r) => r.state === "rupture" || r.state === "bas").sort((a, b) => a.quantity / (a.min || 1) - b.quantity / (b.min || 1)).slice(0, 8), [data])

  const columns: Column<LevelRow>[] = [
    { id: "product", header: "Produit", accessor: (r) => r.productName, cell: (r) => <div className="min-w-0"><div className="truncate font-medium">{r.productName}</div><div className="text-xs text-muted-foreground">{r.sku}</div></div>, className: "min-w-[220px] max-w-[300px]" },
    { id: "location", header: "Site", accessor: (r) => locationName(r.locationId), cell: (r) => <div><div>{locationName(r.locationId)}</div><div className="text-xs text-muted-foreground">{r.kind === "entrepot" ? "Entrepôt" : "Boutique"}</div></div> },
    {
      id: "quantity",
      header: "Quantité",
      accessor: (r) => r.quantity,
      cell: (r) => (
        <div className="flex min-w-32 flex-col items-end gap-1">
          <span className="font-medium tabular">{formatNumber(r.quantity)}</span>
          <Progress value={Math.min(100, (r.quantity / Math.max(1, r.min * 3)) * 100)} className={cn("h-1 w-24", r.state === "rupture" || r.state === "bas" ? "[&>[data-slot=progress-indicator]]:bg-warning" : "")} />
        </div>
      ),
      align: "right",
      exportType: "number",
      footer: (rs) => formatNumber(rs.reduce((s, r) => s + r.quantity, 0)),
    },
    { id: "min", header: "Seuil", accessor: (r) => r.min, align: "right", exportType: "number", hideOnMobile: true },
    { id: "value", header: "Valeur (achat)", accessor: (r) => r.value, cell: (r) => formatMoney(r.value), align: "right", exportType: "money", hideOnMobile: true, footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.value, 0)) },
    { id: "state", header: "État", accessor: (r) => levelDef[r.state].label, cell: (r) => <StatusBadge def={levelDef[r.state]} /> },
  ]

  return (
    <div className="flex flex-col gap-6">
      <StatGrid>
        <StatCard index={0} label="Valeur du stock" value={formatMoney(k.value, { compact: true })} icon={LuWarehouse} hint="au prix d'achat" />
        <StatCard index={1} label="Unités en stock" value={formatNumber(k.units)} icon={LuBoxes} tone="blue" />
        <StatCard index={2} label="Sous le seuil" value={formatNumber(k.low)} icon={LuCircleAlert} tone="orange" hint="lignes produit × site" />
        <StatCard index={3} label="Ruptures" value={formatNumber(k.out)} icon={LuPackageX} tone="red" />
      </StatGrid>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="Valeur du stock par site">
          <RankingBars items={byLocation} color="var(--chart-3)" />
        </ChartCard>
        <ChartCard title="Alertes prioritaires" description="Ruptures et niveaux sous le seuil d'alerte">
          {alerts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Aucune alerte sur la sélection.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.productName}</div>
                    <div className="text-xs text-muted-foreground">{locationName(a.locationId)} · seuil {a.min}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={cn("font-semibold tabular", a.quantity === 0 ? "text-destructive" : "text-warning")}>{a.quantity}</span>
                    <Button size="xs" variant="outline" className={onMovement ? undefined : "hidden"} onClick={() => onMovement?.({ type: a.kind === "boutique" ? "transfert" : "entree", productId: a.productId, locationId: a.kind === "boutique" ? undefined : a.locationId })}>
                      Réapprovisionner
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          <DataTable
            data={data}
            columns={columns}
            getRowId={(r) => r.id}
            defaultSort={{ id: "quantity" }}
            exportOptions={{ filename: "etat-des-stocks", title: "État des stocks", subtitle: filters.describe(), summary: [{ label: "Valeur du stock", value: formatMoney(k.value) }, { label: "Unités", value: formatNumber(k.units) }, { label: "Sous le seuil", value: formatNumber(k.low) }, { label: "Ruptures", value: formatNumber(k.out) }] }}
            rowActions={onMovement && ((r) => (
              <RowActions
                actions={[
                  { label: "Entrée de stock", icon: LuPackagePlus, onSelect: () => onMovement({ type: "entree", productId: r.productId, locationId: r.locationId }) },
                  { label: "Sortie de stock", icon: LuPackageMinus, onSelect: () => onMovement({ type: "sortie", productId: r.productId, locationId: r.locationId }) },
                  { label: "Transférer", icon: LuArrowRightLeft, onSelect: () => onMovement({ type: "transfert", productId: r.productId, locationId: r.locationId }) },
                  { label: "Ajuster (inventaire)", icon: LuScale, onSelect: () => onMovement({ type: "ajustement", productId: r.productId, locationId: r.locationId }) },
                ]}
              />
            ))}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function MovementsTab({ global }: { global: boolean }) {
  const { stockMovements: movements } = useScopedData()
  const { productName, locationName, employeeName, productOptions, locationOptions, employeeOptions, productById } = useLookups()

  const config = React.useMemo<FilterConfig<StockMovement>>(
    () => ({
      search: { placeholder: "Référence, produit, motif…", fields: (m) => [m.reference, productById.get(m.productId)?.name, m.reason] },
      date: { label: "Date du mouvement", accessor: (m) => m.date, defaultPreset: "30d" },
      facets: [
        { id: "type", label: "Type", options: toOptions(movementType), accessor: (m) => m.type },
        { id: "product", label: "Produit", options: productOptions, accessor: (m) => m.productId },
        { id: "from", label: "Origine", options: locationOptions, accessor: (m) => m.fromLocationId ?? "" },
        { id: "to", label: "Destination", options: locationOptions, accessor: (m) => m.toLocationId ?? "" },
        ...(global ? [{ id: "user", label: "Opérateur", options: employeeOptions, accessor: (m: StockMovement) => m.userId }] : []),
      ],
      ranges: [{ id: "quantity", label: "Quantité", unit: "unités", accessor: (m) => m.quantity }],
    }),
    [productById, productOptions, locationOptions, employeeOptions, global]
  )
  const filters = useFilters(movements, config)
  const data = filters.filtered
  const sumOf = (t: StockMovement["type"]) => data.filter((m) => m.type === t).reduce((s, m) => s + m.quantity, 0)
  const trend = React.useMemo(
    () =>
      bucketByPeriod(data, (m) => m.date.slice(0, 10), { entree: (m) => (m.type === "entree" ? m.quantity : 0), sortie: (m) => (m.type === "sortie" ? m.quantity : 0), transfert: (m) => (m.type === "transfert" ? m.quantity : 0) }, filters.state.date),
    [data, filters.state.date]
  )

  const columns: Column<StockMovement>[] = [
    { id: "date", header: "Date", accessor: (m) => m.date, cell: (m) => <span className="whitespace-nowrap">{formatDateTime(m.date)}</span>, exportValue: (m) => formatDateTime(m.date) },
    { id: "reference", header: "Référence", accessor: (m) => m.reference, cell: (m) => <span className="font-medium">{m.reference}</span> },
    { id: "type", header: "Type", accessor: (m) => movementType[m.type].label, cell: (m) => <StatusBadge def={movementType[m.type]} /> },
    { id: "product", header: "Produit", accessor: (m) => productName(m.productId), className: "max-w-[240px] truncate" },
    {
      id: "quantity",
      header: "Qté",
      accessor: (m) => m.quantity,
      cell: (m) => <span className={cn("font-medium tabular", m.type === "entree" && "text-success", m.type === "sortie" && "text-destructive")}>{m.type === "entree" ? "+" : m.type === "sortie" ? "−" : ""}{formatNumber(Math.abs(m.quantity))}{m.type === "ajustement" && m.quantity < 0 ? " (−)" : ""}</span>,
      align: "right",
      exportType: "number",
    },
    { id: "from", header: "Origine", accessor: (m) => locationName(m.fromLocationId), hideOnMobile: true },
    { id: "to", header: "Destination", accessor: (m) => locationName(m.toLocationId), hideOnMobile: true },
    { id: "reason", header: "Motif", accessor: (m) => m.reason, hideOnMobile: true },
    { id: "user", header: "Opérateur", accessor: (m) => employeeName(m.userId), defaultHidden: true },
  ]

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <FilterBar filters={filters} />
        </CardContent>
      </Card>
      <StatGrid>
        <StatCard index={0} label="Entrées" value={formatNumber(sumOf("entree"))} icon={LuPackagePlus} tone="green" hint="unités reçues" />
        <StatCard index={1} label="Sorties" value={formatNumber(sumOf("sortie"))} icon={LuPackageMinus} tone="red" hint="unités sorties" />
        <StatCard index={2} label="Transferts" value={formatNumber(sumOf("transfert"))} icon={LuArrowRightLeft} tone="blue" hint="unités transférées" />
        <StatCard index={3} label="Mouvements" value={formatNumber(data.length)} icon={LuBoxes} />
      </StatGrid>
      <ChartCard title="Flux de stock" description={`Unités par ${trend.granularity}`}>
        <TimeBarChart
          data={trend.data}
          formatter={(v) => `${formatNumber(v)} u.`}
          series={[
            { key: "entree", label: "Entrées", color: "var(--chart-1)" },
            { key: "sortie", label: "Sorties", color: "var(--chart-2)" },
            { key: "transfert", label: "Transferts", color: "var(--chart-3)" },
          ]}
        />
      </ChartCard>
      <Card>
        <CardContent>
          <DataTable
            data={data}
            columns={columns}
            getRowId={(m) => m.id}
            defaultSort={{ id: "date", desc: true }}
            exportOptions={{ filename: "mouvements-stock", title: "Journal des mouvements de stock", subtitle: filters.describe() }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
