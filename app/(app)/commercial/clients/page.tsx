"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  LuBellRing,
  LuCircleDollarSign,
  LuFileText,
  LuMail,
  LuMapPin,
  LuPencil,
  LuPhone,
  LuTrash2,
  LuUserCheck,
  LuUserPlus,
  LuUsers,
  LuEye,
  LuHourglass,
} from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { ClientFormDialog } from "@/components/modules/clients/client-form"
import { FollowupFormDialog, type FollowupPreset } from "@/components/modules/prospects/followup-forms"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useAccess, useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useTransientState } from "@/hooks/use-transient-state"
import { invoiceBalance, invoiceStatus as getInvoiceStatus, invoiceTotal } from "@/lib/calc"
import { formatDate, formatMoney, formatNumber } from "@/lib/format"
import { CITIES, clientSegment, clientStatus, invoiceStatus, opportunityStage, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Client } from "@/lib/types"

type Row = Client & { revenue: number; balance: number; invoiceCount: number; lastPurchase: string | null }

export default function ClientsPage() {
  const router = useRouter()
  const { clients, invoices, opportunities } = useScopedData(["clients", "invoices", "opportunities"])
  const acc = useModuleAccess("clients")
  const updateMany = useStore((s) => s.updateMany)
  const remove = useStore((s) => s.remove)
  const { employeeName, employeeOptions } = useLookups(["employeeName", "employeeOptions"])

  const { access } = useAccess()
  const canQuote = !!access("devis")?.write
  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<Client | undefined>(undefined)
  const [viewing, setViewing] = useTransientState<Row | null>(null)
  const [toDelete, setToDelete] = useTransientState<string[] | null>(null)
  const [followPreset, setFollowPreset] = useTransientState<FollowupPreset | null>(null)
  const canFollowup = !!access("relances")?.write

  const rows = React.useMemo<Row[]>(() => {
    const stats = new Map<string, { revenue: number; balance: number; count: number; last: string | null }>()
    for (const inv of invoices) {
      if (inv.status === "annulee" || inv.status === "brouillon") continue
      const s = stats.get(inv.clientId) ?? { revenue: 0, balance: 0, count: 0, last: null }
      s.revenue += invoiceTotal(inv)
      s.balance += invoiceBalance(inv)
      s.count += 1
      if (!s.last || inv.date > s.last) s.last = inv.date
      stats.set(inv.clientId, s)
    }
    return clients.map((c) => {
      const s = stats.get(c.id)
      return { ...c, revenue: s?.revenue ?? 0, balance: s?.balance ?? 0, invoiceCount: s?.count ?? 0, lastPurchase: s?.last ?? null }
    })
  }, [clients, invoices])

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "Nom, code, contact, téléphone…", fields: (r) => [r.name, r.code, r.contactName, r.email, r.phone, r.city, r.address] },
      date: { label: "Date de création", accessor: (r) => r.createdAt },
      facets: [
        { id: "status", label: "Statut", options: toOptions(clientStatus), accessor: (r) => r.status },
        { id: "type", label: "Type", options: [{ value: "entreprise", label: "Entreprise" }, { value: "particulier", label: "Particulier" }], accessor: (r) => r.type },
        { id: "segment", label: "Segment", options: toOptions(clientSegment), accessor: (r) => r.segment },
        { id: "city", label: "Ville", options: CITIES.map((c) => ({ value: c, label: c })), accessor: (r) => r.city },
        // Filtre par commercial réservé aux profils ayant une vision globale
        ...(acc.global ? [{ id: "owner", label: "Commercial", options: employeeOptions, accessor: (r: Row) => r.ownerId }] : []),
      ],
      ranges: [
        { id: "revenue", label: "Chiffre d'affaires", unit: "FCFA", accessor: (r) => r.revenue },
        { id: "balance", label: "Encours dû", unit: "FCFA", accessor: (r) => r.balance },
      ],
    }),
    [employeeOptions, acc.global]
  )
  const filters = useFilters(rows, config)
  const data = filters.filtered

  const kpis = React.useMemo(() => {
    const active = data.filter((c) => c.status === "actif").length
    const inactive = data.filter((c) => c.status === "inactif").length
    const revenue = data.reduce((s, c) => s + c.revenue, 0)
    const balance = data.reduce((s, c) => s + c.balance, 0)
    return { active, inactive, revenue, balance }
  }, [data])

  const openEdit = (c?: Client) => {
    setEditing(c)
    setFormOpen(true)
  }

  const columns: Column<Row>[] = [
    {
      id: "name",
      header: "Client",
      accessor: (r) => r.name,
      cell: (r) => <PersonCell name={r.name} sub={`${r.code} · ${r.contactName}`} />,
      className: "min-w-[220px]",
    },
    { id: "type", header: "Type", accessor: (r) => (r.type === "entreprise" ? "Entreprise" : "Particulier"), hideOnMobile: true, defaultHidden: true },
    { id: "segment", header: "Segment", accessor: (r) => clientSegment[r.segment], hideOnMobile: true },
    { id: "city", header: "Ville", accessor: (r) => r.city, hideOnMobile: true },
    { id: "phone", header: "Téléphone", accessor: (r) => r.phone, hideOnMobile: true, defaultHidden: true },
    { id: "email", header: "E-mail", accessor: (r) => r.email, defaultHidden: true },
    { id: "owner", header: "Commercial", accessor: (r) => employeeName(r.ownerId), hideOnMobile: true, defaultHidden: !acc.global },
    {
      id: "revenue",
      header: "CA total",
      accessor: (r) => r.revenue,
      cell: (r) => formatMoney(r.revenue),
      align: "right",
      exportType: "money",
      footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.revenue, 0)),
    },
    {
      id: "balance",
      header: "Encours",
      accessor: (r) => r.balance,
      cell: (r) => <span className={r.balance > 0 ? "font-medium text-warning" : "text-muted-foreground"}>{formatMoney(r.balance)}</span>,
      align: "right",
      exportType: "money",
      footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.balance, 0)),
    },
    { id: "lastPurchase", header: "Dernier achat", accessor: (r) => r.lastPurchase, cell: (r) => formatDate(r.lastPurchase), exportType: "date", hideOnMobile: true, defaultHidden: true },
    { id: "status", header: "Statut", accessor: (r) => clientStatus[r.status].label, cell: (r) => <StatusBadge def={clientStatus[r.status]} /> },
    { id: "createdAt", header: "Créé le", accessor: (r) => r.createdAt, cell: (r) => formatDate(r.createdAt), exportType: "date", hideOnMobile: true },
  ]

  const viewingInvoices = viewing ? invoices.filter((i) => i.clientId === viewing.id).sort((a, b) => b.date.localeCompare(a.date)) : []
  const viewingOpps = viewing ? opportunities.filter((o) => o.clientId === viewing.id) : []

  return (
    <Page>
      <UrlActions onNew={() => acc.write && openEdit()} onQuery={filters.setSearch} />
      <PageHeader
        icon={LuUsers}
        title="Clients"
        description="Portefeuille clients, historique d'achat et suivi de l'encours."
        actions={
          acc.write && (
            <Button onClick={() => openEdit()}>
              <LuUserPlus /> Nouveau client
            </Button>
          )
        }
      />

      <StatGrid>
        <StatCard index={0} label={acc.global ? "Clients (filtrés)" : "Mes clients"} value={formatNumber(data.length)} icon={LuUsers} hint={`sur ${formatNumber(rows.length)} au total`} />
        <StatCard index={1} label="Clients actifs" value={formatNumber(kpis.active)} icon={LuUserCheck} tone="green" hint={`${formatNumber(kpis.inactive)} inactif(s)`} />
        <StatCard index={2} label="Chiffre d'affaires cumulé" value={formatMoney(kpis.revenue, { compact: true })} icon={LuCircleDollarSign} tone="blue" />
        <StatCard index={3} label="Encours client" value={formatMoney(kpis.balance, { compact: true })} icon={LuHourglass} tone="orange" hint="factures non soldées" />
      </StatGrid>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          <DataTable
            data={data}
            columns={columns}
            getRowId={(r) => r.id}
            onRowClick={setViewing}
            selectable={acc.write}
            defaultSort={{ id: "revenue", desc: true }}
            exportOptions={{ filename: "clients", title: "Liste des clients", subtitle: filters.describe() }}
            bulkActions={(selected, clear) => (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Changer le statut
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {toOptions(clientStatus).map((o) => (
                      <DropdownMenuItem
                        key={o.value}
                        onSelect={async () => {
                          if (!(await updateMany("clients", selected.map((c) => c.id), { status: o.value }))) return
                          toast.success(`${selected.length} client(s) passé(s) en « ${o.label} »`)
                          clear()
                        }}
                      >
                        {o.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                {acc.global && (
                  <Button variant="destructive" size="sm" onClick={() => setToDelete(selected.map((s) => s.id))}>
                    <LuTrash2 /> Supprimer
                  </Button>
                )}
              </>
            )}
            rowActions={(r) => (
              <RowActions
                actions={[
                  { label: "Voir la fiche", icon: LuEye, onSelect: () => setViewing(r) },
                  { label: "Modifier", icon: LuPencil, onSelect: () => openEdit(r), hidden: !acc.write },
                  { label: "Programmer une relance", icon: LuBellRing, onSelect: () => setFollowPreset({ targetType: "client", targetId: r.id, subject: `Suivi client ${r.name}` }), hidden: !canFollowup },
                  { label: "Créer un devis", icon: LuFileText, onSelect: () => router.push("/commercial/devis?nouveau=1"), hidden: !canQuote },
                  { label: "Supprimer", icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => setToDelete([r.id]), hidden: !acc.global || !acc.write },
                ]}
              />
            )}
          />
        </CardContent>
      </Card>

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} client={editing} />
      <FollowupFormDialog open={!!followPreset} onOpenChange={(o) => !o && setFollowPreset(null)} preset={followPreset ?? undefined} />

      <DetailSheet
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing?.name}
        description={viewing ? `${viewing.code} · ${clientSegment[viewing.segment]}` : undefined}
        badge={viewing && <StatusBadge def={clientStatus[viewing.status]} />}
        wide
        footer={
          viewing && acc.write && (
            <>
              {acc.global && (
                <Button variant="outline" onClick={() => setToDelete([viewing.id])}>
                  <LuTrash2 /> Supprimer
                </Button>
              )}
              <Button
                onClick={() => {
                  const c = viewing
                  setViewing(null)
                  openEdit(c)
                }}
              >
                <LuPencil /> Modifier
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="flex flex-col">
            <DetailSection title="Synthèse">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["CA total", formatMoney(viewing.revenue, { compact: true })],
                  ["Encours", formatMoney(viewing.balance, { compact: true })],
                  ["Factures", formatNumber(viewing.invoiceCount)],
                  ["Plafond crédit", formatMoney(viewing.creditLimit, { compact: true })],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-muted/60 p-3">
                    <div className="text-xs text-muted-foreground">{l}</div>
                    <div className="mt-1 font-semibold tabular">{v}</div>
                  </div>
                ))}
              </div>
            </DetailSection>
            <DetailSection title="Coordonnées">
              <DescriptionList
                items={[
                  { label: "Contact", value: viewing.contactName },
                  { label: "Commercial", value: employeeName(viewing.ownerId) },
                  { label: "Téléphone", value: <a className="inline-flex items-center gap-1.5 hover:underline" href={`tel:${viewing.phone}`}><LuPhone className="size-3.5" />{viewing.phone}</a> },
                  { label: "E-mail", value: viewing.email ? <a className="inline-flex items-center gap-1.5 hover:underline" href={`mailto:${viewing.email}`}><LuMail className="size-3.5" />{viewing.email}</a> : "—" },
                  { label: "Adresse", value: <span className="inline-flex items-center gap-1.5"><LuMapPin className="size-3.5" />{viewing.address}</span>, full: true },
                  { label: "Client depuis", value: formatDate(viewing.createdAt) },
                  { label: "Dernier achat", value: formatDate(viewing.lastPurchase) },
                  ...(viewing.notes ? [{ label: "Notes", value: viewing.notes, full: true }] : []),
                ]}
              />
            </DetailSection>
            <DetailSection title={`Factures (${viewingInvoices.length})`}>
              {viewingInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune facture pour ce client.</p>
              ) : (
                <div className="flex flex-col divide-y rounded-lg border">
                  {viewingInvoices.slice(0, 8).map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium">{inv.number}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(inv.date)}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="tabular">{formatMoney(invoiceTotal(inv))}</span>
                        <StatusBadge def={invoiceStatus[getInvoiceStatus(inv)]} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
            <DetailSection title={`Opportunités (${viewingOpps.length})`}>
              {viewingOpps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune opportunité en cours.</p>
              ) : (
                <div className="flex flex-col divide-y rounded-lg border">
                  {viewingOpps.map((o) => (
                    <div key={o.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{o.title}</span>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="tabular">{formatMoney(o.amount, { compact: true })}</span>
                        <StatusBadge def={opportunityStage[o.stage]} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
          </div>
        )}
      </DetailSheet>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer ${toDelete?.length ?? 0} client(s) ?`}
        description="Cette action est irréversible. Les factures et devis existants seront conservés mais ne seront plus rattachés à une fiche client."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          if (!toDelete) return
          if (!(await remove("clients", toDelete))) return
          toast.success(`${toDelete.length} client(s) supprimé(s)`)
          setToDelete(null)
          setViewing(null)
        }}
      />
    </Page>
  )
}
