"use client"

import * as React from "react"
import { toast } from "sonner"
import { LuCircleDollarSign, LuMegaphone, LuPause, LuPencil, LuPlay, LuPlus, LuTag, LuTarget, LuTrash2, LuTrendingUp, LuUsers } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChartCard } from "@/components/shared/chart-card"
import { DonutChart, RankingBars, topWithOther } from "@/components/shared/charts"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { Badge } from "@/components/ui/badge"
import { CampaignFormDialog, PromotionFormDialog } from "@/components/modules/marketing/forms"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useModuleAccess } from "@/hooks/use-access"
import { useTransientState } from "@/hooks/use-transient-state"
import { formatDate, formatMoney, formatNumber, formatPercent, toISODate } from "@/lib/format"
import { campaignChannel, campaignStatus, clientSegment, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Campaign, Promotion } from "@/lib/types"

const roi = (c: Campaign) => (c.spent ? ((c.revenue - c.spent) / c.spent) * 100 : 0)

export default function MarketingPage() {
  const acc = useModuleAccess("marketing")
  const [tab, setTab] = React.useState("campagnes")
  const [campaignOpen, setCampaignOpen] = useTransientState(false)
  const [promoOpen, setPromoOpen] = useTransientState(false)
  const [editingCampaign, setEditingCampaign] = useTransientState<Campaign | undefined>(undefined)
  const [editingPromo, setEditingPromo] = useTransientState<Promotion | undefined>(undefined)

  return (
    <Page>
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <PageHeader
          icon={LuMegaphone}
          title="Marketing"
          description="Campagnes multicanales, retour sur investissement et codes promotionnels."
          actions={
            <>
              <TabsList>
                <TabsTrigger value="campagnes">Campagnes</TabsTrigger>
                <TabsTrigger value="promotions">Promotions</TabsTrigger>
              </TabsList>
              {!acc.write ? null : tab === "campagnes" ? (
                <Button onClick={() => { setEditingCampaign(undefined); setCampaignOpen(true) }}>
                  <LuPlus /> Nouvelle campagne
                </Button>
              ) : (
                <Button onClick={() => { setEditingPromo(undefined); setPromoOpen(true) }}>
                  <LuPlus /> Nouvelle promotion
                </Button>
              )}
            </>
          }
        />
        <TabsContent value="campagnes">
          <CampaignsTab onEdit={acc.write ? (c) => { setEditingCampaign(c); setCampaignOpen(true) } : undefined} />
        </TabsContent>
        <TabsContent value="promotions">
          <PromotionsTab onEdit={acc.write ? (p) => { setEditingPromo(p); setPromoOpen(true) } : undefined} />
        </TabsContent>
      </Tabs>
      <CampaignFormDialog open={campaignOpen} onOpenChange={setCampaignOpen} campaign={editingCampaign} />
      <PromotionFormDialog open={promoOpen} onOpenChange={setPromoOpen} promotion={editingPromo} />
    </Page>
  )
}

