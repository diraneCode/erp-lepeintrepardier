"use client"

import * as React from "react"
import { LuArrowDownLeft, LuArrowUpRight, LuCircleAlert, LuLandmark, LuPlus, LuReceipt, LuVault } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DescriptionList, DetailSection, DetailSheet } from "@/components/shared/detail-sheet"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { CashFormDialog, type ManualCashKind } from "@/components/modules/finance/cash-form"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useCurrentUser, useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useTransientState } from "@/hooks/use-transient-state"
import { formatDate, formatDateTime, formatMoney, toISODate } from "@/lib/format"
import { cashKind, depositMode, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { CashMovement } from "@/lib/types"
import { cn } from "@/lib/utils"

type Row = CashMovement & { inAmount: number; outAmount: number; balance: number; order: string }

/** Ordre chronologique d'une opération (jour, heure de saisie, numéro). */
const orderKey = (m: CashMovement) => `${m.date}|${m.createdAt ?? ""}|${m.number}`

export default function CashPage() {
  const acc = useModuleAccess("caisse")
  const me = useCurrentUser()
  const { shops } = useScopedData(["shops"])
  const all = useStore((s) => s.cashMovements)
  const { employeeName } = useLookups(["employeeName"])

  // Caisse affichée : celle de sa boutique, ou au choix pour l'administration
  const [chosen, setChosen] = React.useState<string | null>(null)
  const locationId = acc.global ? (chosen ?? shops[0]?.id ?? "") : (me?.locationId ?? "")
  const locationName = shops.find((s) => s.id === locationId)?.name ?? "—"

  const [formKind, setFormKind] = useTransientState<ManualCashKind | null>(null)
  const [viewing, setViewing] = useTransientState<Row | null>(null)

  // Brouillard complet de la caisse avec solde courant après chaque opération
  const ledger = React.useMemo<Row[]>(() => {
    const sorted = all
      .filter((m) => m.locationId === locationId)
      .map((m) => ({ m, order: orderKey(m) }))
      .sort((a, b) => a.order.localeCompare(b.order))
    const rows: Row[] = []
    for (const { m, order } of sorted) {
      const previous = rows.length ? rows[rows.length - 1].balance : 0
      const inAmount = m.direction === "entree" ? m.amount : 0
      const outAmount = m.direction === "sortie" ? m.amount : 0
      rows.push({ ...m, order, inAmount, outAmount, balance: previous + inAmount - outAmount })
    }
    return rows
  }, [all, locationId])
  const currentBalance = ledger.at(-1)?.balance ?? 0

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "Libellé, n° de pièce, client, banque…", fields: (r) => [r.label, r.number, r.reference, r.clientName, r.bankName, r.slipNumber, r.depositor] },
      date: { label: "Période", accessor: (r) => r.date, defaultPreset: "month" },
      facets: [
        { id: "kind", label: "Opération", options: toOptions(cashKind), accessor: (r) => r.kind },
        { id: "direction", label: "Sens", options: [{ value: "entree", label: "Encaissements" }, { value: "sortie", label: "Décaissements" }], accessor: (r) => r.direction },
      ],
      ranges: [{ id: "amount", label: "Montant", unit: "FCFA", accessor: (r) => r.amount }],
    }),
    []
  )
  const filters = useFilters(ledger, config)
  const data = filters.filtered

  // Solde initial = solde à la veille du début de la période
  const from = filters.state.date?.from ? toISODate(filters.state.date.from) : null
  const to = filters.state.date?.to ? toISODate(filters.state.date.to) : null
  const openingBalance = from ? ledger.filter((r) => r.date < from).at(-1)?.balance ?? 0 : 0
  const closingBalance = to ? ledger.filter((r) => r.date <= to).at(-1)?.balance ?? openingBalance : currentBalance

  const k = React.useMemo(
    () => ({
      in: data.reduce((s, r) => s + r.inAmount, 0),
      out: data.reduce((s, r) => s + r.outAmount, 0),
      bank: data.filter((r) => r.kind === "versement_banque").reduce((s, r) => s + r.amount, 0),
      bankCount: data.filter((r) => r.kind === "versement_banque").length,
      expenses: data.filter((r) => r.kind === "depense").reduce((s, r) => s + r.amount, 0),
    }),
    [data]
  )

  const columns: Column<Row>[] = [
    {
      id: "date",
      header: "Date",
      accessor: (r) => r.order,
      cell: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span>,
      exportValue: (r) => formatDate(r.date),
    },
    { id: "number", header: "N° pièce", accessor: (r) => r.number, cell: (r) => <span className="font-medium whitespace-nowrap">{r.number}</span>, hideOnMobile: true },
    { id: "reference", header: "N° facture / réf.", accessor: (r) => r.reference ?? "", cell: (r) => r.reference ?? "—", hideOnMobile: true },
    { id: "client", header: "Client / bénéficiaire", accessor: (r) => r.clientName ?? r.bankName ?? "", cell: (r) => r.clientName ?? r.bankName ?? "—", className: "max-w-[180px] truncate", hideOnMobile: true },
    {
      id: "label",
      header: "Libellé",
      accessor: (r) => r.label,
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate">{r.label}</div>
          {r.kind === "versement_banque" && (
            <div className="truncate text-xs text-muted-foreground">
              {[r.bankName, r.depositMode && depositMode[r.depositMode], r.slipNumber && `bordereau ${r.slipNumber}`, r.depositor && `par ${r.depositor}`].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      ),
      className: "min-w-[200px] max-w-[320px]",
    },
    { id: "kind", header: "Opération", accessor: (r) => cashKind[r.kind].label, cell: (r) => <StatusBadge def={cashKind[r.kind]} />, hideOnMobile: true },
    {
      id: "in",
      header: "Encaissements",
      accessor: (r) => r.inAmount,
      cell: (r) => (r.inAmount ? <span className="text-success tabular">{formatMoney(r.inAmount)}</span> : ""),
      align: "right",
      exportType: "money",
      footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.inAmount, 0)),
    },
    {
      id: "out",
      header: "Décaissements",
      accessor: (r) => r.outAmount,
      cell: (r) => (r.outAmount ? <span className="text-destructive tabular">{formatMoney(r.outAmount)}</span> : ""),
      align: "right",
      exportType: "money",
      footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.outAmount, 0)),
    },
    {
      id: "balance",
      header: "Solde",
      accessor: (r) => r.balance,
      cell: (r) => <span className={cn("font-medium tabular", r.balance < 0 && "text-destructive")}>{formatMoney(r.balance)}</span>,
      align: "right",
      exportType: "money",
    },
  ]

  const periodLabel = from && to ? `du ${formatDate(from)} au ${formatDate(to)}` : "toutes périodes"

  return (
    <Page>
      <PageHeader
        icon={LuVault}
        title="Caisse"
        description={`Brouillard de caisse${acc.global ? "" : ` · ${locationName}`} : encaissements, décaissements et versements en banque.`}
        actions={
          <>
            {acc.global && shops.length > 0 && (
              <Select value={locationId} onValueChange={setChosen}>
                <SelectTrigger className="w-56" aria-label="Caisse">
                  <SelectValue placeholder="Choisir une caisse" />
                </SelectTrigger>
                <SelectContent>
                  {shops.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      Caisse {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {acc.write && locationId && (
              <>
                <Button variant="outline" onClick={() => setFormKind("depense")}>
                  <LuReceipt /> Dépense
                </Button>
                <Button variant="outline" onClick={() => setFormKind("versement_banque")}>
                  <LuLandmark /> Versement en banque
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button>
                      <LuPlus /> Autre opération
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setFormKind("apport")}>
                      <LuArrowDownLeft /> Approvisionnement de caisse
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setFormKind("autre_entree")}>
                      <LuArrowDownLeft /> Autre entrée
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setFormKind("autre_sortie")}>
                      <LuArrowUpRight /> Autre sortie
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </>
        }
      />

      {currentBalance < 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            Le solde théorique de la caisse est négatif ({formatMoney(currentBalance)}). Une sortie a été enregistrée sans les espèces correspondantes : enregistrez
            l&apos;approvisionnement manquant ou vérifiez les dernières opérations.
          </span>
        </div>
      )}

      <Card>
        <CardContent>
          <FilterBar filters={filters} />
        </CardContent>
      </Card>

      <StatGrid>
        <StatCard index={0} label="Solde en caisse" value={formatMoney(currentBalance)} icon={LuVault} tone={currentBalance < 0 ? "red" : "violet"} hint="à cet instant" />
        <StatCard index={1} label="Encaissements" value={formatMoney(k.in, { compact: true })} icon={LuArrowDownLeft} tone="green" hint={periodLabel} />
        <StatCard index={2} label="Décaissements" value={formatMoney(k.out, { compact: true })} icon={LuArrowUpRight} tone="orange" hint={`dont ${formatMoney(k.expenses, { compact: true })} de dépenses`} />
        <StatCard index={3} label="Versé en banque" value={formatMoney(k.bank, { compact: true })} icon={LuLandmark} tone="blue" hint={`${k.bankCount} versement(s)`} />
      </StatGrid>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-2 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-3">
            <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
              <span className="text-muted-foreground">Solde initial{from ? ` au ${formatDate(from)}` : ""}</span>
              <span className="font-semibold tabular">{formatMoney(openingBalance)}</span>
            </div>
            <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
              <span className="text-muted-foreground">Encaissements − décaissements</span>
              <span className="font-semibold tabular">{formatMoney(k.in - k.out)}</span>
            </div>
            <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
              <span className="text-muted-foreground">Solde final{to ? ` au ${formatDate(to)}` : ""}</span>
              <span className={cn("font-semibold tabular", closingBalance < 0 && "text-destructive")}>{formatMoney(closingBalance)}</span>
            </div>
          </div>
          <DataTable
            data={data}
            columns={columns}
            getRowId={(r) => r.id}
            onRowClick={setViewing}
            defaultSort={{ id: "date" }}
            pageSize={25}
            emptyTitle="Aucune opération sur la période"
            emptyDescription="Les ventes et règlements en espèces, dépenses et versements apparaissent ici automatiquement."
            exportOptions={{
              filename: `brouillard-caisse-${locationName.toLowerCase().replace(/\s+/g, "-")}`,
              title: `Brouillard de caisse — ${locationName}`,
              subtitle: filters.describe(),
              summary: [
                { label: "Solde initial", value: formatMoney(openingBalance) },
                { label: "Encaissements", value: formatMoney(k.in) },
                { label: "Décaissements", value: formatMoney(k.out) },
                { label: "Solde final", value: formatMoney(closingBalance) },
              ],
            }}
          />
        </CardContent>
      </Card>

      {locationId && (
        <CashFormDialog
          open={!!formKind}
          onOpenChange={(o) => !o && setFormKind(null)}
          kind={formKind ?? "versement_banque"}
          locationId={locationId}
          locationName={locationName}
          balance={currentBalance}
        />
      )}

      <DetailSheet
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing?.label}
        description={viewing ? `${viewing.number} · ${formatDate(viewing.date)}` : undefined}
        badge={viewing && <StatusBadge def={cashKind[viewing.kind]} />}
      >
        {viewing && (
          <div className="flex flex-col">
            <DetailSection title="Opération">
              <DescriptionList
                items={[
                  { label: viewing.direction === "entree" ? "Encaissement" : "Décaissement", value: formatMoney(viewing.amount) },
                  { label: "Solde après l'opération", value: formatMoney(viewing.balance) },
                  { label: "Caisse", value: locationName },
                  { label: "N° facture / référence", value: viewing.reference },
                  { label: viewing.kind === "depense" ? "Bénéficiaire" : "Client", value: viewing.clientName },
                  { label: "Saisie le", value: viewing.createdAt ? formatDateTime(viewing.createdAt) : undefined },
                  { label: "Par", value: viewing.userId ? employeeName(viewing.userId) : "Automatique" },
                  { label: "Observation", value: viewing.note, full: true },
                ]}
              />
            </DetailSection>
            {viewing.kind === "versement_banque" && (
              <DetailSection title="Versement en banque">
                <DescriptionList
                  items={[
                    { label: "Banque", value: viewing.bankName },
                    { label: "Mode de versement", value: viewing.depositMode ? depositMode[viewing.depositMode] : undefined },
                    { label: "N° de compte", value: viewing.bankAccount },
                    { label: "N° de bordereau", value: viewing.slipNumber },
                    { label: "Déposant", value: viewing.depositor },
                  ]}
                />
              </DetailSection>
            )}
            <p className="pt-4 text-xs text-muted-foreground">
              Les opérations de caisse ne sont ni modifiables ni supprimables. Pour corriger une erreur, enregistrez l&apos;opération inverse.
            </p>
          </div>
        )}
      </DetailSheet>
    </Page>
  )
}
