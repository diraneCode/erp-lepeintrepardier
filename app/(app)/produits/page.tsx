"use client"

import * as React from "react"
import { toast } from "sonner"
import { LuBoxes, LuCalendarX, LuCircleAlert, LuEye, LuPackage, LuPackageX, LuPencil, LuPlus, LuTag, LuTrash2 } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DescriptionList, DetailSection, DetailSheet } from "@/components/shared/detail-sheet"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UrlActions } from "@/components/shared/url-actions"
import { CategoryFormDialog, ProductFormDialog } from "@/components/modules/products/forms"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useTransientState } from "@/hooks/use-transient-state"
import { formatDate, formatMoney, formatNumber, formatPercent } from "@/lib/format"
import { productUnit, toOptions } from "@/lib/labels"
import { daysToExpiry, expiryDef, expiryState, hasActivePromo, type ExpiryState } from "@/lib/products"
import { useStore } from "@/lib/store"
import type { Category, Product } from "@/lib/types"

type StockState = "rupture" | "bas" | "ok"
type Row = Product & {
  stock: number
  margin: number
  marginRate: number
  stockValue: number
  stockState: StockState
  sold: number
  promo: boolean
  expiry: ExpiryState
  expiryDays: number | null
}

const stockStateDef = {
  rupture: { label: "Rupture", tone: "destructive" as const },
  bas: { label: "Stock bas", tone: "warning" as const },
  ok: { label: "Disponible", tone: "success" as const },
}

export default function ProductsPage() {
  const acc = useModuleAccess("produits")
  const [tab, setTab] = React.useState("produits")
  const [productOpen, setProductOpen] = useTransientState(false)
  const [categoryOpen, setCategoryOpen] = useTransientState(false)
  const [editingProduct, setEditingProduct] = useTransientState<Product | undefined>(undefined)
  const [editingCategory, setEditingCategory] = useTransientState<Category | undefined>(undefined)

  return (
    <Page>
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <PageHeader
          icon={LuPackage}
          title="Produits"
          description="Catalogue, prix, marges et niveaux de stock consolidés."
          actions={
            <>
              <TabsList>
                <TabsTrigger value="produits">Catalogue</TabsTrigger>
                <TabsTrigger value="categories">Catégories</TabsTrigger>
              </TabsList>
              {!acc.write ? null : tab === "produits" ? (
                <Button onClick={() => { setEditingProduct(undefined); setProductOpen(true) }}>
                  <LuPlus /> Nouveau produit
                </Button>
              ) : (
                <Button onClick={() => { setEditingCategory(undefined); setCategoryOpen(true) }}>
                  <LuPlus /> Nouvelle catégorie
                </Button>
              )}
            </>
          }
        />
        <TabsContent value="produits">
          <CatalogTab
            onNew={() => { setEditingProduct(undefined); setProductOpen(true) }}
            onEdit={acc.write ? (p) => { setEditingProduct(p); setProductOpen(true) } : undefined}
          />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesTab onEdit={acc.write ? (c) => { setEditingCategory(c); setCategoryOpen(true) } : undefined} />
        </TabsContent>
      </Tabs>
      <ProductFormDialog open={productOpen} onOpenChange={setProductOpen} product={editingProduct} />
      <CategoryFormDialog open={categoryOpen} onOpenChange={setCategoryOpen} category={editingCategory} />
    </Page>
  )
}

