"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { optionalNumber } from "@/lib/validation"
import { toast } from "sonner"

import { DateField, NumberField, SelectField, SwitchField, TextareaField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { formatMoney, formatPercent, toISODate } from "@/lib/format"
import { productUnit, toOptions } from "@/lib/labels"
import { uid, useStore } from "@/lib/store"
import type { Category, Product } from "@/lib/types"

const productSchema = z
  .object({
    name: z.string().trim().min(3, "Désignation requise"),
    sku: z.string().trim().min(3, "Référence requise").regex(/^[A-Z0-9-]+$/, "Majuscules, chiffres et tirets uniquement"),
    categoryId: z.string().min(1, "Catégorie requise"),
    brand: z.string().trim().min(2, "Marque requise"),
    unit: z.enum(["pot_1l", "pot_4l", "seau_20l", "sac_25kg", "piece", "rouleau", "kg", "litre", "m2"]),
    purchasePrice: z.number({ error: "Prix d'achat requis" }).min(0),
    salePrice: z.number({ error: "Prix de vente requis" }).positive("Doit être positif"),
    taxRate: z.number({ error: "TVA requise" }).min(0).max(100),
    minStock: z.number({ error: "Seuil requis" }).int("Nombre entier").min(0),
    status: z.enum(["actif", "inactif"]),
    barcode: z.union([z.literal(""), z.string().trim().regex(/^\d{8,14}$/, "Code-barres EAN invalide (8 à 14 chiffres)")]),
    supplier: z.string().trim().min(2, "Fournisseur requis"),
    specification: z.string().optional(),
    packaging: z.string().optional(),
    coverage: optionalNumber(),
    hasPromo: z.boolean(),
    promoPrice: optionalNumber(),
    promoEndDate: z.string().optional(),
    expiryDate: z.string().optional(),
    description: z.string().optional(),
  })
  .refine((v) => v.salePrice >= v.purchasePrice, { path: ["salePrice"], message: "Le prix de vente est inférieur au prix d'achat" })
  .superRefine((v, ctx) => {
    if (!v.hasPromo) return
    if (v.promoPrice === undefined || !Number.isFinite(v.promoPrice) || v.promoPrice <= 0)
      ctx.addIssue({ code: "custom", path: ["promoPrice"], message: "Prix promotionnel requis" })
    else if (v.promoPrice >= v.salePrice) ctx.addIssue({ code: "custom", path: ["promoPrice"], message: "Doit être inférieur au prix de vente" })
    else if (v.promoPrice < v.purchasePrice) ctx.addIssue({ code: "custom", path: ["promoPrice"], message: "Inférieur au prix d'achat (vente à perte)" })
    if (!v.promoEndDate) ctx.addIssue({ code: "custom", path: ["promoEndDate"], message: "Date de fin de promotion requise" })
  })
type ProductValues = z.infer<typeof productSchema>

const productDefaults = (p?: Product): ProductValues => ({
  name: p?.name ?? "",
  sku: p?.sku ?? "",
  categoryId: p?.categoryId ?? "",
  brand: p?.brand ?? "Pardier",
  unit: p?.unit ?? "pot_4l",
  purchasePrice: p?.purchasePrice ?? Number.NaN,
  salePrice: p?.salePrice ?? Number.NaN,
  taxRate: p?.taxRate ?? 19.25,
  minStock: p?.minStock ?? 20,
  status: p?.status ?? "actif",
  barcode: p?.barcode ?? "",
  supplier: p?.supplier ?? "",
  specification: p?.specification ?? "",
  packaging: p?.packaging ?? "",
  coverage: p?.coverage ?? Number.NaN,
  hasPromo: p?.promoPrice !== undefined,
  promoPrice: p?.promoPrice ?? Number.NaN,
  promoEndDate: p?.promoEndDate ?? "",
  expiryDate: p?.expiryDate ?? "",
  description: p?.description ?? "",
})

export function ProductFormDialog({ open, onOpenChange, product }: { open: boolean; onOpenChange: (o: boolean) => void; product?: Product }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const { categoryOptions } = useLookups()
  const form = useForm<ProductValues>({ resolver: zodResolver(productSchema), defaultValues: productDefaults(product) })
  React.useEffect(() => {
    if (open) form.reset(productDefaults(product))
  }, [open, product, form])
  const [pp, sp, hasPromo, promo] = useWatch({ control: form.control, name: ["purchasePrice", "salePrice", "hasPromo", "promoPrice"] })
  const margin = Number.isFinite(pp) && Number.isFinite(sp) && sp > 0 ? sp - pp : null

  const onSubmit = form.handleSubmit((v) => {
    if (useStore.getState().products.some((p) => p.sku === v.sku && p.id !== product?.id)) {
      form.setError("sku", { message: "Cette référence existe déjà" })
      return
    }
    const { hasPromo, promoPrice, promoEndDate, expiryDate, barcode, specification, packaging, coverage, ...rest } = v
    const payload = {
      ...rest,
      specification: specification?.trim() || undefined,
      packaging: packaging?.trim() || undefined,
      coverage: coverage !== undefined && Number.isFinite(coverage) && coverage > 0 ? coverage : undefined,
      barcode: barcode || undefined,
      promoPrice: hasPromo ? promoPrice : undefined,
      promoEndDate: hasPromo ? promoEndDate : undefined,
      expiryDate: expiryDate || undefined,
    }
    if (product) update("products", product.id, payload)
    else add("products", { ...payload, id: uid("p"), createdAt: toISODate(new Date()) })
    toast.success(product ? "Produit mis à jour" : "Produit créé", { description: v.name })
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={product ? "Modifier le produit" : "Nouveau produit"} onSubmit={onSubmit} size="lg">
      <div className="flex flex-col gap-6">
        <FormSection title="Identification">
          <FormGrid>
            <TextField control={form.control} name="name" label="Désignation" required className="sm:col-span-2" placeholder="Ex : Acrylique mate blanche 20 L" />
            <TextField control={form.control} name="sku" label="Référence (SKU)" required placeholder="C1-001" />
            <TextField control={form.control} name="barcode" label="Code-barres" inputMode="numeric" description="Facultatif — EAN 8 à 14 chiffres" />
            <SelectField control={form.control} name="categoryId" label="Catégorie" required options={categoryOptions} />
            <TextField control={form.control} name="brand" label="Marque" required />
            <SelectField control={form.control} name="unit" label="Conditionnement" required options={toOptions(productUnit)} />
            <TextField control={form.control} name="supplier" label="Fournisseur" required />
          </FormGrid>
        </FormSection>
        <FormSection title="Prix & stock">
          <FormGrid cols={3}>
            <NumberField control={form.control} name="purchasePrice" label="Prix d'achat HT" required suffix="FCFA" min={0} step={100} />
            <NumberField control={form.control} name="salePrice" label="Prix de vente HT" required suffix="FCFA" min={0} step={100} />
            <NumberField control={form.control} name="taxRate" label="TVA" suffix="%" min={0} step={0.25} />
            <NumberField control={form.control} name="minStock" label="Seuil d'alerte" required min={0} description="Quantité minimale par site" />
            <SelectField control={form.control} name="status" label="Statut" required options={[{ value: "actif", label: "Actif" }, { value: "inactif", label: "Inactif" }]} />
            <div className="flex flex-col justify-center rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <span className="text-xs text-muted-foreground">Marge unitaire</span>
              <span className="font-semibold tabular">{margin === null ? "—" : `${formatMoney(margin)} · ${formatPercent((margin / sp) * 100)}`}</span>
            </div>
          </FormGrid>
        </FormSection>
        <FormSection title="Informations techniques (proformas)">
          <FormGrid>
            <TextField control={form.control} name="specification" label="Spécificité" placeholder="Ex : Résine époxy transparente étanche" className="sm:col-span-2" />
            <TextField control={form.control} name="packaging" label="Conditionnement" placeholder="Ex : 20 kg, 4,5 kg, 10 L" description="Par défaut : le conditionnement ci-dessus" />
            <NumberField control={form.control} name="coverage" label="Couverture par conditionnement" suffix="m²" min={0} step={1} description="Sert à calculer la quantité : surface ÷ couverture" />
          </FormGrid>
        </FormSection>
        <FormSection title="Promotion">
          <FormGrid cols={3}>
            <SwitchField control={form.control} name="hasPromo" label="Prix promotionnel" description="Appliqué automatiquement en caisse" className="sm:col-span-3" />
            {hasPromo && (
              <>
                <NumberField control={form.control} name="promoPrice" label="Prix promotionnel HT" required suffix="FCFA" min={0} step={100} />
                <DateField control={form.control} name="promoEndDate" label="Fin de la promotion" required />
                <div className="flex flex-col justify-center rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground">Remise</span>
                  <span className="font-semibold tabular">{promo !== undefined && Number.isFinite(promo) && Number.isFinite(sp) && sp > 0 ? `− ${formatPercent((1 - promo / sp) * 100)}` : "—"}</span>
                </div>
              </>
            )}
          </FormGrid>
        </FormSection>
        <FormSection title="Péremption">
          <FormGrid>
            <DateField control={form.control} name="expiryDate" label="Date de péremption" description="Facultative (outillage, accessoires…). Alerte 90 jours avant l'échéance." />
          </FormGrid>
        </FormSection>
        <TextareaField control={form.control} name="description" label="Description" rows={3} />
      </div>
    </FormDialog>
  )
}

const categorySchema = z.object({
  name: z.string().trim().min(3, "Nom requis"),
  description: z.string().trim().min(3, "Description requise"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur hexadécimale invalide"),
})
type CategoryValues = z.infer<typeof categorySchema>

export function CategoryFormDialog({ open, onOpenChange, category }: { open: boolean; onOpenChange: (o: boolean) => void; category?: Category }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const form = useForm<CategoryValues>({ resolver: zodResolver(categorySchema) })
  React.useEffect(() => {
    if (open) form.reset({ name: category?.name ?? "", description: category?.description ?? "", color: category?.color ?? "#4b2e9e" })
  }, [open, category, form])
  const color = useWatch({ control: form.control, name: "color" })

  const onSubmit = form.handleSubmit((v) => {
    if (category) update("categories", category.id, v)
    else add("categories", { ...v, id: uid("c") })
    toast.success(category ? "Catégorie mise à jour" : "Catégorie créée", { description: v.name })
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={category ? "Modifier la catégorie" : "Nouvelle catégorie"} onSubmit={onSubmit}>
      <FormGrid cols={1}>
        <TextField control={form.control} name="name" label="Nom" required />
        <TextareaField control={form.control} name="description" label="Description" required rows={2} />
        <div className="flex items-end gap-3">
          <TextField control={form.control} name="color" label="Couleur repère" required placeholder="#4b2e9e" />
          <span className="mb-0.5 size-8 shrink-0 rounded-md border" style={{ background: /^#[0-9a-f]{6}$/i.test(color ?? "") ? color : "transparent" }} />
        </div>
      </FormGrid>
    </FormDialog>
  )
}
