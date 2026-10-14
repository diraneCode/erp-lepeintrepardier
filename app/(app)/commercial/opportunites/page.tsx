"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { toast } from "sonner"
import { LuEllipsis, LuCircleDollarSign, LuKanban, LuList, LuPencil, LuPercent, LuPlus, LuTarget, LuTrash2, LuTrophy } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UrlActions } from "@/components/shared/url-actions"
import { UserAvatar } from "@/components/shared/user-avatar"
import { OpportunityFormDialog, STAGE_PROBABILITY } from "@/components/modules/commercial/opportunity-form"
import { ExportMenu } from "@/components/shared/export-menu"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useTransientState } from "@/hooks/use-transient-state"
import { formatDate, formatMoney, formatNumber, formatPercent, relativeDays } from "@/lib/format"
import { opportunitySource, opportunityStage, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Opportunity, OpportunityStage } from "@/lib/types"
import { cn } from "@/lib/utils"

const STAGES: OpportunityStage[] = ["prospection", "qualification", "proposition", "negociation", "gagnee", "perdue"]
const stageColor: Record<OpportunityStage, string> = {
  prospection: "bg-muted-foreground/40",
  qualification: "bg-info",
  proposition: "bg-primary",
  negociation: "bg-warning",
  gagnee: "bg-success",
  perdue: "bg-destructive",
}

