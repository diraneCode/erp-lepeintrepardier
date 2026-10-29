"use client"

import * as React from "react"
import { LuClipboardCheck, LuClipboardList, LuPlus, LuScale, LuTarget } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { InventoryFormDialog } from "@/components/modules/stock/inventory-form"
import { InventorySheet } from "@/components/modules/stock/inventory-sheet"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useCurrentUser, useModuleAccess } from "@/hooks/use-access"
import { useTransientState } from "@/hooks/use-transient-state"
import { formatDate, formatMoney, formatNumber } from "@/lib/format"
import { inventoryScope, inventoryStatus, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Inventory } from "@/lib/types"
import { cn } from "@/lib/utils"

type Row = Inventory & { products: number; counted: number; gaps: number; gapValue: number }

export default function InventoryPage() {
  const acc = useModuleAccess("inventaire")
  const me = useCurrentUser()
  const inventories = useStore((s) => s.inventories)
  const lines = useStore((s) => s.inventoryLines)
  const { productById, locationName, locationOptions: allLocations, employeeName } = useLookups(["productById", "locationName", "locationOptions", "employeeName"])
  // Hors portée globale : uniquement son site d'affectation
  const locationOptions = React.useMemo(() => (acc.global ? allLocations : allLocations.filter((l) => l.value === me?.locationId)), [acc.global, allLocations, me])
  const [formOpen, setFormOpen] = useTransientState(false)
  const [openId, setOpenId] = useTransientState<string | null>(null)

  const rows = React.useMemo<Row[]>(() => {
    const stats = new Map<string, { products: number; counted: number; gaps: number; gapValue: number }>()
    for (const l of lines) {
      const s = stats.get(l.inventoryId) ?? { products: 0, counted: 0, gaps: 0, gapValue: 0 }
      s.products += 1
      if (l.counted !== undefined && l.counted !== null) {
        s.counted += 1
        const gap = l.counted - l.expected
        if (gap) {
          s.gaps += 1
          s.gapValue += gap * (productById.get(l.productId)?.purchasePrice ?? 0)
        }
      }
      stats.set(l.inventoryId, s)
    }
    return inventories.map((i) => ({ ...i, ...(stats.get(i.id) ?? { products: 0, counted: 0, gaps: 0, gapValue: 0 }) }))
  }, [inventories, lines, productById])

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "N°, intitulé…", fields: (r) => [r.number, r.label, r.note] },
      date: { label: "Date", accessor: (r) => r.date, defaultPreset: "year" },
      facets: [
        { id: "status", label: "Statut", options: toOptions(inventoryStatus), accessor: (r) => r.status },
        ...(acc.global ? [{ id: "location", label: "Site", options: allLocations, accessor: (r: Row) => r.locationId }] : []),
      ],
    }),
    [acc.global, allLocations]
  )
  const filters = useFilters(rows, config)
  const data = filters.filtered

  const k = React.useMemo(() => {
    const validated = data.filter((r) => r.status === "valide")
    const counted = validated.reduce((s, r) => s + r.counted, 0)
    const gaps = validated.reduce((s, r) => s + r.gaps, 0)
    return {
      open: data.filter((r) => r.status === "en_cours").length,
      validated: validated.length,
      gapValue: validated.reduce((s, r) => s + r.gapValue, 0),
      accuracy: counted ? ((counted - gaps) / counted) * 100 : null,
    }
  }, [data])

  const current = openId ? inventories.find((i) => i.id === openId) : undefined

  const columns: Column<Row>[] = [
    { id: "number", header: "N°", accessor: (r) => r.number, cell: (r) => <span className="font-medium whitespace-nowrap">{r.number}</span> },
    { id: "date", header: "Date", accessor: (r) => r.date, cell: (r) => formatDate(r.date), exportType: "date" },
    {
      id: "label",
      header: "Intitulé",
      accessor: (r) => r.label,
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate">{r.label}</div>
          <div className="truncate text-xs text-muted-foreground">{inventoryScope[r.scope]}</div>
        </div>
      ),
      className: "min-w-[200px] max-w-[300px]",
    },
    { id: "location", header: "Site", accessor: (r) => locationName(r.locationId), hideOnMobile: true },
    { id: "progress", header: "Comptés", accessor: (r) => r.counted, cell: (r) => <span className="tabular">{formatNumber(r.counted)} / {formatNumber(r.products)}</span>, align: "right", exportType: "number" },
    { id: "gaps", header: "Écarts", accessor: (r) => r.gaps, align: "right", exportType: "number" },
    {
      id: "gapValue",
      header: "Valeur écarts",
      accessor: (r) => r.gapValue,
      cell: (r) => (r.gapValue ? <span className={cn("tabular", r.gapValue < 0 ? "text-destructive" : "text-info")}>{formatMoney(r.gapValue)}</span> : "—"),
      align: "right",
      exportType: "money",
      hideOnMobile: true,
    },
    { id: "createdBy", header: "Ouvert par", accessor: (r) => (r.createdBy ? employeeName(r.createdBy) : ""), hideOnMobile: true, defaultHidden: true },
    { id: "status", header: "Statut", accessor: (r) => inventoryStatus[r.status].label, cell: (r) => <StatusBadge def={inventoryStatus[r.status]} /> },
  ]

  return (
    <Page>
      <PageHeader
        icon={LuClipboardCheck}
        title="Inventaire"
        description="Comptage physique du stock par site, contrôle des écarts et ajustement automatique."
        actions={
          !current &&
          acc.write && (
            <Button onClick={() => setFormOpen(true)}>
              <LuPlus /> Nouvel inventaire
            </Button>
          )
        }
      />

      {current ? (
        <InventorySheet inventory={current} canEdit={acc.write} onBack={() => setOpenId(null)} />
      ) : (
        <>
          <Card>
            <CardContent>
              <FilterBar filters={filters} />
            </CardContent>
          </Card>
          <StatGrid>
            <StatCard index={0} label="En cours" value={formatNumber(k.open)} icon={LuClipboardList} tone="orange" hint="comptages à terminer" />
            <StatCard index={1} label="Validés" value={formatNumber(k.validated)} icon={LuClipboardCheck} tone="green" hint="sur la période" />
            <StatCard index={2} label="Valeur des écarts" value={formatMoney(k.gapValue, { compact: true })} icon={LuScale} tone={k.gapValue < 0 ? "red" : "blue"} hint="inventaires validés, au prix d'achat" />
            <StatCard index={3} label="Précision" value={k.accuracy === null ? "—" : `${k.accuracy.toFixed(1).replace(".", ",")} %`} icon={LuTarget} tone="violet" hint="lignes comptées sans écart" />
          </StatGrid>
          <Card>
            <CardContent>
              <DataTable
                data={data}
                columns={columns}
                getRowId={(r) => r.id}
                onRowClick={(r) => setOpenId(r.id)}
                defaultSort={{ id: "date", desc: true }}
                emptyTitle="Aucun inventaire"
                emptyDescription={acc.write ? "Ouvrez un inventaire pour compter le stock d'un site." : "Aucun inventaire sur la période."}
                exportOptions={{ filename: "inventaires", title: "Inventaires", subtitle: filters.describe() }}
              />
            </CardContent>
          </Card>
        </>
      )}

      <InventoryFormDialog open={formOpen} onOpenChange={setFormOpen} locationOptions={locationOptions} onCreated={(id) => setOpenId(id)} />
    </Page>
  )
}
