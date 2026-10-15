"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  LuCalendarDays,
  LuCheckCheck,
  LuCircleDollarSign,
  LuEye,
  LuMapPin,
  LuPencil,
  LuPresentation,
  LuPlus,
  LuTrash2,
  LuUserCheck,
  LuUserPlus,
  LuUsers,
} from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DescriptionList, DetailSection, DetailSheet } from "@/components/shared/detail-sheet"
import { ExportMenu } from "@/components/shared/export-menu"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UrlActions } from "@/components/shared/url-actions"
import { EventFormDialog, ParticipantFormDialog } from "@/components/modules/marketing/event-forms"
import { useModuleAccess } from "@/hooks/use-access"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useTransientState } from "@/hooks/use-transient-state"
import { formatDate, formatMoney, formatNumber, formatPercent, toISODate } from "@/lib/format"
import { eventAudience, eventStatus, eventType, participantStatus, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { EventParticipant, MarketingEvent, ParticipantStatus } from "@/lib/types"

type Row = MarketingEvent & { registered: number; present: number; fillRate: number; attendance: number | null }

export default function EventsPage() {
  const events = useStore((s) => s.events)
  const update = useStore((s) => s.update)
  const remove = useStore((s) => s.remove)
  const acc = useModuleAccess("evenements")
  const { employeeName } = useLookups(["employeeName"])

  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<MarketingEvent | undefined>(undefined)
  const [viewingId, setViewingId] = useTransientState<string | null>(null)
  const [registerFor, setRegisterFor] = useTransientState<string | null>(null)
  const [toDelete, setToDelete] = useTransientState<string | null>(null)

  const today = toISODate(new Date())
  const rows = React.useMemo<Row[]>(
    () =>
      events.map((e) => {
        const active = e.participants.filter((p) => p.status !== "annule")
        const present = e.participants.filter((p) => p.status === "present").length
        const decided = e.participants.filter((p) => p.status === "present" || p.status === "absent").length
        return { ...e, registered: active.length, present, fillRate: e.capacity ? (active.length / e.capacity) * 100 : 0, attendance: decided ? (present / decided) * 100 : null }
      }),
    [events]
  )
  const viewing = viewingId ? rows.find((r) => r.id === viewingId) ?? null : null
  const registerEvent = registerFor ? rows.find((r) => r.id === registerFor) ?? null : null

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "Intitulé, lieu, intervenant…", fields: (e) => [e.title, e.location, e.externalSpeaker, e.description] },
      date: { label: "Date de l'événement", accessor: (e) => e.startDate },
      facets: [
        { id: "type", label: "Type", options: toOptions(eventType), accessor: (e) => e.type },
        { id: "audience", label: "Public", options: toOptions(eventAudience), accessor: (e) => e.audience },
        { id: "status", label: "Statut", options: toOptions(eventStatus), accessor: (e) => e.status },
        { id: "period", label: "Période", options: [{ value: "avenir", label: "À venir" }, { value: "passe", label: "Passés" }], accessor: (e) => (e.endDate >= today ? "avenir" : "passe") },
      ],
      ranges: [{ id: "budget", label: "Budget", unit: "FCFA", accessor: (e) => e.budget }],
    }),
    [today]
  )
  const filters = useFilters(rows, config)
  const data = filters.filtered
  const upcoming = data.filter((e) => e.endDate >= today && e.status !== "annule").sort((a, b) => a.startDate.localeCompare(b.startDate))

  const k = React.useMemo(() => {
    const done = data.filter((e) => e.status === "termine")
    const present = done.reduce((s, e) => s + e.present, 0)
    const decided = done.reduce((s, e) => s + e.participants.filter((p) => p.status === "present" || p.status === "absent").length, 0)
    return {
      upcoming: upcoming.length,
      registered: upcoming.reduce((s, e) => s + e.registered, 0),
      attendance: decided ? (present / decided) * 100 : 0,
      trained: present,
      budget: data.reduce((s, e) => s + e.budget, 0),
      cost: data.reduce((s, e) => s + e.cost, 0),
    }
  }, [data, upcoming])

  const setParticipant = (e: MarketingEvent, pid: string, status: ParticipantStatus) =>
    update("events", e.id, { participants: e.participants.map((p) => (p.id === pid ? { ...p, status } : p)) })

  const columns: Column<Row>[] = [
    { id: "startDate", header: "Date", accessor: (e) => e.startDate, cell: (e) => <div><div>{formatDate(e.startDate)}{e.endDate !== e.startDate && ` → ${formatDate(e.endDate)}`}</div><div className="text-xs text-muted-foreground">{e.startTime}–{e.endTime}</div></div>, exportType: "date" },
    { id: "title", header: "Événement", accessor: (e) => e.title, cell: (e) => <div className="min-w-0"><div className="truncate font-medium">{e.title}</div><div className="truncate text-xs text-muted-foreground">{eventType[e.type]} · {eventAudience[e.audience]}</div></div>, className: "min-w-[240px] max-w-[320px]" },
    { id: "location", header: "Lieu", accessor: (e) => e.location, hideOnMobile: true, className: "max-w-[200px] truncate" },
    { id: "registered", header: "Inscrits", accessor: (e) => e.registered, cell: (e) => <div className="flex min-w-24 flex-col gap-1"><span className="text-xs tabular">{e.registered} / {e.capacity}</span><Progress value={Math.min(100, e.fillRate)} className="h-1.5" /></div>, exportType: "number" },
    { id: "attendance", header: "Présence", accessor: (e) => e.attendance ?? -1, cell: (e) => (e.attendance === null ? "—" : formatPercent(e.attendance, 0)), exportValue: (e) => (e.attendance === null ? "" : Math.round(e.attendance)), align: "right", hideOnMobile: true },
    { id: "budget", header: "Budget", accessor: (e) => e.budget, cell: (e) => <div className="text-right"><div>{formatMoney(e.budget, { compact: true })}</div><div className="text-xs text-muted-foreground">dépensé {formatMoney(e.cost, { compact: true })}</div></div>, exportType: "money", align: "right", hideOnMobile: true },
    { id: "trainer", header: "Animateur", accessor: (e) => (e.trainerId ? employeeName(e.trainerId) : e.externalSpeaker ?? ""), defaultHidden: true },
    { id: "status", header: "Statut", accessor: (e) => eventStatus[e.status].label, cell: (e) => <StatusBadge def={eventStatus[e.status]} /> },
  ]

  const exportParticipants = (e: MarketingEvent) => ({
    filename: `emargement-${e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`,
    title: `Liste d'émargement — ${e.title}`,
    subtitle: `${formatDate(e.startDate)}${e.endDate !== e.startDate ? ` au ${formatDate(e.endDate)}` : ""} · ${e.startTime}–${e.endTime} · ${e.location}`,
    rows: e.participants.filter((p) => p.status !== "annule"),
    columns: [
      { header: "Participant", value: (p: EventParticipant) => p.name },
      { header: "Entreprise", value: (p: EventParticipant) => p.company ?? "" },
      { header: "Téléphone", value: (p: EventParticipant) => p.phone },
      { header: "E-mail", value: (p: EventParticipant) => p.email ?? "" },
      { header: "Statut", value: (p: EventParticipant) => participantStatus[p.status].label },
      { header: "Signature", value: () => "" },
    ],
  })

  return (
    <Page>
      <UrlActions onNew={() => acc.write && (setEditing(undefined), setFormOpen(true))} onQuery={filters.setSearch} />
      <PageHeader
        icon={LuPresentation}
        title="Séminaires & formations"
        description="Organisation des formations, ateliers, séminaires et salons : inscriptions, émargement et bilan."
        actions={
          acc.write && (
            <Button onClick={() => { setEditing(undefined); setFormOpen(true) }}>
              <LuPlus /> Organiser un événement
            </Button>
          )
        }
      />
      <StatGrid>
        <StatCard index={0} label="Événements à venir" value={formatNumber(k.upcoming)} icon={LuCalendarDays} />
        <StatCard index={1} label="Inscrits à venir" value={formatNumber(k.registered)} icon={LuUsers} tone="blue" />
        <StatCard index={2} label="Taux de présence" value={formatPercent(k.attendance, 0)} icon={LuUserCheck} tone="green" hint={`${formatNumber(k.trained)} personnes formées`} />
        <StatCard index={3} label="Budget consommé" value={formatMoney(k.cost, { compact: true })} icon={LuCircleDollarSign} tone="orange" hint={`sur ${formatMoney(k.budget, { compact: true })}`} />
      </StatGrid>

      {upcoming.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {upcoming.slice(0, 3).map((e, i) => (
            <motion.div key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="h-full gap-4">
                <CardHeader>
                  <CardTitle className="text-base">{e.title}</CardTitle>
                  <CardDescription>{eventType[e.type]} · {eventAudience[e.audience]}</CardDescription>
                  <CardAction><StatusBadge def={eventStatus[e.status]} /></CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                    <span className="flex items-center gap-2"><LuCalendarDays className="size-4" />{formatDate(e.startDate, "EEEE d MMMM")} · {e.startTime}–{e.endTime}</span>
                    <span className="flex items-center gap-2"><LuMapPin className="size-4" />{e.location}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs"><span>{e.registered} inscrit(s)</span><span className="text-muted-foreground">{e.capacity} places</span></div>
                    <Progress value={Math.min(100, e.fillRate)} className="h-2" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setViewingId(e.id)}><LuEye /> Détails</Button>
                    {acc.write && e.status !== "complet" && (
                      <Button size="sm" className="flex-1" onClick={() => setRegisterFor(e.id)}><LuUserPlus /> Inscrire</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          <DataTable
            data={data}
            columns={columns}
            getRowId={(e) => e.id}
            onRowClick={(e) => setViewingId(e.id)}
            defaultSort={{ id: "startDate", desc: true }}
            exportOptions={{
              filename: "seminaires-formations",
              title: "Séminaires & formations",
              subtitle: filters.describe(),
              summary: [
                { label: "Événements", value: formatNumber(data.length) },
                { label: "Taux de présence", value: formatPercent(k.attendance, 0) },
                { label: "Budget", value: formatMoney(k.budget) },
                { label: "Dépensé", value: formatMoney(k.cost) },
              ],
            }}
            rowActions={(e) => (
              <RowActions
                actions={[
                  { label: "Voir / participants", icon: LuEye, onSelect: () => setViewingId(e.id) },
                  { label: "Modifier", icon: LuPencil, onSelect: () => { setEditing(e); setFormOpen(true) }, hidden: !acc.write },
                  { label: "Clôturer l'événement", icon: LuCheckCheck, onSelect: () => { void update("events", e.id, { status: "termine" }).then((ok) => ok && toast.success("Événement clôturé")) }, hidden: !acc.write || e.status === "termine" || e.status === "annule" || e.startDate > today },
                  { label: "Supprimer", icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => setToDelete(e.id), hidden: !acc.write || !acc.global },
                ]}
              />
            )}
          />
        </CardContent>
      </Card>

      <EventFormDialog open={formOpen} onOpenChange={setFormOpen} event={editing} />

      <DetailSheet
        open={!!viewing}
        onOpenChange={(o) => !o && setViewingId(null)}
        title={viewing?.title}
        description={viewing ? `${eventType[viewing.type]} · ${formatDate(viewing.startDate)}${viewing.endDate !== viewing.startDate ? ` au ${formatDate(viewing.endDate)}` : ""}` : undefined}
        badge={viewing && <StatusBadge def={eventStatus[viewing.status]} />}
        wide
        footer={
          viewing && (
            <>
              <ExportMenu getOptions={() => exportParticipants(viewing)} label="Liste d'émargement" />
              {acc.write && viewing.status !== "termine" && viewing.status !== "annule" && (
                <Button onClick={() => setRegisterFor(viewing.id)} disabled={viewing.registered >= viewing.capacity}>
                  <LuUserPlus /> Inscrire
                </Button>
              )}
            </>
          )
        }
      >
        {viewing && (
          <div className="flex flex-col">
            <DetailSection title="Informations">
              <DescriptionList
                items={[
                  { label: "Public", value: eventAudience[viewing.audience] },
                  { label: "Horaires", value: `${viewing.startTime}–${viewing.endTime}` },
                  { label: "Lieu", value: viewing.location, full: true },
                  { label: "Animation", value: [viewing.trainerId ? employeeName(viewing.trainerId) : null, viewing.externalSpeaker].filter(Boolean).join(" · ") || "—", full: true },
                  { label: "Frais d'inscription", value: viewing.fee ? formatMoney(viewing.fee) : "Gratuit" },
                  { label: "Budget / dépensé", value: `${formatMoney(viewing.budget)} / ${formatMoney(viewing.cost)}` },
                  { label: "Description", value: viewing.description, full: true },
                  ...(viewing.program ? [{ label: "Programme", value: viewing.program, full: true }] : []),
                ]}
              />
            </DetailSection>
            <DetailSection
              title={`Participants (${viewing.registered} / ${viewing.capacity})`}
              actions={
                acc.write &&
                viewing.startDate <= today &&
                viewing.status !== "termine" && (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={async () => {
                      if (!(await update("events", viewing.id, { participants: viewing.participants.map((p) => (p.status === "inscrit" || p.status === "confirme" ? { ...p, status: "present" } : p)) }))) return
                      toast.success("Tous les inscrits marqués présents")
                    }}
                  >
                    <LuCheckCheck /> Tous présents
                  </Button>
                )
              }
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{viewing.present} présent(s){viewing.attendance !== null ? ` · présence ${formatPercent(viewing.attendance, 0)}` : ""}</span>
                {viewing.fee > 0 && <span>Recettes estimées : {formatMoney(viewing.fee * viewing.registered)}</span>}
              </div>
              {viewing.participants.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun inscrit pour le moment.</p>
              ) : (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {viewing.participants.map((p) => (
                    <li key={p.id} className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{[p.company, p.phone].filter(Boolean).join(" · ")}</div>
                      </div>
                      {acc.write ? (
                        <Select value={p.status} onValueChange={(v) => setParticipant(viewing, p.id, v as ParticipantStatus)}>
                          <SelectTrigger size="sm" className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {toOptions(participantStatus).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <StatusBadge def={participantStatus[p.status]} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>
          </div>
        )}
      </DetailSheet>
      {/* Rendue après le panneau de détail pour s'afficher au-dessus */}
      <ParticipantFormDialog event={registerEvent} open={!!registerEvent} onOpenChange={(o) => !o && setRegisterFor(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer cet événement ?"
        description="Les inscriptions associées seront perdues. Préférez le statut « Annulé » pour garder l'historique."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          if (toDelete) {
            if (!(await remove("events", [toDelete]))) return
          }
          toast.success("Événement supprimé")
          setToDelete(null)
          setViewingId(null)
        }}
      />
    </Page>
  )
}