function CatalogTab({ onEdit, onNew }: { onEdit?: (p: Product) => void; onNew: () => void }) {
  const products = useStore((s) => s.products)
  const { stockLevels, sales } = useScopedData()
  const update = useStore((s) => s.update)
  const remove = useStore((s) => s.remove)
  const { categoryName, categoryOptions, locationName, categoryById } = useLookups()
  const [viewing, setViewing] = useTransientState<Row | null>(null)
  const [toDelete, setToDelete] = useTransientState<string[] | null>(null)

  const rows = React.useMemo<Row[]>(() => {
    const stock = new Map<string, number>()
    const below = new Map<string, boolean>()
    const minOf = new Map(products.map((p) => [p.id, p.minStock]))
    stockLevels.forEach((l) => {
      stock.set(l.productId, (stock.get(l.productId) ?? 0) + l.quantity)
      if (l.quantity <= (minOf.get(l.productId) ?? 0)) below.set(l.productId, true)
    })
    const sold = new Map<string, number>()
    sales.forEach((s) => s.status !== "annulee" && s.items.forEach((i) => i.productId && sold.set(i.productId, (sold.get(i.productId) ?? 0) + i.quantity)))
    return products.map((p) => {
      const qty = stock.get(p.id) ?? 0
      const margin = p.salePrice - p.purchasePrice
      return {
        ...p,
        stock: qty,
        margin,
        marginRate: p.salePrice ? (margin / p.salePrice) * 100 : 0,
        stockValue: qty * p.purchasePrice,
        stockState: qty === 0 ? "rupture" : below.get(p.id) ? "bas" : "ok",
        sold: sold.get(p.id) ?? 0,
        promo: hasActivePromo(p),
        expiry: expiryState(p),
        expiryDays: daysToExpiry(p),
      }
    })
  }, [products, stockLevels, sales])

  const brands = React.useMemo(() => [...new Set(products.map((p) => p.brand))].sort().map((b) => ({ value: b, label: b })), [products])
  const suppliers = React.useMemo(() => [...new Set(products.map((p) => p.supplier))].sort().map((b) => ({ value: b, label: b })), [products])

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "Désignation, SKU, code-barres…", fields: (p) => [p.name, p.sku, p.barcode, p.brand, p.supplier] },
      date: { label: "Date de création", accessor: (p) => p.createdAt },
      facets: [
        { id: "category", label: "Catégorie", options: categoryOptions, accessor: (p) => p.categoryId },
        { id: "expiry", label: "Péremption", options: Object.entries(expiryDef).map(([value, d]) => ({ value, label: d.label })), accessor: (p) => p.expiry },
        { id: "promo", label: "Promotion", options: [{ value: "oui", label: "En promotion" }, { value: "non", label: "Prix normal" }], accessor: (p) => (p.promo ? "oui" : "non") },
        { id: "stockState", label: "Disponibilité", options: Object.entries(stockStateDef).map(([value, d]) => ({ value, label: d.label })), accessor: (p) => p.stockState },
        { id: "brand", label: "Marque", options: brands, accessor: (p) => p.brand },
        { id: "supplier", label: "Fournisseur", options: suppliers, accessor: (p) => p.supplier },
        { id: "unit", label: "Conditionnement", options: toOptions(productUnit), accessor: (p) => p.unit },
        { id: "status", label: "Statut", options: [{ value: "actif", label: "Actif" }, { value: "inactif", label: "Inactif" }], accessor: (p) => p.status },
      ],
      ranges: [
        { id: "salePrice", label: "Prix de vente", unit: "FCFA", accessor: (p) => p.salePrice },
        { id: "marginRate", label: "Taux de marge", unit: "%", accessor: (p) => p.marginRate },
        { id: "stock", label: "Stock total", unit: "unités", accessor: (p) => p.stock },
      ],
    }),
    [categoryOptions, brands, suppliers]
  )
  const filters = useFilters(rows, config)
  const data = filters.filtered
  const k = {
    expired: data.filter((p) => p.expiry === "perime").length,
    expiring: data.filter((p) => p.expiry === "critique" || p.expiry === "proche").length,
    promos: data.filter((p) => p.promo).length,
    value: data.reduce((s, p) => s + p.stockValue, 0),
    low: data.filter((p) => p.stockState === "bas").length,
    out: data.filter((p) => p.stockState === "rupture").length,
    margin: data.length ? data.reduce((s, p) => s + p.marginRate, 0) / data.length : 0,
  }

  const columns: Column<Row>[] = [
    {
      id: "name",
      header: "Produit",
      accessor: (p) => p.name,
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: categoryById.get(p.categoryId)?.color }} />
          <div className="min-w-0">
            <div className="truncate font-medium">{p.name}</div>
            <div className="truncate text-xs text-muted-foreground">{p.sku} · {p.brand}</div>
          </div>
        </div>
      ),
      className: "min-w-[240px] max-w-[320px]",
    },
    { id: "sku", header: "SKU", accessor: (p) => p.sku, defaultHidden: true },
    { id: "category", header: "Catégorie", accessor: (p) => categoryName(p.categoryId), hideOnMobile: true },
    { id: "unit", header: "Cond.", accessor: (p) => productUnit[p.unit], hideOnMobile: true, defaultHidden: true },
    { id: "purchasePrice", header: "Achat HT", accessor: (p) => p.purchasePrice, cell: (p) => formatMoney(p.purchasePrice), align: "right", exportType: "money", hideOnMobile: true },
    {
      id: "salePrice",
      header: "Vente HT",
      accessor: (p) => p.salePrice,
      cell: (p) =>
        p.promo ? (
          <div className="flex flex-col items-end">
            <span className="text-xs text-muted-foreground line-through">{formatMoney(p.salePrice)}</span>
            <span className="font-medium text-success">{formatMoney(p.promoPrice ?? 0)}</span>
          </div>
        ) : (
          formatMoney(p.salePrice)
        ),
      align: "right",
      exportType: "money",
    },
    { id: "promoPrice", header: "Prix promo", accessor: (p) => (p.promo ? p.promoPrice : null), cell: (p) => (p.promo ? `${formatMoney(p.promoPrice ?? 0)} → ${formatDate(p.promoEndDate)}` : "—"), exportType: "money", align: "right", defaultHidden: true },
    { id: "marginRate", header: "Marge", accessor: (p) => p.marginRate, cell: (p) => formatPercent(p.marginRate), align: "right", exportType: "percent", hideOnMobile: true },
    { id: "stock", header: "Stock", accessor: (p) => p.stock, cell: (p) => formatNumber(p.stock), align: "right", exportType: "number" },
    { id: "stockValue", header: "Valeur stock", accessor: (p) => p.stockValue, cell: (p) => formatMoney(p.stockValue, { compact: true }), align: "right", exportType: "money", hideOnMobile: true, footer: (r) => formatMoney(r.reduce((s, p) => s + p.stockValue, 0), { compact: true }) },
    { id: "sold", header: "Vendus", accessor: (p) => p.sold, cell: (p) => formatNumber(p.sold), align: "right", exportType: "number", defaultHidden: true },
    {
      id: "expiry",
      header: "Péremption",
      accessor: (p) => p.expiryDate ?? "",
      cell: (p) =>
        p.expiryDate ? (
          <div className="flex flex-col">
            <span className={p.expiry === "perime" ? "text-destructive" : p.expiry === "critique" ? "text-warning" : undefined}>{formatDate(p.expiryDate)}</span>
            {p.expiry !== "ok" && <span className="text-xs text-muted-foreground">{p.expiryDays !== null && p.expiryDays < 0 ? `périmé depuis ${-p.expiryDays} j` : `dans ${p.expiryDays} j`}</span>}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      exportType: "date",
      hideOnMobile: true,
    },
    { id: "barcode", header: "Code-barres", accessor: (p) => p.barcode ?? "", defaultHidden: true },
    { id: "stockState", header: "Disponibilité", accessor: (p) => stockStateDef[p.stockState].label, cell: (p) => <StatusBadge def={stockStateDef[p.stockState]} /> },
    { id: "status", header: "Statut", accessor: (p) => (p.status === "actif" ? "Actif" : "Inactif"), defaultHidden: true },
  ]

  const viewingLevels = viewing ? stockLevels.filter((l) => l.productId === viewing.id) : []

  return (
    <div className="flex flex-col gap-6">
      <UrlActions onNew={() => onEdit && onNew()} onQuery={filters.setSearch} />
      <StatGrid>
        <StatCard index={0} label="Références" value={formatNumber(data.length)} icon={LuPackage} hint={`${data.filter((p) => p.status === "actif").length} actives · ${k.promos} en promotion`} />
        <StatCard index={1} label="Valeur du stock (achat)" value={formatMoney(k.value, { compact: true })} icon={LuBoxes} tone="blue" hint={`marge moyenne ${formatPercent(k.margin)}`} />
        <StatCard index={2} label="Péremption" value={formatNumber(k.expired + k.expiring)} icon={LuCalendarX} tone="red" hint={`${k.expired} périmé(s) · ${k.expiring} à moins de 90 j`} />
        <StatCard index={3} label="Alertes stock" value={formatNumber(k.low + k.out)} icon={k.out ? LuPackageX : LuCircleAlert} tone="orange" hint={`${k.out} rupture(s), ${k.low} stock(s) bas`} />
      </StatGrid>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          <DataTable
            data={data}
            columns={columns}
            getRowId={(p) => p.id}
            onRowClick={setViewing}
            selectable={!!onEdit}
            defaultSort={{ id: "name" }}
            exportOptions={{ filename: "catalogue-produits", title: "Catalogue produits", subtitle: filters.describe(), summary: [{ label: "Références", value: formatNumber(data.length) }, { label: "Valeur du stock", value: formatMoney(k.value) }, { label: "Marge moyenne", value: formatPercent(k.margin) }] }}
            bulkActions={(sel, clear) => (
              <>
                <Button variant="outline" size="sm" onClick={() => { sel.forEach((p) => update("products", p.id, { status: "inactif" })); toast.success(`${sel.length} produit(s) désactivé(s)`); clear() }}>
                  Désactiver
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setToDelete(sel.map((p) => p.id))}>
                  <LuTrash2 /> Supprimer
                </Button>
              </>
            )}
            rowActions={(p) => (
              <RowActions
                actions={[
                  { label: "Voir", icon: LuEye, onSelect: () => setViewing(p) },
                  { label: "Modifier", icon: LuPencil, onSelect: () => onEdit?.(p), hidden: !onEdit },
                  { label: p.status === "actif" ? "Désactiver" : "Activer", icon: LuTag, onSelect: () => update("products", p.id, { status: p.status === "actif" ? "inactif" : "actif" }), hidden: !onEdit },
                  { label: "Supprimer", icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => setToDelete([p.id]), hidden: !onEdit },
                ]}
              />
            )}
          />
        </CardContent>
      </Card>

      <DetailSheet
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing?.name}
        description={viewing ? `${viewing.sku} · ${categoryName(viewing.categoryId)}` : undefined}
        badge={viewing && <StatusBadge def={stockStateDef[viewing.stockState]} />}
        footer={viewing && onEdit && <Button onClick={() => { const p = viewing; setViewing(null); onEdit(p) }}><LuPencil /> Modifier</Button>}
      >
        {viewing && (
          <div className="flex flex-col">
            <DetailSection title="Fiche produit">
              <DescriptionList
                items={[
                  { label: "Marque", value: viewing.brand },
                  { label: "Fournisseur", value: viewing.supplier },
                  { label: "Conditionnement", value: productUnit[viewing.unit] },
                  { label: "Code-barres", value: viewing.barcode ? <span className="font-mono">{viewing.barcode}</span> : "Non renseigné" },
                  { label: "Prix promotionnel", value: viewing.promo ? `${formatMoney(viewing.promoPrice ?? 0)} jusqu'au ${formatDate(viewing.promoEndDate)}` : "Aucun" },
                  { label: "Péremption", value: viewing.expiryDate ? <StatusBadge def={{ ...expiryDef[viewing.expiry], label: `${formatDate(viewing.expiryDate)} · ${expiryDef[viewing.expiry].label}` }} /> : "Sans péremption" },
                  { label: "Prix d'achat HT", value: formatMoney(viewing.purchasePrice) },
                  { label: "Prix de vente HT", value: formatMoney(viewing.salePrice) },
                  { label: "Marge unitaire", value: `${formatMoney(viewing.margin)} (${formatPercent(viewing.marginRate)})` },
                  { label: "TVA", value: `${viewing.taxRate} %` },
                  { label: "Seuil d'alerte", value: formatNumber(viewing.minStock) },
                  { label: "Unités vendues", value: formatNumber(viewing.sold) },
                  { label: "Créé le", value: formatDate(viewing.createdAt) },
                  ...(viewing.description ? [{ label: "Description", value: viewing.description, full: true }] : []),
                ]}
              />
            </DetailSection>
            <DetailSection title="Stock par site">
              <div className="flex flex-col divide-y rounded-lg border">
                {viewingLevels.map((l) => (
                  <div key={l.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{locationName(l.locationId)}</span>
                    <span className={l.quantity <= viewing.minStock ? "font-medium text-warning tabular" : "tabular"}>{formatNumber(l.quantity)}</span>
                  </div>
                ))}
              </div>
            </DetailSection>
          </div>
        )}
      </DetailSheet>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer ${toDelete?.length ?? 0} produit(s) ?`}
        description="Les niveaux de stock associés seront également supprimés."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (!toDelete) return
          remove("products", toDelete)
          const ids = new Set(toDelete)
          remove("stockLevels", useStore.getState().stockLevels.filter((l) => ids.has(l.productId)).map((l) => l.id))
          toast.success("Produit(s) supprimé(s)")
          setToDelete(null)
          setViewing(null)
        }}
      />
    </div>
  )
}

function CategoriesTab({ onEdit }: { onEdit?: (c: Category) => void }) {
  const categories = useStore((s) => s.categories)
  const products = useStore((s) => s.products)
  const { stockLevels } = useScopedData()
  const remove = useStore((s) => s.remove)
  const [toDelete, setToDelete] = useTransientState<Category | null>(null)

  const stats = React.useMemo(() => {
    const priceOf = new Map(products.map((p) => [p.id, p.purchasePrice]))
    const catOf = new Map(products.map((p) => [p.id, p.categoryId]))
    const m = new Map<string, { count: number; value: number }>()
    products.forEach((p) => m.set(p.categoryId, { count: (m.get(p.categoryId)?.count ?? 0) + 1, value: m.get(p.categoryId)?.value ?? 0 }))
    stockLevels.forEach((l) => {
      const c = catOf.get(l.productId)
      if (!c) return
      const v = m.get(c) ?? { count: 0, value: 0 }
      v.value += l.quantity * (priceOf.get(l.productId) ?? 0)
      m.set(c, v)
    })
    return m
  }, [products, stockLevels])

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {categories.map((c) => {
        const s = stats.get(c.id) ?? { count: 0, value: 0 }
        return (
          <Card key={c.id} className="gap-4">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="size-3 rounded-[4px]" style={{ background: c.color }} />
                  <CardTitle className="text-base">{c.name}</CardTitle>
                </div>
                {onEdit && (
                  <RowActions
                    actions={[
                      { label: "Modifier", icon: LuPencil, onSelect: () => onEdit(c) },
                      { label: "Supprimer", icon: LuTrash2, destructive: true, onSelect: () => setToDelete(c) },
                    ]}
                  />
                )}
              </div>
              <CardDescription>{c.description}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/60 p-3">
                <div className="text-xs text-muted-foreground">Références</div>
                <div className="mt-1 font-semibold tabular">{formatNumber(s.count)}</div>
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <div className="text-xs text-muted-foreground">Valeur du stock</div>
                <div className="mt-1 font-semibold tabular">{formatMoney(s.value, { compact: true })}</div>
              </div>
            </CardContent>
          </Card>
        )
      })}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer « ${toDelete?.name ?? ""} » ?`}
        description={toDelete && (stats.get(toDelete.id)?.count ?? 0) > 0 ? "Cette catégorie contient encore des produits : réaffectez-les avant suppression." : "Cette action est irréversible."}
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (!toDelete) return
          if ((stats.get(toDelete.id)?.count ?? 0) > 0) {
            toast.error("Suppression impossible", { description: "La catégorie contient des produits." })
          } else {
            remove("categories", [toDelete.id])
            toast.success("Catégorie supprimée")
          }
          setToDelete(null)
        }}
      />
    </div>
  )
}
