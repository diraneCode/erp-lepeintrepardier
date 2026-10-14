"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { LuBoxes, LuCircleAlert, LuMapPin, LuPencil, LuPhone, LuPlus, LuTrash2, LuUser, LuWarehouse, LuArrowRightLeft } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ExportMenu } from "@/components/shared/export-menu"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { WarehouseFormDialog } from "@/components/modules/locations/forms"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useTransientState } from "@/hooks/use-transient-state"
import { formatDate, formatMoney, formatNumber } from "@/lib/format"
import { inRange } from "@/lib/date-range"
import { CITIES } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Warehouse } from "@/lib/types"

const statusDef = {
  actif: { label: "Actif", tone: "success" as const },
  maintenance: { label: "Maintenance", tone: "warning" as const },
  inactif: { label: "Inactif", tone: "neutral" as const },
}

type Row = Warehouse & { units: number; value: number; refs: number; alerts: number; inflow: number; outflow: number; occupancy: number }

export default function WarehousesPage() {
  const { warehouses } = useScopedData()
  const acc = useModuleAccess("magasins")
  const levels = useStore((s) => s.stockLevels)
  const movements = useStore((s) => s.stockMovements)
  const shops = useStore((s) => s.shops)
  const remove = useStore((s) => s.remove)
  const { productById, employeeName, employeeOptions } = useLookups()
  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<Warehouse | undefined>(undefined)
  const [toDelete, setToDelete] = useTransientState<Warehouse | null>(null)

  // Partie stable des indicateurs (indépendante de la période)
  const base = React.useMemo(
    () =>
      warehouses.map((w) => {
        const own = levels.filter((l) => l.locationId === w.id)
        const units = own.reduce((s, l) => s + l.quantity, 0)
        return {
          ...w,
          units,
          value: own.reduce((s, l) => s + l.quantity * (productById.get(l.productId)?.purchasePrice ?? 0), 0),
          refs: own.filter((l) => l.quantity > 0).length,
          alerts: own.filter((l) => l.quantity <= (productById.get(l.productId)?.minStock ?? 0)).length,
          // Estimation : 1 m² ≈ 6 unités stockées
          occupancy: Math.min(100, (units / (w.capacity * 6)) * 100),
        }
      }),
    [warehouses, levels, productById]
  )
  type Base = (typeof base)[number]

  const config = React.useMemo<FilterConfig<Base>>(
    () => ({
      search: { placeholder: "Nom, code, adresse…", fields: (w) => [w.name, w.code, w.address, w.city] },
      date: { label: "Période des flux", accessor: () => null, filter: false, defaultPreset: "30d" },
      facets: [
        { id: "city", label: "Ville", options: CITIES.map((c) => ({ value: c, label: c })), accessor: (w) => w.city },
        { id: "type", label: "Type", options: [{ value: "entrepot", label: "Entrepôt" }, { value: "depot", label: "Dépôt" }], accessor: (w) => w.type },
        { id: "status", label: "Statut", options: Object.entries(statusDef).map(([value, d]) => ({ value, label: d.label })), accessor: (w) => w.status },
        ...(acc.global ? [{ id: "manager", label: "Responsable", options: employeeOptions, accessor: (w: Base) => w.managerId }] : []),
      ],
    }),
    [employeeOptions, acc.global]
  )
  const filters = useFilters(base, config)
  const period = filters.state.date

  const data = React.useMemo<Row[]>(() => {
    const mv = movements.filter((m) => inRange(m.date, period))
    return filters.filtered.map((w) => ({
      ...w,
      inflow: mv.filter((m) => m.toLocationId === w.id).reduce((s, m) => s + Math.abs(m.quantity), 0),
      outflow: mv.filter((m) => m.fromLocationId === w.id).reduce((s, m) => s + Math.abs(m.quantity), 0),
    }))
  }, [filters.filtered, movements, period])

  const k = {
    value: data.reduce((s, w) => s + w.value, 0),
    units: data.reduce((s, w) => s + w.units, 0),
    alerts: data.reduce((s, w) => s + w.alerts, 0),
    capacity: data.reduce((s, w) => s + w.capacity, 0),
  }

  return (
    <Page>
      <PageHeader
        icon={LuWarehouse}
        title="Magasins"
        description="Entrepôts et dépôts : capacité, valeur stockée, flux et alertes."
        actions={
          acc.write && (
            <Button onClick={() => { setEditing(undefined); setFormOpen(true) }}>
              <LuPlus /> Nouveau magasin
            </Button>
          )
        }
      />
      <StatGrid>
        <StatCard index={0} label="Sites de stockage" value={formatNumber(data.length)} icon={LuWarehouse} hint={`${formatNumber(k.capacity)} m² au total`} />
        <StatCard index={1} label="Valeur stockée" value={formatMoney(k.value, { compact: true })} icon={LuBoxes} tone="blue" />
        <StatCard index={2} label="Unités stockées" value={formatNumber(k.units)} icon={LuArrowRightLeft} tone="green" />
        <StatCard index={3} label="Alertes de stock" value={formatNumber(k.alerts)} icon={LuCircleAlert} tone="orange" hint="références sous le seuil" />
      </StatGrid>
      <Card>
        <CardContent>
          <FilterBar filters={filters}>
            <ExportMenu
              getOptions={() => ({
                filename: "magasins",
                title: "Magasins et entrepôts",
                subtitle: filters.describe(),
                rows: data,
                columns: [
                  { header: "Code", value: (w: Row) => w.code },
                  { header: "Nom", value: (w: Row) => w.name },
                  { header: "Ville", value: (w: Row) => w.city },
                  { header: "Responsable", value: (w: Row) => employeeName(w.managerId) },
                  { header: "Surface (m²)", value: (w: Row) => w.capacity, type: "number" },
                  { header: "Unités", value: (w: Row) => w.units, type: "number" },
                  { header: "Valeur", value: (w: Row) => w.value, type: "money" },
                  { header: "Entrées", value: (w: Row) => w.inflow, type: "number" },
                  { header: "Sorties", value: (w: Row) => w.outflow, type: "number" },
                  { header: "Alertes", value: (w: Row) => w.alerts, type: "number" },
                  { header: "Statut", value: (w: Row) => statusDef[w.status].label },
                ],
              })}
            />
          </FilterBar>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {data.map((w, i) => {
          const served = shops.filter((s) => s.supplyWarehouseId === w.id)
          return (
            <motion.div key={w.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="h-full gap-5">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    {w.name}
                    <StatusBadge def={statusDef[w.status]} />
                  </CardTitle>
                  <CardDescription>
                    {w.code} · {w.type === "entrepot" ? "Entrepôt" : "Dépôt"} · depuis {formatDate(w.createdAt, "MMMM yyyy")}
                  </CardDescription>
                  <CardAction className={acc.write ? undefined : "hidden"}>
                    <RowActions
                      actions={[
                        { label: "Modifier", icon: LuPencil, onSelect: () => { setEditing(w); setFormOpen(true) } },
                        { label: "Supprimer", icon: LuTrash2, destructive: true, onSelect: () => setToDelete(w) },
                      ]}
                    />
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                    <span className="flex items-center gap-2"><LuMapPin className="size-4" />{w.address}</span>
                    <span className="flex items-center gap-2"><LuUser className="size-4" />{employeeName(w.managerId)}</span>
                    <span className="flex items-center gap-2"><LuPhone className="size-4" />{w.phone}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Occupation estimée ({formatNumber(w.capacity)} m²)</span>
                      <span className="font-medium tabular">{formatNumber(w.occupancy, 0)} %</span>
                    </div>
                    <Progress value={w.occupancy} className="h-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    {[
                      ["Valeur", formatMoney(w.value, { compact: true })],
                      ["Références", formatNumber(w.refs)],
                      ["Entrées", formatNumber(w.inflow)],
                      ["Sorties", formatNumber(w.outflow)],
                    ].map(([l, v]) => (
                      <div key={l} className="rounded-lg bg-muted/60 p-2.5">
                        <div className="text-xs text-muted-foreground">{l}</div>
                        <div className="font-semibold tabular">{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
                    <span>Approvisionne : {served.length ? served.map((s) => s.name.replace("Boutique ", "")).join(", ") : "aucune boutique"}</span>
                    {w.alerts > 0 && <span className="font-medium text-warning">{w.alerts} alerte(s)</span>}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
        {data.length === 0 && <p className="col-span-full py-12 text-center text-sm text-muted-foreground">Aucun magasin ne correspond aux filtres.</p>}
      </div>
      <WarehouseFormDialog open={formOpen} onOpenChange={setFormOpen} warehouse={editing} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer « ${toDelete?.name ?? ""} » ?`}
        description="Les niveaux de stock de ce site seront supprimés. Les mouvements historiques sont conservés."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (!toDelete) return
          if (shops.some((s) => s.supplyWarehouseId === toDelete.id)) {
            toast.error("Suppression impossible", { description: "Des boutiques sont approvisionnées par ce magasin." })
          } else {
            remove("warehouses", [toDelete.id])
            remove("stockLevels", useStore.getState().stockLevels.filter((l) => l.locationId === toDelete.id).map((l) => l.id))
            toast.success("Magasin supprimé")
          }
          setToDelete(null)
        }}
      />
    </Page>
  )
}
