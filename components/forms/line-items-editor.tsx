"use client"

import * as React from "react"
import { useFieldArray, useWatch, Controller, type Control, type FieldValues, type UseFormSetValue } from "react-hook-form"
import { z } from "zod"

import { optionalNumber } from "@/lib/validation"
import { LuPackage, LuPenLine, LuTrash2, LuTriangleAlert } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/forms/fields"
import { useLookups } from "@/hooks/use-lookups"
import { effectivePrice, expiryState, hasActivePromo } from "@/lib/products"
import { useStore } from "@/lib/store"
import { documentTotals, lineSubtotal } from "@/lib/calc"
import { formatMoney } from "@/lib/format"
import type { LineItem } from "@/lib/types"
import { cn } from "@/lib/utils"

export const lineItemSchema = z
  .object({
    productId: z.string(),
    custom: z.boolean().optional(),
    description: z.string(),
    quantity: z.number({ error: "Quantité requise" }).positive("Quantité > 0"),
    unitPrice: z.number({ error: "Prix requis" }).min(0, "Prix invalide"),
    discount: z.number({ error: "Remise requise" }).min(0).max(100, "Max 100 %"),
    taxRate: z.number().min(0).max(100),
    section: z.enum(["traitement", "main_oeuvre", "accessoires"]).optional(),
    specification: z.string().optional(),
    packaging: z.string().optional(),
    coverage: optionalNumber(),
    surface: optionalNumber(),
  })
  // Ligne d'article : produit obligatoire. Ligne libre : désignation obligatoire.
  .refine((l) => l.custom || !!l.productId, { path: ["productId"], message: "Choisissez un produit" })
  .refine((l) => !l.custom || l.description.trim().length >= 2, { path: ["description"], message: "Désignation requise" })

export const lineItemsSchema = z.array(lineItemSchema).min(1, "Ajoutez au moins une ligne")

export const emptyLine: LineItem = { productId: "", description: "", quantity: 1, unitPrice: 0, discount: 0, taxRate: 0 }
/** Ligne sans article du catalogue (service, accessoire, prestation…) */
export const emptyCustomLine: LineItem = { ...emptyLine, custom: true }

type ItemsForm = { items: LineItem[] }