export default function OpportunitiesPage() {
  const { opportunities } = useScopedData()
  const acc = useModuleAccess("opportunites")
  const update = useStore((s) => s.update)
  const remove = useStore((s) => s.remove)
  const { clientName, employeeName, employeeOptions, clientById } = useLookups()

  const [view, setView] = React.useState<"kanban" | "list">("kanban")
  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<Opportunity | undefined>(undefined)
  const [toDelete, setToDelete] = useTransientState<string[] | null>(null)

  const config = React.useMemo<FilterConfig<Opportunity>>(
    () => ({
      search: { placeholder: "Affaire, client…", fields: (o) => [o.title, clientById.get(o.clientId)?.name, o.notes] },
      date: { label: "Clôture prévue", accessor: (o) => o.expectedClose },
      facets: [
        { id: "stage", label: "Étape", options: toOptions(opportunityStage), accessor: (o) => o.stage },
        ...(acc.global ? [{ id: "owner", label: "Responsable", options: employeeOptions, accessor: (o: Opportunity) => o.ownerId }] : []),
        { id: "source", label: "Origine", options: toOptions(opportunitySource), accessor: (o) => o.source },
      ],
      ranges: [
        { id: "amount", label: "Montant", unit: "FCFA", accessor: (o) => o.amount },
        { id: "probability", label: "Probabilité", unit: "%", accessor: (o) => o.probability },
      ],
    }),
    [employeeOptions, clientById, acc.global]
  )
  const filters = useFilters(opportunities, config)
  const data = filters.filtered

  const kpis = React.useMemo(() => {
    const open = data.filter((o) => o.stage !== "gagnee" && o.stage !== "perdue")
    const won = data.filter((o) => o.stage === "gagnee")
    const lost = data.filter((o) => o.stage === "perdue")
    const pipeline = open.reduce((s, o) => s + o.amount, 0)
    const weighted = open.reduce((s, o) => s + (o.amount * o.probability) / 100, 0)
    const winRate = won.length + lost.length ? (won.length / (won.length + lost.length)) * 100 : 0
    return { pipeline, weighted, won: won.reduce((s, o) => s + o.amount, 0), wonCount: won.length, winRate, openCount: open.length }
  }, [data])

  const moveTo = (o: Opportunity, stage: OpportunityStage) => {
    update("opportunities", o.id, { stage, probability: STAGE_PROBABILITY[stage] })
    toast.success(`« ${o.title} » → ${opportunityStage[stage].label}`)
  }
  const openEdit = (o?: Opportunity) => {
    setEditing(o)
    setFormOpen(true)
  }

  const columns: Column<Opportunity>[] = [
    {
      id: "title",
      header: "Opportunité",
      accessor: (o) => o.title,
      cell: (o) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{o.title}</div>
          <div className="truncate text-xs text-muted-foreground">{clientName(o.clientId)}</div>
        </div>
      ),
      className: "min-w-[240px] max-w-[340px]",
    },
    { id: "client", header: "Client", accessor: (o) => clientName(o.clientId), defaultHidden: true },
    { id: "amount", header: "Montant", accessor: (o) => o.amount, cell: (o) => formatMoney(o.amount), align: "right", exportType: "money", footer: (r) => formatMoney(r.reduce((s, o) => s + o.amount, 0)) },
    { id: "probability", header: "Proba.", accessor: (o) => o.probability, cell: (o) => `${o.probability} %`, align: "right", exportType: "percent", hideOnMobile: true },
    {
      id: "weighted",
      header: "Pondéré",
      accessor: (o) => Math.round((o.amount * o.probability) / 100),
      cell: (o) => formatMoney((o.amount * o.probability) / 100),
      align: "right",
      exportType: "money",
      hideOnMobile: true,
      footer: (r) => formatMoney(r.reduce((s, o) => s + (o.amount * o.probability) / 100, 0)),
    },
    { id: "stage", header: "Étape", accessor: (o) => opportunityStage[o.stage].label, cell: (o) => <StatusBadge def={opportunityStage[o.stage]} /> },
    { id: "source", header: "Origine", accessor: (o) => opportunitySource[o.source], hideOnMobile: true, defaultHidden: true },
    { id: "owner", header: "Responsable", accessor: (o) => employeeName(o.ownerId), hideOnMobile: true, defaultHidden: !acc.global },
    { id: "expectedClose", header: "Clôture prévue", accessor: (o) => o.expectedClose, cell: (o) => formatDate(o.expectedClose), exportType: "date", hideOnMobile: true },
    { id: "createdAt", header: "Créée le", accessor: (o) => o.createdAt, cell: (o) => formatDate(o.createdAt), exportType: "date", defaultHidden: true },
  ]

  const exportOptions = () => ({
    filename: "opportunites",
    title: "Pipeline commercial",
    subtitle: filters.describe(),
    summary: [
      { label: "Pipeline ouvert", value: formatMoney(kpis.pipeline) },
      { label: "Pondéré", value: formatMoney(kpis.weighted) },
      { label: "Gagné", value: formatMoney(kpis.won) },
      { label: "Taux de transformation", value: formatPercent(kpis.winRate) },
    ],
    columns: [
      { header: "Opportunité", value: (o: Opportunity) => o.title },
      { header: "Client", value: (o: Opportunity) => clientName(o.clientId) },
      { header: "Montant", value: (o: Opportunity) => o.amount, type: "money" as const },
      { header: "Probabilité", value: (o: Opportunity) => o.probability, type: "percent" as const },
      { header: "Étape", value: (o: Opportunity) => opportunityStage[o.stage].label },
      { header: "Responsable", value: (o: Opportunity) => employeeName(o.ownerId) },
      { header: "Clôture prévue", value: (o: Opportunity) => o.expectedClose, type: "date" as const },
    ],
    rows: data,
  })

  return (
    <Page>
      <UrlActions onNew={() => acc.write && openEdit()} onQuery={filters.setSearch} />
      <PageHeader
        icon={LuTarget}
        title="Opportunités"
        description="Pipeline commercial, prévisions et suivi des affaires en cours."
        actions={
          acc.write && (
            <Button onClick={() => openEdit()}>
              <LuPlus /> Nouvelle opportunité
            </Button>
          )
        }
      />
      <StatGrid>
        <StatCard index={0} label="Pipeline ouvert" value={formatMoney(kpis.pipeline, { compact: true })} icon={LuCircleDollarSign} hint={`${kpis.openCount} affaires`} />
        <StatCard index={1} label="Prévision pondérée" value={formatMoney(kpis.weighted, { compact: true })} icon={LuPercent} tone="blue" />
        <StatCard index={2} label="Affaires gagnées" value={formatMoney(kpis.won, { compact: true })} icon={LuTrophy} tone="green" hint={`${kpis.wonCount} affaires`} />
        <StatCard index={3} label="Taux de transformation" value={formatPercent(kpis.winRate)} icon={LuTarget} tone="orange" hint="gagnées / clôturées" />
      </StatGrid>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters}>
            <ToggleGroup type="single" variant="outline" value={view} onValueChange={(v) => v && setView(v as "kanban" | "list")}>
              <ToggleGroupItem value="kanban" aria-label="Vue pipeline">
                <LuKanban />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="Vue liste">
                <LuList />
              </ToggleGroupItem>
            </ToggleGroup>
            {view === "kanban" && <ExportMenu getOptions={exportOptions} disabled={!data.length} />}
          </FilterBar>

          {view === "list" ? (
            <DataTable
              data={data}
              columns={columns}
              getRowId={(o) => o.id}
              onRowClick={openEdit}
              selectable={acc.global && acc.write}
              defaultSort={{ id: "amount", desc: true }}
              exportOptions={{ filename: "opportunites", title: "Pipeline commercial", subtitle: filters.describe() }}
              bulkActions={(rows) => (
                <Button variant="destructive" size="sm" onClick={() => setToDelete(rows.map((r) => r.id))}>
                  <LuTrash2 /> Supprimer
                </Button>
              )}
              rowActions={(o) => (
                <RowActions
                  actions={[
                    { label: "Modifier", icon: LuPencil, onSelect: () => openEdit(o), hidden: !acc.write },
                    { label: "Marquer gagnée", icon: LuTrophy, onSelect: () => moveTo(o, "gagnee"), hidden: o.stage === "gagnee" || !acc.write },
                    { label: "Supprimer", icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => setToDelete([o.id]), hidden: !acc.global || !acc.write },
                  ]}
                />
              )}
            />
          ) : (
            <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 scrollbar-thin">
              {STAGES.map((stage) => {
                const items = data.filter((o) => o.stage === stage).sort((a, b) => b.amount - a.amount)
                const total = items.reduce((s, o) => s + o.amount, 0)
                return (
                  <div key={stage} className="flex w-72 shrink-0 snap-start flex-col rounded-xl border bg-muted/40">
                    <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", stageColor[stage])} />
                        <span className="text-sm font-medium">{opportunityStage[stage].label}</span>
                        <span className="rounded-md bg-background px-1.5 text-xs text-muted-foreground tabular">{items.length}</span>
                      </div>
                      <span className="text-xs text-muted-foreground tabular">{formatMoney(total, { compact: true })}</span>
                    </div>
                    <div className="flex max-h-[620px] min-h-24 flex-col gap-2 overflow-y-auto p-2 scrollbar-thin">
                      <AnimatePresence initial={false}>
                        {items.map((o) => (
                          <motion.div
                            key={o.id}
                            layout
                            initial={{ opacity: 0, scale: 0.97 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            transition={{ duration: 0.18 }}
                            className="group flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-3 text-sm hover:border-primary/40"
                            onClick={() => acc.write && openEdit(o)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="line-clamp-2 font-medium">{o.title}</span>
                              <div onClick={(e) => e.stopPropagation()} className={acc.write ? undefined : "hidden"}>
                                <DropdownMenu modal={false}>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon-xs" className="-mt-0.5 -mr-1 text-muted-foreground" aria-label="Déplacer">
                                      <LuEllipsis />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuLabel className="text-xs text-muted-foreground">Déplacer vers</DropdownMenuLabel>
                                    {STAGES.filter((s) => s !== o.stage).map((s) => (
                                      <DropdownMenuItem key={s} onSelect={() => moveTo(o, s)}>
                                        <span className={cn("size-2 rounded-full", stageColor[s])} />
                                        {opportunityStage[s].label}
                                      </DropdownMenuItem>
                                    ))}
                                    {acc.global && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem variant="destructive" onSelect={() => setToDelete([o.id])}>
                                          <LuTrash2 /> Supprimer
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                            <span className="truncate text-xs text-muted-foreground">{clientName(o.clientId)}</span>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold tabular">{formatMoney(o.amount, { compact: true })}</span>
                              <span className="text-xs text-muted-foreground">{o.probability} %</span>
                            </div>
                            <Progress value={o.probability} className="h-1" />
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <UserAvatar name={employeeName(o.ownerId)} className="size-5 text-[9px]" />
                                {employeeName(o.ownerId).split(" ")[0]}
                              </span>
                              <span className={cn(o.expectedClose < new Date().toISOString().slice(0, 10) && o.stage !== "gagnee" && o.stage !== "perdue" && "text-destructive")}>
                                {relativeDays(o.expectedClose)}
                              </span>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {items.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Aucune affaire</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {view === "kanban" && (
            <p className="text-xs text-muted-foreground">
              {formatNumber(data.length)} opportunité(s) · cliquez sur une carte pour la modifier, ou utilisez le menu ⋯ pour changer d&apos;étape.
            </p>
          )}
        </CardContent>
      </Card>

      <OpportunityFormDialog open={formOpen} onOpenChange={setFormOpen} opportunity={editing} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer ${toDelete?.length ?? 0} opportunité(s) ?`}
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (toDelete) remove("opportunities", toDelete)
          toast.success("Opportunité(s) supprimée(s)")
          setToDelete(null)
        }}
      />
    </Page>
  )
}
