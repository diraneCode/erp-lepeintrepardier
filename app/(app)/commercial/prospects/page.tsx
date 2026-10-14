"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  LuBellRing,
  LuCalendarPlus,
  LuCircleDollarSign,
  LuCircleSlash,
  LuEye,
  LuPencil,
  LuPercent,
  LuTrash2,
  LuUserPlus,
  LuUserRoundCheck,
  LuUserSearch,
} from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChartCard } from "@/components/shared/chart-card"
import { RankingBars } from "@/components/shared/charts"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DescriptionList, DetailSection, DetailSheet } from "@/components/shared/detail-sheet"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UrlActions } from "@/components/shared/url-actions"
import { PersonCell } from "@/components/shared/user-avatar"
import { ProspectFormDialog } from "@/components/modules/prospects/prospect-form"
import { FollowupFormDialog, type FollowupPreset } from "@/components/modules/prospects/followup-forms"
import { useAccess, useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useTransientState } from "@/hooks/use-transient-state"
import { formatDate, formatMoney, formatNumber, formatPercent, relativeDays, toISODate } from "@/lib/format"
import { CITIES, clientSegment, followupChannel, followupStatus, leadSource, prospectStatus, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Prospect } from "@/lib/types"

type Row = Prospect & { nextFollowup?: string; overdue: boolean }

const FUNNEL: Prospect["status"][] = ["nouveau", "contacte", "qualifie", "converti"]