function CampaignsTab({ onEdit }: { onEdit?: (c: Campaign) => void }) {
  const campaigns = useStore((s) => s.campaigns)
  const update = useStore((s) => s.update)
  const remove = useStore((s) => s.remove)
  const { employeeName, employeeOptions } = useLookups()
  const [toDelete, setToDelete] = useTransientState<string[] | null>(null)

  const config = React.useMemo<FilterConfig<Campaign>>(
    () => ({
      search: { placeholder: "Nom de campagne…", fields: (c) => [c.name, c.description] },
      date: { label: "Date de début", accessor: (c) => c.startDate },
      facets: [
        { id: "status", label: "Statut", options: toOptions(campaignStatus), accessor: (c) => c.status },
        { id: "channel", label: "Canal", options: toOptions(campaignChannel), accessor: (c) => c.channel },
        { id: "segment", label: "Cible", options: [{ value: "tous", label: "Tous" }, ...toOptions(clientSegment)], accessor: (c) => c.segment },
        { id: "owner", label: "Responsable", options: employeeOptions, accessor: (c) => c.ownerId },
      ],
      ranges: [
        { id: "budget", label: "Budget", unit: "FCFA", accessor: (c) => c.budget },
        { id: "roi", label: "ROI", unit: "%", accessor: roi },
      ],
    }),
    [employeeOptions]
  )
  const filters = useFilters(campaigns, config)
  const data = filters.filtered

  const k = React.useMemo(() => {
    const budget = data.reduce((s, c) => s + c.budget, 0)
    const spent = data.reduce((s, c) => s + c.spent, 0)
    const revenue = data.reduce((s, c) => s + c.revenue, 0)
    const leads = data.reduce((s, c) => s + c.leads, 0)
    const conversions = data.reduce((s, c) => s + c.conversions, 0)
    return { budget, spent, revenue, leads, conversions, roi: spent ? ((revenue - spent) / spent) * 100 : 0, cpl: leads ? spent / leads : 0 }
  }, [data])

  const byChannel = React.useMemo(() => {
    const m = new Map<string, { spent: number; revenue: number }>()
    data.forEach((c) => {
      const v = m.get(c.channel) ?? { spent: 0, revenue: 0 }
      v.spent += c.spent
      v.revenue += c.revenue
      m.set(c.channel, v)
    })
    return [...m].map(([ch, v]) => ({ channel: campaignChannel[ch as Campaign["channel"]], ...v }))
  }, [data])

  const columns: Column<Campaign>[] = [
    { id: "name", header: "Campagne", accessor: (c) => c.name, cell: (c) => <div><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{campaignChannel[c.channel]} · {c.segment === "tous" ? "Tous" : clientSegment[c.segment]}</div></div>, className: "min-w-[220px]" },
    { id: "channel", header: "Canal", accessor: (c) => campaignChannel[c.channel], defaultHidden: true },
    { id: "period", header: "Période", accessor: (c) => c.startDate, cell: (c) => <span className="whitespace-nowrap">{formatDate(c.startDate)} → {formatDate(c.endDate)}</span>, exportValue: (c) => `${formatDate(c.startDate)} - ${formatDate(c.endDate)}`, hideOnMobile: true },
    {
      id: "budget",
      header: "Consommation",
      accessor: (c) => c.spent,
      cell: (c) => (
        <div className="flex min-w-36 flex-col gap-1">
          <div className="flex justify-between text-xs"><span className="tabular">{formatMoney(c.spent, { compact: true })}</span><span className="text-muted-foreground tabular">/ {formatMoney(c.budget, { compact: true })}</span></div>
          <Progress value={c.budget ? Math.min(100, (c.spent / c.budget) * 100) : 0} className="h-1.5" />
        </div>
      ),
      exportType: "money",
      hideOnMobile: true,
    },
    { id: "reach", header: "Portée", accessor: (c) => c.reach, cell: (c) => formatNumber(c.reach), align: "right", exportType: "number", hideOnMobile: true },
    { id: "leads", header: "Leads", accessor: (c) => c.leads, align: "right", exportType: "number", footer: (r) => formatNumber(r.reduce((s, c) => s + c.leads, 0)) },
    { id: "conversions", header: "Conv.", accessor: (c) => c.conversions, align: "right", exportType: "number", hideOnMobile: true },
    { id: "revenue", header: "CA généré", accessor: (c) => c.revenue, cell: (c) => formatMoney(c.revenue, { compact: true }), align: "right", exportType: "money", footer: (r) => formatMoney(r.reduce((s, c) => s + c.revenue, 0), { compact: true }) },
    { id: "roi", header: "ROI", accessor: roi, cell: (c) => <span className={roi(c) >= 0 ? "text-success" : "text-destructive"}>{c.spent ? formatPercent(roi(c), 0) : "—"}</span>, align: "right", exportType: "percent" },
    { id: "owner", header: "Responsable", accessor: (c) => employeeName(c.ownerId), defaultHidden: true },
    { id: "status", header: "Statut", accessor: (c) => campaignStatus[c.status].label, cell: (c) => <StatusBadge def={campaignStatus[c.status]} /> },
  ]

  return (
    <div className="flex flex-col gap-6">
      <StatGrid>
        <StatCard index={0} label="Budget engagé" value={formatMoney(k.spent, { compact: true })} icon={LuCircleDollarSign} hint={`sur ${formatMoney(k.budget, { compact: true })} alloués`} />
        <StatCard index={1} label="Leads générés" value={formatNumber(k.leads)} icon={LuUsers} tone="blue" hint={`coût/lead ${formatMoney(k.cpl, { compact: true })}`} />
        <StatCard index={2} label="Conversions" value={formatNumber(k.conversions)} icon={LuTarget} tone="orange" hint={`taux ${formatPercent(k.leads ? (k.conversions / k.leads) * 100 : 0)}`} />
        <StatCard index={3} label="Retour sur investissement" value={formatPercent(k.roi, 0)} icon={LuTrendingUp} tone="green" hint={`${formatMoney(k.revenue, { compact: true })} de CA`} />
      </StatGrid>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="CA généré par canal">
          <RankingBars items={byChannel.map((c) => ({ label: c.channel, value: c.revenue })).sort((a, b) => b.value - a.value)} color="var(--chart-3)" />
        </ChartCard>
        <ChartCard title="Dépenses par canal">
          <DonutChart data={topWithOther(byChannel.map((c) => ({ name: c.channel, value: c.spent })))} centerValue={formatMoney(k.spent, { compact: true })} centerLabel="dépensé" />
        </ChartCard>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          <DataTable
            data={data}
            columns={columns}
            getRowId={(c) => c.id}
            onRowClick={onEdit}
            selectable={!!onEdit}
            defaultSort={{ id: "period", desc: true }}
            exportOptions={{
              filename: "campagnes",
              title: "Campagnes marketing",
              subtitle: filters.describe(),
              summary: [
                { label: "Budget engagé", value: formatMoney(k.spent) },
                { label: "Leads", value: formatNumber(k.leads) },
                { label: "Conversions", value: formatNumber(k.conversions) },
                { label: "ROI", value: formatPercent(k.roi, 0) },
              ],
            }}
            bulkActions={(sel) => (
              <Button variant="destructive" size="sm" onClick={() => setToDelete(sel.map((c) => c.id))}>
                <LuTrash2 /> Supprimer
              </Button>
            )}
            rowActions={onEdit && ((c) => (
              <RowActions
                actions={[
                  { label: "Modifier", icon: LuPencil, onSelect: () => onEdit(c) },
                  { label: "Lancer", icon: LuPlay, onSelect: () => { update("campaigns", c.id, { status: "en_cours" }); toast.success("Campagne lancée") }, hidden: !["brouillon", "planifiee", "suspendue"].includes(c.status) },
                  { label: "Suspendre", icon: LuPause, onSelect: () => { update("campaigns", c.id, { status: "suspendue" }); toast.success("Campagne suspendue") }, hidden: c.status !== "en_cours" },
                  { label: "Supprimer", icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => setToDelete([c.id]) },
                ]}
              />
            ))}
          />
        </CardContent>
      </Card>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer ${toDelete?.length ?? 0} campagne(s) ?`}
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (toDelete) remove("campaigns", toDelete)
          toast.success("Campagne(s) supprimée(s)")
          setToDelete(null)
        }}
      />
    </div>
  )
}

function PromotionsTab({ onEdit }: { onEdit?: (p: Promotion) => void }) {
  const promotions = useStore((s) => s.promotions)
  const update = useStore((s) => s.update)
  const remove = useStore((s) => s.remove)
  const { categoryName, categoryOptions } = useLookups()
  const [toDelete, setToDelete] = useTransientState<string[] | null>(null)
  const today = toISODate(new Date())
  const state = (p: Promotion) => (!p.active ? "inactive" : p.endDate < today ? "expiree" : p.startDate > today ? "a_venir" : "en_cours")
  const stateDef = {
    en_cours: { label: "En cours", tone: "success" as const },
    a_venir: { label: "À venir", tone: "info" as const },
    expiree: { label: "Expirée", tone: "neutral" as const },
    inactive: { label: "Désactivée", tone: "warning" as const },
  }

  const config = React.useMemo<FilterConfig<Promotion>>(
    () => ({
      search: { placeholder: "Code, libellé…", fields: (p) => [p.code, p.name] },
      date: { label: "Date de début", accessor: (p) => p.startDate },
      facets: [
        { id: "state", label: "État", options: Object.entries(stateDef).map(([value, d]) => ({ value, label: d.label })), accessor: state },
        { id: "type", label: "Type", options: [{ value: "pourcentage", label: "Pourcentage" }, { value: "montant", label: "Montant fixe" }], accessor: (p) => p.type },
        { id: "category", label: "Catégorie", options: [{ value: "", label: "Toutes catégories" }, ...categoryOptions], accessor: (p) => p.categoryId ?? "" },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryOptions, today]
  )
  const filters = useFilters(promotions, config)
  const data = filters.filtered

  const columns: Column<Promotion>[] = [
    { id: "code", header: "Code", accessor: (p) => p.code, cell: (p) => <Badge variant="outline" className="font-mono">{p.code}</Badge> },
    { id: "name", header: "Libellé", accessor: (p) => p.name },
    { id: "value", header: "Remise", accessor: (p) => p.value, cell: (p) => (p.type === "pourcentage" ? `${p.value} %` : formatMoney(p.value)), exportValue: (p) => (p.type === "pourcentage" ? `${p.value} %` : formatMoney(p.value)), align: "right" },
    { id: "minAmount", header: "Minimum", accessor: (p) => p.minAmount, cell: (p) => (p.minAmount ? formatMoney(p.minAmount) : "—"), align: "right", exportType: "money", hideOnMobile: true },
    { id: "category", header: "Catégorie", accessor: (p) => categoryName(p.categoryId), hideOnMobile: true },
    { id: "period", header: "Validité", accessor: (p) => p.startDate, cell: (p) => <span className="whitespace-nowrap">{formatDate(p.startDate)} → {formatDate(p.endDate)}</span>, exportValue: (p) => `${formatDate(p.startDate)} - ${formatDate(p.endDate)}`, hideOnMobile: true },
    {
      id: "usage",
      header: "Utilisation",
      accessor: (p) => p.usageCount,
      cell: (p) => (
        <div className="flex min-w-28 flex-col gap-1">
          <span className="text-xs tabular">{p.usageCount} / {p.usageLimit}</span>
          <Progress value={(p.usageCount / p.usageLimit) * 100} className="h-1.5" />
        </div>
      ),
      exportType: "number",
    },
    { id: "state", header: "État", accessor: (p) => stateDef[state(p)].label, cell: (p) => <StatusBadge def={stateDef[state(p)]} /> },
    {
      id: "active",
      header: "Active",
      sortable: false,
      exportType: false,
      cell: (p) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Switch disabled={!onEdit} checked={p.active} onCheckedChange={(v) => { update("promotions", p.id, { active: v }); toast.success(v ? "Promotion activée" : "Promotion désactivée", { description: p.code }) }} aria-label="Activer" />
        </div>
      ),
    },
  ]

  const active = data.filter((p) => state(p) === "en_cours").length
  const uses = data.reduce((s, p) => s + p.usageCount, 0)

  return (
    <div className="flex flex-col gap-6">
      <StatGrid className="xl:grid-cols-3">
        <StatCard index={0} label="Promotions en cours" value={formatNumber(active)} icon={LuTag} tone="green" />
        <StatCard index={1} label="Utilisations totales" value={formatNumber(uses)} icon={LuUsers} tone="blue" />
        <StatCard index={2} label="Codes enregistrés" value={formatNumber(data.length)} icon={LuMegaphone} />
      </StatGrid>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          <DataTable
            data={data}
            columns={columns}
            getRowId={(p) => p.id}
            onRowClick={onEdit}
            defaultSort={{ id: "period", desc: true }}
            exportOptions={{ filename: "promotions", title: "Codes promotionnels", subtitle: filters.describe() }}
            rowActions={onEdit && ((p) => (
              <RowActions
                actions={[
                  { label: "Modifier", icon: LuPencil, onSelect: () => onEdit(p) },
                  { label: "Supprimer", icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => setToDelete([p.id]) },
                ]}
              />
            ))}
          />
        </CardContent>
      </Card>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer cette promotion ?"
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (toDelete) remove("promotions", toDelete)
          toast.success("Promotion supprimée")
          setToDelete(null)
        }}
      />
    </div>
  )
}
