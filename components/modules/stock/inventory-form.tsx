"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { LuX } from "react-icons/lu"
import { format } from "date-fns"
import { fr } from "date-fns/locale"

import { Button } from "@/components/ui/button"
import { Combobox, DateField, SelectField, TextField, TextareaField } from "@/components/forms/fields"
import { FormDialog, FormGrid } from "@/components/shared/form-dialog"
import { lazyDialog } from "@/components/shared/lazy-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { toISODate } from "@/lib/format"
import { inventoryScope, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"

const schema = z
  .object({
    locationId: z.string().min(1, "Site requis"),
    label: z.string().trim().min(3, "Intitulé requis").max(120),
    date: z.string().min(1, "Date requise"),
    scope: z.enum(["stock", "all", "category", "selection"]),
    categoryId: z.string(),
    productIds: z.array(z.string()),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.scope === "category" && !v.categoryId) ctx.addIssue({ code: "custom", path: ["categoryId"], message: "Catégorie requise" })
    if (v.scope === "selection" && v.productIds.length === 0) ctx.addIssue({ code: "custom", path: ["productIds"], message: "Ajoutez au moins un produit" })
  })
type FormValues = z.infer<typeof schema>

function InventoryFormDialogContent({
  open,
  onOpenChange,
  locationOptions,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Sites que l'utilisateur peut inventorier */
  locationOptions: { value: string; label: string; hint?: string }[]
  onCreated: (inventoryId: string) => void
}) {
  const createInventory = useStore((s) => s.createInventory)
  const { categoryOptions, productOptions } = useLookups(["categoryOptions", "productOptions"])
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      locationId: locationOptions.length === 1 ? locationOptions[0].value : "",
      label: `Inventaire ${format(new Date(), "MMMM yyyy", { locale: fr })}`,
      date: toISODate(new Date()),
      scope: "stock",
      categoryId: "",
      productIds: [],
      note: "",
    })
  }, [open, locationOptions, form])

  const [scope, productIds] = useWatch({ control: form.control, name: ["scope", "productIds"] })
  const selected = new Set(productIds ?? [])
  const productLabel = new Map(productOptions.map((o) => [o.value, o.label]))

  const onSubmit = form.handleSubmit(async (v) => {
    const id = await createInventory({
      locationId: v.locationId,
      label: v.label,
      date: v.date,
      scope: v.scope,
      categoryId: v.scope === "category" ? v.categoryId : undefined,
      productIds: v.scope === "selection" ? v.productIds : undefined,
      note: v.note || undefined,
    })
    if (!id) return
    toast.success("Inventaire ouvert", { description: "Saisissez les quantités comptées, puis validez." })
    onOpenChange(false)
    onCreated(id)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvel inventaire"
      description="Le stock théorique des produits est figé à l'ouverture ; les écarts sont ajustés à la validation."
      onSubmit={onSubmit}
      submitLabel="Ouvrir l'inventaire"
      size="lg"
    >
      <FormGrid>
        <SelectField control={form.control} name="locationId" label="Site inventorié" required options={locationOptions} />
        <DateField control={form.control} name="date" label="Date" required />
        <TextField control={form.control} name="label" label="Intitulé" required className="sm:col-span-2" />
        <SelectField control={form.control} name="scope" label="Produits à compter" required options={toOptions(inventoryScope)} className="sm:col-span-2" />
        {scope === "category" && <SelectField control={form.control} name="categoryId" label="Catégorie" required options={categoryOptions} className="sm:col-span-2" />}
        {scope === "selection" && (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Combobox
              value=""
              onChange={(id) => id && !selected.has(id) && form.setValue("productIds", [...(productIds ?? []), id], { shouldValidate: true })}
              options={productOptions.filter((o) => !selected.has(o.value))}
              placeholder="Ajouter un produit à compter…"
              invalid={!!form.formState.errors.productIds}
            />
            {(productIds ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {(productIds ?? []).map((id) => (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2.5 text-xs">
                    {productLabel.get(id) ?? id}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Retirer"
                      onClick={() => form.setValue("productIds", (productIds ?? []).filter((x) => x !== id), { shouldValidate: true })}
                    >
                      <LuX />
                    </Button>
                  </span>
                ))}
              </div>
            ) : (
              <p className={form.formState.errors.productIds ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                {form.formState.errors.productIds?.message ?? "Aucun produit sélectionné."}
              </p>
            )}
          </div>
        )}
        <TextareaField control={form.control} name="note" label="Observation" rows={2} placeholder="Équipe de comptage, consignes…" className="sm:col-span-2" />
      </FormGrid>
    </FormDialog>
  )
}

export const InventoryFormDialog = lazyDialog(InventoryFormDialogContent)
