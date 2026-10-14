"use client"

import * as React from "react"
import { toast } from "sonner"
import { LuBookOpen, LuCalculator, LuCircleCheck, LuLandmark, LuPlus, LuScale, LuTrash2, LuTrendingDown, LuTrendingUp } from "react-icons/lu"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChartCard } from "@/components/shared/chart-card"
import { RankingBars, TimeBarChart, bucketByPeriod } from "@/components/shared/charts"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DateRangePicker } from "@/components/shared/date-range-picker"
import { DetailSection, DetailSheet, DescriptionList } from "@/components/shared/detail-sheet"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { JournalEntryFormDialog } from "@/components/modules/finance/journal-form"
import { ExportMenu } from "@/components/shared/export-menu"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useTransientState } from "@/hooks/use-transient-state"
import { ACCOUNTS, ACCOUNT_CLASSES, accountName } from "@/lib/data/accounts"
import { DATE_PRESETS, describeRange, inRange, type DateRange } from "@/lib/date-range"
import { formatDate, formatMoney, formatPercent, toISODate } from "@/lib/format"
import { journalCode, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { JournalEntry, JournalLine } from "@/lib/types"
import { cn } from "@/lib/utils"

const accountOptions = ACCOUNTS.map((a) => ({ value: a.code, label: `${a.code} — ${a.name}` }))
const entryTotal = (e: JournalEntry) => e.lines.reduce((s, l) => s + l.debit, 0)

export default function AccountingPage() {
  const [tab, setTab] = React.useState("synthese")
  const [formOpen, setFormOpen] = useTransientState(false)
  return (
    <Page>
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <PageHeader
          icon={LuCalculator}
          title="Comptabilité"
          description="Plan SYSCOHADA : journaux, grand livre, balance et résultat."
          actions={
            <Button onClick={() => setFormOpen(true)}>
              <LuPlus /> Nouvelle écriture
            </Button>
          }
        />
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="synthese">Synthèse</TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="grand-livre">Grand livre</TabsTrigger>
          <TabsTrigger value="balance">Balance</TabsTrigger>
        </TabsList>
        <TabsContent value="synthese">{tab === "synthese" && <SummaryTab />}</TabsContent>
        <TabsContent value="journal">{tab === "journal" && <JournalTab />}</TabsContent>
        <TabsContent value="grand-livre">{tab === "grand-livre" && <LedgerTab />}</TabsContent>
        <TabsContent value="balance">{tab === "balance" && <BalanceTab />}</TabsContent>
      </Tabs>
      <JournalEntryFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </Page>
  )
}

/* ---------- Synthèse ---------- */

function SummaryTab() {
  const entries = useStore((s) => s.journalEntries)
  const [range, setRange] = React.useState<DateRange | undefined>(() => DATE_PRESETS.find((p) => p.id === "year")!.range())
  const [preset, setPreset] = React.useState<string | undefined>("year")

  const lines = React.useMemo(
    () => entries.filter((e) => e.status === "valide" && inRange(e.date, range)).flatMap((e) => e.lines.map((l) => ({ ...l, date: e.date }))),
    [entries, range]
  )
  const sumClass = (cls: string, sign: 1 | -1) => lines.filter((l) => l.account.startsWith(cls)).reduce((s, l) => s + sign * (l.debit - l.credit), 0)
  const products = sumClass("7", -1)
  const charges = sumClass("6", 1)
  const result = products - charges
  const treasuryEnd = React.useMemo(() => {
    const end = range?.to ? toISODate(range.to) : "9999"
    return entries
      .filter((e) => e.status === "valide" && e.date <= end)
      .flatMap((e) => e.lines)
      .filter((l) => l.account.startsWith("5"))
      .reduce((s, l) => s + l.debit - l.credit, 0)
  }, [entries, range])

  const trend = React.useMemo(
    () =>
      bucketByPeriod(
        lines,
        (l) => l.date,
        {
          products: (l) => (l.account.startsWith("7") ? l.credit - l.debit : 0),
          charges: (l) => (l.account.startsWith("6") ? l.debit - l.credit : 0),
        },
        range
      ),
    [lines, range]
  )
  const chargesByAccount = React.useMemo(() => {
    const m = new Map<string, number>()
    lines.filter((l) => l.account.startsWith("6")).forEach((l) => m.set(l.account, (m.get(l.account) ?? 0) + l.debit - l.credit))
    return [...m].map(([code, value]) => ({ label: `${code} · ${accountName(code)}`, value })).sort((a, b) => b.value - a.value).slice(0, 7)
  }, [lines])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker value={range} preset={preset} onChange={(r, p) => { setRange(r); setPreset(p) }} />
        <ExportMenu
          getOptions={() => ({
            filename: "compte-de-resultat",
            title: "Compte de résultat simplifié",
            subtitle: describeRange(range),
            summary: [
              { label: "Produits", value: formatMoney(products) },
              { label: "Charges", value: formatMoney(charges) },
              { label: "Résultat", value: formatMoney(result) },
              { label: "Trésorerie", value: formatMoney(treasuryEnd) },
            ],
            rows: ACCOUNTS.filter((a) => a.class === 6 || a.class === 7)
              .map((a) => ({ ...a, amount: lines.filter((l) => l.account === a.code).reduce((s, l) => s + (a.class === 7 ? l.credit - l.debit : l.debit - l.credit), 0) }))
              .filter((a) => a.amount !== 0),
            columns: [
              { header: "Compte", value: (a: { code: string }) => a.code },
              { header: "Intitulé", value: (a: { name: string }) => a.name },
              { header: "Nature", value: (a: { class: number }) => (a.class === 7 ? "Produit" : "Charge") },
              { header: "Montant", value: (a: { amount: number }) => a.amount, type: "money" },
            ],
          })}
        />
      </div>
      <StatGrid>
        <StatCard index={0} label="Produits (classe 7)" value={formatMoney(products, { compact: true })} icon={LuTrendingUp} tone="green" />
        <StatCard index={1} label="Charges (classe 6)" value={formatMoney(charges, { compact: true })} icon={LuTrendingDown} tone="red" />
        <StatCard index={2} label="Résultat net" value={formatMoney(result, { compact: true })} icon={LuScale} tone={result >= 0 ? "violet" : "red"} hint={`marge ${formatPercent(products ? (result / products) * 100 : 0)}`} />
        <StatCard index={3} label="Trésorerie (classe 5)" value={formatMoney(treasuryEnd, { compact: true })} icon={LuLandmark} tone="blue" hint="à la fin de la période" />
      </StatGrid>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Produits et charges" description={`Par ${trend.granularity}`} className="xl:col-span-2">
          <TimeBarChart
            data={trend.data}
            series={[
              { key: "products", label: "Produits", color: "var(--chart-1)" },
              { key: "charges", label: "Charges", color: "var(--chart-2)" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Principales charges" description="Par compte">
          <RankingBars items={chargesByAccount} color="var(--chart-2)" />
        </ChartCard>
      </div>
    </div>
  )
}

/* ---------- Journal ---------- */

function JournalTab() {
  const entries = useStore((s) => s.journalEntries)
  const update = useStore((s) => s.update)
  const remove = useStore((s) => s.remove)
  const [viewing, setViewing] = useTransientState<JournalEntry | null>(null)
  const [toDelete, setToDelete] = useTransientState<string | null>(null)

  const config = React.useMemo<FilterConfig<JournalEntry>>(
    () => ({
      search: { placeholder: "N°, libellé, pièce…", fields: (e) => [e.number, e.label, e.reference, ...e.lines.map((l) => l.account)] },
      date: { label: "Date d'écriture", accessor: (e) => e.date, defaultPreset: "month" },
      facets: [
        { id: "journal", label: "Journal", options: toOptions(journalCode), accessor: (e) => e.journal },
        { id: "status", label: "Statut", options: [{ value: "valide", label: "Validée" }, { value: "brouillon", label: "Brouillard" }], accessor: (e) => e.status },
      ],
      ranges: [{ id: "amount", label: "Montant", unit: "FCFA", accessor: entryTotal }],
    }),
    []
  )
  const filters = useFilters(entries, config)
  const data = filters.filtered
  const unbalanced = data.filter((e) => Math.round(e.lines.reduce((s, l) => s + l.debit - l.credit, 0)) !== 0).length

  const columns: Column<JournalEntry>[] = [
    { id: "date", header: "Date", accessor: (e) => e.date, cell: (e) => formatDate(e.date), exportType: "date" },
    { id: "number", header: "N° écriture", accessor: (e) => e.number, cell: (e) => <span className="font-medium">{e.number}</span> },
    { id: "journal", header: "Jnl", accessor: (e) => e.journal, cell: (e) => <Badge variant="outline" className="font-mono">{e.journal}</Badge> },
    { id: "label", header: "Libellé", accessor: (e) => e.label, className: "max-w-[280px] truncate" },
    { id: "reference", header: "Pièce", accessor: (e) => e.reference, hideOnMobile: true },
    { id: "accounts", header: "Comptes", accessor: (e) => e.lines.map((l) => l.account).join(", "), cell: (e) => <span className="font-mono text-xs text-muted-foreground">{e.lines.map((l) => l.account).join(" · ")}</span>, hideOnMobile: true },
    { id: "amount", header: "Montant", accessor: entryTotal, cell: (e) => formatMoney(entryTotal(e)), align: "right", exportType: "money", footer: (r) => formatMoney(r.reduce((s, e) => s + entryTotal(e), 0)) },
    { id: "status", header: "Statut", accessor: (e) => (e.status === "valide" ? "Validée" : "Brouillard"), cell: (e) => <Badge variant={e.status === "valide" ? "success" : "neutral"}>{e.status === "valide" ? "Validée" : "Brouillard"}</Badge> },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          {unbalanced > 0 && <p className="text-sm text-destructive">{unbalanced} écriture(s) déséquilibrée(s) dans la sélection.</p>}
          <DataTable
            data={data}
            columns={columns}
            getRowId={(e) => e.id}
            onRowClick={setViewing}
            defaultSort={{ id: "date", desc: true }}
            exportOptions={{
              filename: "journal-comptable",
              title: "Journal comptable",
              subtitle: filters.describe(),
              extraColumns: [],
            }}
            rowActions={(e) => (
              <RowActions
                actions={[
                  { label: "Valider", icon: LuCircleCheck, onSelect: () => { update("journalEntries", e.id, { status: "valide" }); toast.success("Écriture validée") }, hidden: e.status === "valide" },
                  { label: "Supprimer", icon: LuTrash2, destructive: true, onSelect: () => setToDelete(e.id), hidden: e.status === "valide" },
                  { label: "Voir les lignes", icon: LuBookOpen, onSelect: () => setViewing(e) },
                ]}
              />
            )}
          />
        </CardContent>
      </Card>
      <DetailSheet open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} title={viewing?.number} description={viewing?.label} wide>
        {viewing && (
          <div className="flex flex-col">
            <DetailSection title="En-tête">
              <DescriptionList
                items={[
                  { label: "Date", value: formatDate(viewing.date) },
                  { label: "Journal", value: `${viewing.journal} — ${journalCode[viewing.journal]}` },
                  { label: "Pièce", value: viewing.reference },
                  { label: "Statut", value: viewing.status === "valide" ? "Validée" : "Brouillard" },
                ]}
              />
            </DetailSection>
            <DetailSection title="Lignes">
              <LinesTable lines={viewing.lines} />
            </DetailSection>
          </div>
        )}
      </DetailSheet>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer cette écriture en brouillard ?"
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (toDelete) remove("journalEntries", [toDelete])
          toast.success("Écriture supprimée")
          setToDelete(null)
        }}
      />
    </div>
  )
}