export function LineItemsEditor<T extends FieldValues>({
  control,
  setValue: setFormValue,
  locationId,
  error,
}: {
  control: Control<T>
  setValue: UseFormSetValue<T>
  /** Emplacement de stock à contrôler (boutique de vente) */
  locationId?: string
  error?: string
}) {
  const ctrl = control as unknown as Control<ItemsForm>
  const setValue = setFormValue as unknown as UseFormSetValue<ItemsForm>
  const { fields, append, remove } = useFieldArray({ control: ctrl, name: "items" })
  const items = (useWatch({ control: ctrl, name: "items" }) ?? []) as LineItem[]
  const { productById, productOptions } = useLookups(["productById", "productOptions"])
  const stockLevels = useStore((s) => s.stockLevels)
  const totals = documentTotals(items.filter((i) => Number.isFinite(i.quantity) && Number.isFinite(i.unitPrice)).map((i) => ({ ...i, discount: Number.isFinite(i.discount) ? i.discount : 0 })))

  const stockOf = (productId: string) =>
    locationId ? stockLevels.find((l) => l.productId === productId && l.locationId === locationId)?.quantity ?? 0 : undefined

  const num = (v: string) => (v === "" ? Number.NaN : Number(v))

  return (
    <div className="flex flex-col gap-3">
      <div className="hidden grid-cols-[minmax(0,1fr)_80px_120px_80px_120px_36px] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
        <span>Produit</span>
        <span className="text-right">Qté</span>
        <span className="text-right">P.U. HT</span>
        <span className="text-right">Remise %</span>
        <span className="text-right">Total HT</span>
        <span />
      </div>
      {fields.map((f, index) => {
        const item = items[index] ?? emptyLine
        const stock = item.productId ? stockOf(item.productId) : undefined
        const overStock = stock !== undefined && Number.isFinite(item.quantity) && item.quantity > stock
        return (
          <div
            key={f.id}
            className="grid grid-cols-2 items-start gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_80px_120px_80px_120px_36px] md:border-0 md:p-0"
          >
            <div className="col-span-2 flex flex-col gap-1 md:col-span-1">
              {item.custom ? (
                <Controller
                  control={ctrl}
                  name={`items.${index}.description`}
                  render={({ field, fieldState }) => (
                    <div className="relative">
                      <Input {...field} placeholder="Désignation (service, prestation, accessoire…)" aria-label="Désignation" aria-invalid={fieldState.invalid} className="pr-20" />
                      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Libre</span>
                    </div>
                  )}
                />
              ) : (
              <Controller
                control={ctrl}
                name={`items.${index}.productId`}
                render={({ field, fieldState }) => (
                  <Combobox
                    value={field.value}
                    options={productOptions}
                    placeholder="Rechercher un produit…"
                    invalid={fieldState.invalid}
                    onChange={(id) => {
                      field.onChange(id)
                      const p = productById.get(id)
                      if (p) {
                        setValue(`items.${index}.unitPrice`, effectivePrice(p), { shouldValidate: true })
                        setValue(`items.${index}.description`, p.name)
                        setValue(`items.${index}.taxRate`, p.taxRate)
                      }
                    }}
                  />
                )}
              />
              )}
              {item.productId && productById.get(item.productId) && hasActivePromo(productById.get(item.productId)!) && (
                <span className="text-xs font-medium text-success">
                  Prix promo appliqué (au lieu de {formatMoney(productById.get(item.productId)!.salePrice)})
                </span>
              )}
              {item.productId && productById.get(item.productId) && expiryState(productById.get(item.productId)!) === "perime" && (
                <span className="flex items-center gap-1 text-xs text-destructive">
                  <LuTriangleAlert className="size-3" /> Lot périmé — vérifier avant la vente
                </span>
              )}
              {stock !== undefined && (
                <span className={cn("flex items-center gap-1 text-xs", overStock ? "text-destructive" : "text-muted-foreground")}>
                  {overStock && <LuTriangleAlert className="size-3" />}
                  Stock disponible : {stock}
                </span>
              )}
            </div>
            <Controller
              control={ctrl}
              name={`items.${index}.quantity`}
              render={({ field, fieldState }) => (
                <Input
                  type="number"
                  min={0}
                  aria-label="Quantité"
                  className="text-right tabular"
                  aria-invalid={fieldState.invalid}
                  value={Number.isFinite(field.value) ? field.value : ""}
                  onChange={(e) => field.onChange(num(e.target.value))}
                />
              )}
            />
            <Controller
              control={ctrl}
              name={`items.${index}.unitPrice`}
              render={({ field, fieldState }) => (
                <Input
                  type="number"
                  min={0}
                  aria-label="Prix unitaire"
                  className="text-right tabular"
                  aria-invalid={fieldState.invalid}
                  value={Number.isFinite(field.value) ? field.value : ""}
                  onChange={(e) => field.onChange(num(e.target.value))}
                />
              )}
            />
            <Controller
              control={ctrl}
              name={`items.${index}.discount`}
              render={({ field, fieldState }) => (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  aria-label="Remise"
                  className="text-right tabular"
                  aria-invalid={fieldState.invalid}
                  value={Number.isFinite(field.value) ? field.value : ""}
                  onChange={(e) => field.onChange(num(e.target.value))}
                />
              )}
            />
            <div className="flex h-8 items-center justify-end text-sm font-medium tabular">
              {formatMoney(Number.isFinite(item.quantity) && Number.isFinite(item.unitPrice) ? lineSubtotal({ ...item, discount: item.discount || 0 }) : 0, { currency: false })}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="justify-self-end text-muted-foreground hover:text-destructive"
              onClick={() => remove(index)}
              disabled={fields.length === 1}
              aria-label="Supprimer la ligne"
            >
              <LuTrash2 />
            </Button>
          </div>
        )
      })}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => append({ ...emptyLine })}>
            <LuPackage /> Ajouter un article
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => append({ ...emptyCustomLine })}>
            <LuPenLine /> Ligne libre
          </Button>
        </div>
        <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-muted/60 p-3 text-sm sm:w-72">
          <dt className="text-muted-foreground">Total brut HT</dt>
          <dd className="text-right tabular">{formatMoney(totals.gross)}</dd>
          <dt className="text-muted-foreground">Remises</dt>
          <dd className="text-right tabular">− {formatMoney(totals.discount)}</dd>
          <dt className="text-muted-foreground">TVA</dt>
          <dd className="text-right tabular">{formatMoney(totals.tax)}</dd>
          <dt className="border-t pt-1.5 font-semibold">Total TTC</dt>
          <dd className="border-t pt-1.5 text-right font-semibold tabular">{formatMoney(totals.total)}</dd>
        </dl>
      </div>
    </div>
  )
}
