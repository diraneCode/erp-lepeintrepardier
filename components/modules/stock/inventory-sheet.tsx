"use client"

import * as React from "react"
import { toast } from "sonner"
import { LuArrowLeft, LuCircleCheck, LuCopyCheck, LuSave, LuScale, LuTrendingDown, LuTrendingUp, LuX } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Combobox } from "@/components/forms/fields"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useTransientState } from "@/hooks/use-transient-state"
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format"
import { inventoryScope, inventoryStatus } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Inventory, InventoryLine } from "@/lib/types"
import { cn } from "@/lib/utils"

type LineState = "non_compte" | "conforme" | "ecart"
type Row = InventoryLine & { name: string; sku: string; categoryId: string; unitCost: number; count: number | null; note: string; gap: number | null; gapValue: number; state: LineState }

const STATE_OPTIONS = [
  { value: "non_compte", label: "Non compté" },
  { value: "conforme", label: "Conforme" },
  { value: "ecart", label: "Avec écart" },
]

/** Saisie en cours, non encore enregistrée */
type Draft = Record<string, { counted?: string; comment?: string }>

const parseCount = (v: string | undefined): number | null | undefined => {
  if (v === undefined) return undefined
  const t = v.trim()
  if (t === "") return null
  const n = Number(t.replace(/\s/g, "").replace(",", "."))
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

export function InventorySheet({ inventory, canEdit, onBack }: { inventory: Inventory; canEdit: boolean; onBack: () => void }) {
  const allLines = useStore((s) => s.inventoryLines)
  const save = useStore((s) => s.saveInventoryCounts)
  const validate = useStore((s) => s.validateInventory)
  const cancel = useStore((s) => s.cancelInventory)
  const { productById, productOptions, categoryOptions, categoryName, locationName, employeeName } = useLookups(["productById", "productOptions", "categoryOptions", "categoryName", "locationName", "employeeName"])
  const [draft, setDraft] = React.useState<Draft>({})
  const [saving, setSaving] = React.useState(false)
  const [confirm, setConfirm] = useTransientState<"validate" | "cancel" | "leave" | null>(null)
  const open = inventory.status === "en_cours" && canEdit

  const rows = React.useMemo<Row[]>(
    () =>
      allLines
        .filter((l) => l.inventoryId === inventory.id)
        .map((l) => {
          const p = productById.get(l.productId)
          const d = draft[l.productId]
          const parsed = parseCount(d?.counted)
          const count = parsed === undefined ? (l.counted ?? null) : parsed
          const gap = count === null ? null : count - l.expected
          const unitCost = p?.purchasePrice ?? 0
          return {
            ...l,
            name: p?.name ?? "Produit supprimé",
            sku: p?.sku ?? "",
            categoryId: p?.categoryId ?? "",
            unitCost,
            count,
            note: d?.comment ?? l.comment ?? "",
            gap,
            gapValue: (gap ?? 0) * unitCost,
            state: count === null ? "non_compte" : gap === 0 ? "conforme" : "ecart",
          }
        }),
    [allLines, inventory.id, productById, draft]
  )

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "Produit, référence…", fields: (r) => [r.name, r.sku, r.note] },
      facets: [
        { id: "state", label: "État", options: STATE_OPTIONS, accessor: (r) => r.state },
        { id: "category", label: "Catégorie", options: categoryOptions, accessor: (r) => r.categoryId },
      ],
    }),
    [categoryOptions]
  )
  const filters = useFilters(rows, config)

  const k = React.useMemo(() => {
    const counted = rows.filter((r) => r.count !== null)
    const gaps = counted.filter((r) => r.gap !== 0)
    return {
      total: rows.length,
      counted: counted.length,
      gaps: gaps.length,
      surplus: gaps.reduce((s, r) => s + Math.max(0, r.gapValue), 0),
      shortage: gaps.reduce((s, r) => s + Math.min(0, r.gapValue), 0),
      accuracy: counted.length ? ((counted.length - gaps.length) / counted.length) * 100 : 0,
    }
  }, [rows])

  const dirty = Object.keys(draft).filter((id) => {
    const line = rows.find((r) => r.productId === id)
    if (!line) return false
    const d = draft[id]
    const original = allLines.find((l) => l.inventoryId === inventory.id && l.productId === id)
    return (d.counted !== undefined && parseCount(d.counted) !== (original?.counted ?? null)) || (d.comment !== undefined && d.comment !== (original?.comment ?? ""))
  })
  const invalid = Object.entries(draft).some(([, d]) => d.counted !== undefined && parseCount(d.counted) === undefined)

  const setField = (productId: string, field: "counted" | "comment", value: string) => setDraft((d) => ({ ...d, [productId]: { ...d[productId], [field]: value } }))

  const persist = async () => {
    if (invalid) {
      toast.error("Quantités invalides", { description: "Les quantités comptées doivent être des nombres entiers positifs." })
      return false
    }
    if (!dirty.length) return true
    setSaving(true)
    const ok = await save(
      inventory.id,
      dirty.map((id) => {
        const r = rows.find((x) => x.productId === id)!
        return { productId: id, counted: r.count, comment: r.note || undefined }
      })
    )
    setSaving(false)
    if (ok) {
      setDraft({})
      toast.success("Comptage enregistré", { description: `${dirty.length} ligne(s) mise(s) à jour` })
    }
    return ok
  }

  // Les lignes non comptées reprennent le stock théorique (comptage par exception)
  const fillExpected = () => {
    const next: Draft = { ...draft }
    rows.filter((r) => r.count === null).forEach((r) => (next[r.productId] = { ...next[r.productId], counted: String(r.expected) }))
    setDraft(next)
    toast.info("Quantités théoriques reportées", { description: "Vérifiez puis enregistrez." })
  }

  const addProduct = async (productId: string) => {
    if (!productId || rows.some((r) => r.productId === productId)) return
    const ok = await save(inventory.id, [{ productId, counted: null }])
    if (ok) toast.success("Produit ajouté à la fiche", { description: productById.get(productId)?.name })
  }

  const doValidate = async () => {
    if (!(await persist())) return
    const n = await validate(inventory.id)
    if (n < 0) return
    toast.success("Inventaire validé", { description: n ? `${n} ajustement(s) de stock enregistré(s)` : "Aucun écart : le stock est conforme." })
    setConfirm(null)
  }

  const doCancel = async () => {
    if (!(await cancel(inventory.id))) return
    toast.success("Inventaire annulé")
    setConfirm(null)
  }

  const columns: Column<Row>[] = [
    {
      id: "product",
      header: "Produit",
      accessor: (r) => r.name,
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{r.name}</div>
          <div className="text-xs text-muted-foreground">{r.sku}</div>
        </div>
      ),
      className: "min-w-[220px] max-w-[300px]",
    },
    { id: "sku", header: "Référence", accessor: (r) => r.sku, defaultHidden: true },
    { id: "category", header: "Catégorie", accessor: (r) => categoryName(r.categoryId), hideOnMobile: true },
    { id: "expected", header: "Théorique", accessor: (r) => r.expected, cell: (r) => <span className="tabular">{formatNumber(r.expected)}</span>, align: "right", exportType: "number" },
    {
      id: "counted",
      header: "Compté",
      accessor: (r) => r.count ?? -1,
      cell: (r) =>
        open ? (
          <Input
            inputMode="numeric"
            aria-label={`Quantité comptée — ${r.name}`}
            className={cn("ml-auto h-8 w-24 text-right tabular", draft[r.productId]?.counted !== undefined && parseCount(draft[r.productId]?.counted) === undefined && "border-destructive")}
            value={draft[r.productId]?.counted ?? (r.counted ?? "").toString()}
            placeholder="—"
            onChange={(e) => setField(r.productId, "counted", e.target.value)}
            onKeyDown={(e) => {
              // Entrée : passe à la ligne suivante
              if (e.key !== "Enter") return
              e.preventDefault()
              const inputs = [...document.querySelectorAll<HTMLInputElement>("input[data-count]")]
              inputs[inputs.indexOf(e.currentTarget) + 1]?.focus()
            }}
            data-count
          />
        ) : (
          <span className="tabular">{r.count === null ? "—" : formatNumber(r.count)}</span>
        ),
      exportValue: (r) => (r.count === null ? "" : r.count),
      align: "right",
    },
    {
      id: "gap",
      header: "Écart",
      accessor: (r) => r.gap ?? 0,
      cell: (r) =>
        r.gap === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={cn("font-medium tabular", r.gap > 0 && "text-info", r.gap < 0 && "text-destructive", r.gap === 0 && "text-success")}>
            {r.gap > 0 ? "+" : ""}
            {formatNumber(r.gap)}
          </span>
        ),
      exportValue: (r) => (r.gap === null ? "" : r.gap),
      align: "right",
    },
    {
      id: "gapValue",
      header: "Valeur écart",
      accessor: (r) => r.gapValue,
      cell: (r) => (r.gap ? <span className={cn("tabular", r.gapValue < 0 ? "text-destructive" : "text-info")}>{formatMoney(r.gapValue)}</span> : ""),
      align: "right",
      exportType: "money",
      hideOnMobile: true,
      footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.gapValue, 0)),
    },
    {
      id: "comment",
      header: "Commentaire",
      accessor: (r) => r.note,
      cell: (r) =>
        open ? (
          <Input className="h-8 min-w-40" aria-label={`Commentaire — ${r.name}`} value={r.note} placeholder="Casse, péremption…" onChange={(e) => setField(r.productId, "comment", e.target.value)} />
        ) : (
          <span className="text-muted-foreground">{r.note || "—"}</span>
        ),
      hideOnMobile: true,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="icon" aria-label="Retour à la liste" onClick={() => (dirty.length ? setConfirm("leave") : onBack())}>
            <LuArrowLeft />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{inventory.label}</h2>
              <StatusBadge def={inventoryStatus[inventory.status]} />
            </div>
            <p className="text-sm text-muted-foreground">
              {inventory.number} · {locationName(inventory.locationId)} · {formatDate(inventory.date)} · {inventoryScope[inventory.scope]}
              {inventory.categoryId ? ` (${categoryName(inventory.categoryId)})` : ""}
            </p>
            {inventory.status === "valide" && inventory.validatedAt && (
              <p className="text-xs text-muted-foreground">
                Validé le {formatDateTime(inventory.validatedAt)}
                {inventory.validatedBy ? ` par ${employeeName(inventory.validatedBy)}` : ""} · {inventory.adjustments} ajustement(s) de stock
              </p>
            )}
          </div>
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setConfirm("cancel")}>
              <LuX /> Annuler l&apos;inventaire
            </Button>
            <Button variant="outline" onClick={() => void persist()} disabled={saving || !dirty.length}>
              <LuSave /> Enregistrer{dirty.length ? ` (${dirty.length})` : ""}
            </Button>
            <Button onClick={() => setConfirm("validate")} disabled={saving || k.counted === 0}>
              <LuCircleCheck /> Valider
            </Button>
          </div>
        )}
      </div>

      <StatGrid>
        <StatCard index={0} label="Avancement" value={`${formatNumber(k.counted)} / ${formatNumber(k.total)}`} icon={LuCopyCheck} tone="violet" hint="produits comptés" />
        <StatCard index={1} label="Écarts" value={formatNumber(k.gaps)} icon={LuScale} tone={k.gaps ? "orange" : "green"} hint={`précision ${k.accuracy.toFixed(0)} %`} />
        <StatCard index={2} label="Manquants (valeur)" value={formatMoney(k.shortage, { compact: true })} icon={LuTrendingDown} tone="red" hint="au prix d'achat" />
        <StatCard index={3} label="Excédents (valeur)" value={formatMoney(k.surplus, { compact: true })} icon={LuTrendingUp} tone="blue" hint="au prix d'achat" />
      </StatGrid>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Progress value={k.total ? (k.counted / k.total) * 100 : 0} className="h-1.5" aria-label="Avancement du comptage" />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <FilterBar filters={filters} />
            </div>
            {open && (
              <div className="flex flex-wrap gap-2">
                <Combobox
                  value=""
                  onChange={(id) => void addProduct(id)}
                  options={productOptions.filter((o) => !rows.some((r) => r.productId === o.value))}
                  placeholder="Ajouter un produit trouvé…"
                  className="w-64"
                />
                <Button variant="outline" onClick={fillExpected} disabled={rows.every((r) => r.count !== null)}>
                  Reporter le théorique
                </Button>
              </div>
            )}
          </div>
          <DataTable
            data={filters.filtered}
            columns={columns}
            getRowId={(r) => r.id}
            defaultSort={{ id: "product" }}
            pageSize={50}
            emptyTitle="Aucun produit"
            exportOptions={{
              filename: `inventaire-${inventory.number.toLowerCase()}`,
              title: `Fiche d'inventaire ${inventory.number} — ${locationName(inventory.locationId)}`,
              subtitle: `${inventory.label} · ${formatDate(inventory.date)} · ${inventoryStatus[inventory.status].label}`,
              summary: [
                { label: "Produits", value: formatNumber(k.total) },
                { label: "Comptés", value: formatNumber(k.counted) },
                { label: "Écarts", value: formatNumber(k.gaps) },
                { label: "Valeur des écarts", value: formatMoney(k.surplus + k.shortage) },
              ],
            }}
          />
          {inventory.note && <p className="text-sm text-muted-foreground">Observation : {inventory.note}</p>}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirm === "validate"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Valider l'inventaire ?"
        description={`${k.counted} produit(s) compté(s), ${k.gaps} écart(s). Le stock de chaque produit compté sera aligné sur la quantité comptée (écart calculé avec le stock réel au moment de la validation). Les ${k.total - k.counted} produit(s) non compté(s) ne seront pas modifiés. L'inventaire ne pourra plus être modifié.`}
        confirmLabel="Valider et ajuster le stock"
        onConfirm={doValidate}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Annuler l'inventaire ?"
        description="Le comptage est abandonné ; le stock n'est pas modifié."
        confirmLabel="Annuler l'inventaire"
        destructive
        onConfirm={doCancel}
      />
      <ConfirmDialog
        open={confirm === "leave"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Quitter sans enregistrer ?"
        description={`${dirty.length} saisie(s) non enregistrée(s) seront perdues.`}
        confirmLabel="Quitter"
        destructive
        onConfirm={() => {
          setDraft({})
          onBack()
        }}
      />
    </div>
  )
}