function LinesTable({ lines }: { lines: JournalLine[] }) {
  const d = lines.reduce((s, l) => s + l.debit, 0)
  const c = lines.reduce((s, l) => s + l.credit, 0)
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Compte</th>
            <th className="px-3 py-2 text-left font-medium">Libellé</th>
            <th className="px-3 py-2 text-right font-medium">Débit</th>
            <th className="px-3 py-2 text-right font-medium">Crédit</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="px-3 py-2"><span className="font-mono">{l.account}</span> <span className="text-xs text-muted-foreground">{accountName(l.account)}</span></td>
              <td className="px-3 py-2">{l.label}</td>
              <td className="px-3 py-2 text-right tabular">{l.debit ? formatMoney(l.debit, { currency: false }) : ""}</td>
              <td className="px-3 py-2 text-right tabular">{l.credit ? formatMoney(l.credit, { currency: false }) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/40 font-semibold">
          <tr>
            <td className="px-3 py-2" colSpan={2}>Totaux</td>
            <td className="px-3 py-2 text-right tabular">{formatMoney(d, { currency: false })}</td>
            <td className="px-3 py-2 text-right tabular">{formatMoney(c, { currency: false })}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

/* ---------- Grand livre ---------- */

type LedgerRow = JournalLine & { id: string; date: string; number: string; journal: JournalEntry["journal"]; entryLabel: string; balance: number }

function LedgerTab() {
  const entries = useStore((s) => s.journalEntries)
  const flat = React.useMemo(
    () =>
      entries
        .filter((e) => e.status === "valide")
        .flatMap((e) => e.lines.map((l, i) => ({ ...l, id: `${e.id}-${i}`, date: e.date, number: e.number, journal: e.journal, entryLabel: e.label, balance: 0 })))
        .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number)),
    [entries]
  )
  const config = React.useMemo<FilterConfig<LedgerRow>>(
    () => ({
      search: { placeholder: "Libellé, n° écriture…", fields: (l) => [l.label, l.entryLabel, l.number] },
      date: { label: "Période", accessor: (l) => l.date, defaultPreset: "month" },
      facets: [
        { id: "account", label: "Compte", options: accountOptions, accessor: (l) => l.account },
        { id: "class", label: "Classe", options: Object.entries(ACCOUNT_CLASSES).map(([v, l]) => ({ value: v, label: `${v} — ${l}` })), accessor: (l) => l.account[0] },
        { id: "journal", label: "Journal", options: toOptions(journalCode), accessor: (l) => l.journal },
      ],
      ranges: [{ id: "amount", label: "Montant", unit: "FCFA", accessor: (l) => l.debit + l.credit }],
    }),
    []
  )
  const filters = useFilters(flat, config)
  // Solde progressif calculé dans l'ordre chronologique sur la sélection
  const data = React.useMemo(() => {
    const out: LedgerRow[] = []
    for (const l of filters.filtered) out.push({ ...l, balance: (out.at(-1)?.balance ?? 0) + l.debit - l.credit })
    return out
  }, [filters.filtered])
  const debit = data.reduce((s, l) => s + l.debit, 0)
  const credit = data.reduce((s, l) => s + l.credit, 0)

  const columns: Column<LedgerRow>[] = [
    { id: "date", header: "Date", accessor: (l) => l.date, cell: (l) => formatDate(l.date), exportType: "date" },
    { id: "number", header: "Écriture", accessor: (l) => l.number, hideOnMobile: true },
    { id: "journal", header: "Jnl", accessor: (l) => l.journal, hideOnMobile: true },
    { id: "account", header: "Compte", accessor: (l) => l.account, cell: (l) => <span className="font-mono">{l.account}</span> },
    { id: "label", header: "Libellé", accessor: (l) => l.label, className: "max-w-[260px] truncate" },
    { id: "debit", header: "Débit", accessor: (l) => l.debit, cell: (l) => (l.debit ? formatMoney(l.debit, { currency: false }) : ""), align: "right", exportType: "money", footer: () => formatMoney(debit, { currency: false }) },
    { id: "credit", header: "Crédit", accessor: (l) => l.credit, cell: (l) => (l.credit ? formatMoney(l.credit, { currency: false }) : ""), align: "right", exportType: "money", footer: () => formatMoney(credit, { currency: false }) },
    { id: "balance", header: "Solde progressif", accessor: (l) => l.balance, cell: (l) => <span className={cn(l.balance < 0 && "text-destructive")}>{formatMoney(l.balance, { currency: false })}</span>, align: "right", exportType: "money", sortable: false, footer: () => formatMoney(debit - credit, { currency: false }) },
  ]

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <FilterBar filters={filters} />
        <p className="text-xs text-muted-foreground">Astuce : filtrez sur un compte pour obtenir son extrait avec solde progressif.</p>
        <DataTable
          data={data}
          columns={columns}
          getRowId={(l) => l.id}
          pageSize={20}
          exportOptions={{ filename: "grand-livre", title: "Grand livre", subtitle: filters.describe(), summary: [{ label: "Total débit", value: formatMoney(debit) }, { label: "Total crédit", value: formatMoney(credit) }, { label: "Solde", value: formatMoney(debit - credit) }] }}
        />
      </CardContent>
    </Card>
  )
}