export default function ProspectsPage() {
  const router = useRouter()
  const { prospects } = useScopedData()
  const followups = useStore((s) => s.followups)
  const update = useStore((s) => s.update)
  const remove = useStore((s) => s.remove)
  const convert = useStore((s) => s.convertProspect)
  const acc = useModuleAccess("prospects")
  const { access } = useAccess()
  const canFollowup = !!access("relances")?.write
  const canMeet = !!access("rendez_vous")?.write
  const { employeeName, employeeOptions } = useLookups()

  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<Prospect | undefined>(undefined)
  const [viewingId, setViewingId] = useTransientState<string | null>(null)
  const [toConvert, setToConvert] = useTransientState<Prospect | null>(null)
  const [toDelete, setToDelete] = useTransientState<string[] | null>(null)
  const [followPreset, setFollowPreset] = useTransientState<FollowupPreset | null>(null)

  const today = toISODate(new Date())
  const rows = React.useMemo<Row[]>(() => {
    const next = new Map<string, string>()
    followups
      .filter((f) => f.targetType === "prospect" && (f.status === "a_faire" || f.status === "reporte"))
      .forEach((f) => {
        const cur = next.get(f.targetId)
        if (!cur || f.dueDate < cur) next.set(f.targetId, f.dueDate)
      })
    return prospects.map((p) => {
      const n = next.get(p.id)
      return { ...p, nextFollowup: n, overdue: !!n && n < today }
    })
  }, [prospects, followups, today])
  const viewing = viewingId ? rows.find((r) => r.id === viewingId) ?? null : null

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "Nom, contact, téléphone, besoin…", fields: (p) => [p.name, p.code, p.contactName, p.phone, p.email, p.need] },
      date: { label: "Date de création", accessor: (p) => p.createdAt },
      facets: [
        { id: "status", label: "Statut", options: toOptions(prospectStatus), accessor: (p) => p.status },
        { id: "source", label: "Origine", options: toOptions(leadSource), accessor: (p) => p.source },
        { id: "segment", label: "Segment", options: toOptions(clientSegment), accessor: (p) => p.segment },
        { id: "city", label: "Ville", options: CITIES.map((c) => ({ value: c, label: c })), accessor: (p) => p.city },
        { id: "followup", label: "Relance", options: [{ value: "retard", label: "En retard" }, { value: "prevue", label: "Programmée" }, { value: "aucune", label: "Aucune" }], accessor: (p) => (p.overdue ? "retard" : p.nextFollowup ? "prevue" : "aucune") },
        ...(acc.global ? [{ id: "owner", label: "Responsable", options: employeeOptions, accessor: (p: Row) => p.ownerId }] : []),
      ],
      ranges: [{ id: "potential", label: "Potentiel", unit: "FCFA", accessor: (p) => p.potential }],
    }),
    [employeeOptions, acc.global]
  )
  const filters = useFilters(rows, config)
  const data = filters.filtered

  const k = React.useMemo(() => {
    const open = data.filter((p) => p.status !== "converti" && p.status !== "perdu")
    const converted = data.filter((p) => p.status === "converti").length
    const lost = data.filter((p) => p.status === "perdu").length
    return {
      open: open.length,
      potential: open.reduce((s, p) => s + p.potential, 0),
      rate: converted + lost ? (converted / (converted + lost)) * 100 : 0,
      converted,
      overdue: open.filter((p) => p.overdue).length,
      noFollowup: open.filter((p) => !p.nextFollowup).length,
    }
  }, [data])

  const funnel = FUNNEL.map((s) => ({ label: prospectStatus[s].label, value: data.filter((p) => FUNNEL.indexOf(p.status) >= FUNNEL.indexOf(s) && p.status !== "perdu").length }))
  const bySource = React.useMemo(() => {
    const m = new Map<string, number>()
    data.forEach((p) => m.set(leadSource[p.source], (m.get(leadSource[p.source]) ?? 0) + 1))
    return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }, [data])

  const openEdit = (p?: Prospect) => {
    setEditing(p)
    setFormOpen(true)
  }

  const columns: Column<Row>[] = [
    { id: "name", header: "Prospect", accessor: (p) => p.name, cell: (p) => <PersonCell name={p.name} sub={`${p.code} · ${p.contactName}`} />, className: "min-w-[220px]" },
    { id: "need", header: "Besoin", accessor: (p) => p.need, className: "max-w-[220px] truncate", hideOnMobile: true },
    { id: "segment", header: "Segment", accessor: (p) => clientSegment[p.segment], hideOnMobile: true, defaultHidden: true },
    { id: "city", header: "Ville", accessor: (p) => p.city, hideOnMobile: true },
    { id: "source", header: "Origine", accessor: (p) => leadSource[p.source], hideOnMobile: true, defaultHidden: true },
    { id: "phone", header: "Téléphone", accessor: (p) => p.phone, defaultHidden: true },
    { id: "potential", header: "Potentiel", accessor: (p) => p.potential, cell: (p) => formatMoney(p.potential, { compact: true }), align: "right", exportType: "money", footer: (r) => formatMoney(r.reduce((s, p) => s + p.potential, 0), { compact: true }) },
    {
      id: "nextFollowup",
      header: "Prochaine relance",
      accessor: (p) => p.nextFollowup ?? "",
      cell: (p) => (p.nextFollowup ? <span className={p.overdue ? "font-medium text-destructive" : undefined}>{formatDate(p.nextFollowup)} <span className="text-xs text-muted-foreground">({relativeDays(p.nextFollowup)})</span></span> : <span className="text-muted-foreground">—</span>),
      exportType: "date",
      hideOnMobile: true,
    },
    { id: "owner", header: "Responsable", accessor: (p) => employeeName(p.ownerId), hideOnMobile: true, defaultHidden: !acc.global },
    { id: "status", header: "Statut", accessor: (p) => prospectStatus[p.status].label, cell: (p) => <StatusBadge def={prospectStatus[p.status]} /> },
    { id: "createdAt", header: "Créé le", accessor: (p) => p.createdAt, cell: (p) => formatDate(p.createdAt), exportType: "date", defaultHidden: true },
  ]

  const viewingFollowups = viewing ? followups.filter((f) => f.targetType === "prospect" && f.targetId === viewing.id).sort((a, b) => b.dueDate.localeCompare(a.dueDate)) : []
  const active = (p: Prospect) => p.status !== "converti" && p.status !== "perdu"

  return (
    <Page>
      <UrlActions onNew={() => acc.write && openEdit()} onQuery={filters.setSearch} />
      <PageHeader
        icon={LuUserSearch}
        title={acc.global ? "Prospects" : "Mes prospects"}
        description="Pistes commerciales : qualification, relances et conversion en clients."
        actions={
          acc.write && (
            <Button onClick={() => openEdit()}>
              <LuUserPlus /> Nouveau prospect
            </Button>
          )
        }
      />
      <StatGrid>
        <StatCard index={0} label="Prospects en cours" value={formatNumber(k.open)} icon={LuUserSearch} hint={`${k.noFollowup} sans relance programmée`} />
        <StatCard index={1} label="Potentiel en cours" value={formatMoney(k.potential, { compact: true })} icon={LuCircleDollarSign} tone="blue" />
        <StatCard index={2} label="Taux de conversion" value={formatPercent(k.rate)} icon={LuPercent} tone="green" hint={`${k.converted} converti(s)`} />
        <StatCard index={3} label="Relances en retard" value={formatNumber(k.overdue)} icon={LuBellRing} tone="red" />
      </StatGrid>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Entonnoir de conversion" description="Prospects ayant atteint chaque étape">
          <RankingBars items={funnel} formatter={(v) => formatNumber(v)} />
        </ChartCard>
        <ChartCard title="Origine des prospects">
          <RankingBars items={bySource} formatter={(v) => formatNumber(v)} color="var(--chart-2)" />
        </ChartCard>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          <DataTable
            data={data}
            columns={columns}
            getRowId={(p) => p.id}
            onRowClick={(p) => setViewingId(p.id)}
            selectable={acc.write}
            defaultSort={{ id: "nextFollowup" }}
            rowClassName={(p) => (p.status === "perdu" ? "opacity-60" : undefined)}
            exportOptions={{
              filename: "prospects",
              title: "Liste des prospects",
              subtitle: filters.describe(),
              summary: [
                { label: "En cours", value: formatNumber(k.open) },
                { label: "Potentiel", value: formatMoney(k.potential) },
                { label: "Taux de conversion", value: formatPercent(k.rate) },
                { label: "Relances en retard", value: formatNumber(k.overdue) },
              ],
            }}
            bulkActions={(sel, clear) => (
              <>
                <Button variant="outline" size="sm" onClick={() => { sel.filter(active).forEach((p) => update("prospects", p.id, { status: "contacte", lastContact: today })); toast.success("Prospects marqués comme contactés"); clear() }}>
                  Marquer contactés
                </Button>
                {acc.global && (
                  <Button variant="destructive" size="sm" onClick={() => setToDelete(sel.map((p) => p.id))}>
                    <LuTrash2 /> Supprimer
                  </Button>
                )}
              </>
            )}
            rowActions={(p) => (
              <RowActions
                actions={[
                  { label: "Voir la fiche", icon: LuEye, onSelect: () => setViewingId(p.id) },
                  { label: "Modifier", icon: LuPencil, onSelect: () => openEdit(p), hidden: !acc.write || !active(p) },
                  { label: "Programmer une relance", icon: LuBellRing, onSelect: () => setFollowPreset({ targetType: "prospect", targetId: p.id, subject: p.nextAction ?? `Relance ${p.name}` }), hidden: !canFollowup || !active(p) },
                  { label: "Prendre rendez-vous", icon: LuCalendarPlus, onSelect: () => router.push(`/marketing/rendez-vous?nouveau=1&q=${encodeURIComponent(p.name)}`), hidden: !canMeet || !active(p) },
                  { label: "Convertir en client", icon: LuUserRoundCheck, onSelect: () => setToConvert(p), hidden: !acc.write || !active(p) },
                  { label: "Marquer perdu", icon: LuCircleSlash, onSelect: () => openEdit({ ...p, status: "perdu" }), hidden: !acc.write || !active(p) },
                  { label: "Supprimer", icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => setToDelete([p.id]), hidden: !acc.global || !acc.write },
                ]}
              />
            )}
          />
        </CardContent>
      </Card>

      <ProspectFormDialog open={formOpen} onOpenChange={setFormOpen} prospect={editing} />
      <FollowupFormDialog open={!!followPreset} onOpenChange={(o) => !o && setFollowPreset(null)} preset={followPreset ?? undefined} />

      <DetailSheet
        open={!!viewing}
        onOpenChange={(o) => !o && setViewingId(null)}
        title={viewing?.name}
        description={viewing ? `${viewing.code} · ${viewing.contactName}` : undefined}
        badge={viewing && <StatusBadge def={prospectStatus[viewing.status]} />}
        wide
        footer={
          viewing &&
          acc.write &&
          active(viewing) && (
            <>
              {canFollowup && (
                <Button variant="outline" onClick={() => setFollowPreset({ targetType: "prospect", targetId: viewing.id, subject: viewing.nextAction ?? `Relance ${viewing.name}` })}>
                  <LuBellRing /> Relance
                </Button>
              )}
              <Button onClick={() => setToConvert(viewing)}>
                <LuUserRoundCheck /> Convertir en client
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="flex flex-col">
            <DetailSection title="Qualification">
              <DescriptionList
                items={[
                  { label: "Besoin", value: viewing.need, full: true },
                  { label: "Potentiel estimé", value: formatMoney(viewing.potential) },
                  { label: "Origine", value: leadSource[viewing.source] },
                  { label: "Segment", value: clientSegment[viewing.segment] },
                  { label: "Responsable", value: employeeName(viewing.ownerId) },
                  { label: "Dernier contact", value: formatDate(viewing.lastContact) },
                  { label: viewing.status === "perdu" ? "Raison de la perte" : "Prochaine action", value: viewing.status === "perdu" ? viewing.lostReason : viewing.nextAction ?? "—" },
                  ...(viewing.clientId ? [{ label: "Client créé", value: useStore.getState().clients.find((c) => c.id === viewing.clientId)?.code ?? "—" }] : []),
                ]}
              />
            </DetailSection>
            <DetailSection title="Coordonnées">
              <DescriptionList
                items={[
                  { label: "Téléphone", value: <a className="hover:underline" href={`tel:${viewing.phone}`}>{viewing.phone}</a> },
                  { label: "E-mail", value: viewing.email || "—" },
                  { label: "Ville", value: viewing.city },
                  { label: "Créé le", value: formatDate(viewing.createdAt) },
                ]}
              />
            </DetailSection>
            <DetailSection title={`Historique des relances (${viewingFollowups.length})`}>
              {viewingFollowups.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune relance pour ce prospect.</p>
              ) : (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {viewingFollowups.map((f) => (
                    <li key={f.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{f.subject}</span>
                        <StatusBadge def={followupStatus[f.status]} />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(f.dueDate)} · {followupChannel[f.channel]} · {employeeName(f.ownerId)}
                      </span>
                      {f.outcome && <span className="text-xs">{f.outcome}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>
          </div>
        )}
      </DetailSheet>

      <ConfirmDialog
        open={!!toConvert}
        onOpenChange={(o) => !o && setToConvert(null)}
        title={`Convertir « ${toConvert?.name ?? ""} » en client ?`}
        description="Une fiche client est créée avec ses coordonnées ; ses relances en cours sont transférées sur le client."
        confirmLabel="Convertir"
        onConfirm={() => {
          if (!toConvert) return
          const code = convert(toConvert.id)
          if (code)
            toast.success("Prospect converti", {
              description: `Fiche client ${code} créée`,
              action: access("clients") ? { label: "Voir", onClick: () => router.push(`/commercial/clients?q=${encodeURIComponent(toConvert.name)}`) } : undefined,
            })
          setToConvert(null)
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer ${toDelete?.length ?? 0} prospect(s) ?`}
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (toDelete) remove("prospects", toDelete)
          toast.success("Prospect(s) supprimé(s)")
          setToDelete(null)
          setViewingId(null)
        }}
      />
    </Page>
  )
}