/* ---------- Balance ---------- */

type BalanceRow = { id: string; code: string; name: string; class: number; debit: number; credit: number; soldeD: number; soldeC: number }

function BalanceTab() {
  const entries = useStore((s) => s.journalEntries)
  const [range, setRange] = React.useState<DateRange | undefined>(() => DATE_PRESETS.find((p) => p.id === "year")!.range())
  const [preset, setPreset] = React.useState<string | undefined>("year")

  const rows = React.useMemo<BalanceRow[]>(() => {
    const m = new Map<string, { debit: number; credit: number }>()
    entries
      .filter((e) => e.status === "valide" && inRange(e.date, range))
      .forEach((e) =>
        e.lines.forEach((l) => {
          const v = m.get(l.account) ?? { debit: 0, credit: 0 }
          v.debit += l.debit
          v.credit += l.credit
          m.set(l.account, v)
        })
      )
    return [...m]
      .map(([code, v]) => {
        const acc = ACCOUNTS.find((a) => a.code === code)
        const solde = v.debit - v.credit
        return { id: code, code, name: acc?.name ?? code, class: acc?.class ?? Number(code[0]), ...v, soldeD: solde > 0 ? solde : 0, soldeC: solde < 0 ? -solde : 0 }
      })
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [entries, range])

  const config = React.useMemo<FilterConfig<BalanceRow>>(
    () => ({
      search: { placeholder: "N° ou intitulé de compte…", fields: (r) => [r.code, r.name] },
      facets: [{ id: "class", label: "Classe", options: Object.entries(ACCOUNT_CLASSES).map(([v, l]) => ({ value: v, label: `${v} — ${l}` })), accessor: (r) => String(r.class) }],
    }),
    []
  )
  const filters = useFilters(rows, config)
  const data = filters.filtered
  const tot = (k: keyof Pick<BalanceRow, "debit" | "credit" | "soldeD" | "soldeC">) => data.reduce((s, r) => s + r[k], 0)
  const balanced = Math.round(tot("debit") - tot("credit")) === 0

  const columns: Column<BalanceRow>[] = [
    { id: "code", header: "Compte", accessor: (r) => r.code, cell: (r) => <span className="font-mono font-medium">{r.code}</span> },
    { id: "name", header: "Intitulé", accessor: (r) => r.name },
    { id: "class", header: "Classe", accessor: (r) => r.class, cell: (r) => ACCOUNT_CLASSES[r.class] ?? r.class, hideOnMobile: true, exportValue: (r) => ACCOUNT_CLASSES[r.class] },
    { id: "debit", header: "Mouv. débit", accessor: (r) => r.debit, cell: (r) => formatMoney(r.debit, { currency: false }), align: "right", exportType: "money", footer: () => formatMoney(tot("debit"), { currency: false }) },
    { id: "credit", header: "Mouv. crédit", accessor: (r) => r.credit, cell: (r) => formatMoney(r.credit, { currency: false }), align: "right", exportType: "money", footer: () => formatMoney(tot("credit"), { currency: false }) },
    { id: "soldeD", header: "Solde débiteur", accessor: (r) => r.soldeD, cell: (r) => (r.soldeD ? formatMoney(r.soldeD, { currency: false }) : ""), align: "right", exportType: "money", footer: () => formatMoney(tot("soldeD"), { currency: false }) },
    { id: "soldeC", header: "Solde créditeur", accessor: (r) => r.soldeC, cell: (r) => (r.soldeC ? formatMoney(r.soldeC, { currency: false }) : ""), align: "right", exportType: "money", footer: () => formatMoney(tot("soldeC"), { currency: false }) },
  ]

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <FilterBar filters={filters}>
          <DateRangePicker value={range} preset={preset} onChange={(r, p) => { setRange(r); setPreset(p) }} align="end" />
        </FilterBar>
        <div className="flex items-center gap-2 text-sm">
          {balanced ? <Badge variant="success">Balance équilibrée</Badge> : <Badge variant="destructive">Balance déséquilibrée</Badge>}
          <span className="text-muted-foreground">{describeRange(range)}</span>
        </div>
        <DataTable
          data={data}
          columns={columns}
          getRowId={(r) => r.id}
          pageSize={50}
          exportOptions={{ filename: "balance-generale", title: "Balance générale", subtitle: `${describeRange(range)}${filters.describe() ? ` · ${filters.describe()}` : ""}` }}
        />
      </CardContent>
    </Card>
  )
}
