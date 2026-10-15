"use client"

import * as React from "react"
import { useFieldArray, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { format } from "date-fns"
import { LuCopy, LuTrash2 } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Combobox, NumberField, SelectField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { lazyDialog } from "@/components/shared/lazy-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { useCurrentUser, useModuleAccess } from "@/hooks/use-access"
import { formatNumber } from "@/lib/format"
import { movementType, toOptions } from "@/lib/labels"
import { uid, useStore } from "@/lib/store"
import type { StockMovementType } from "@/lib/types"

export const MOVEMENT_REASONS: Record<StockMovementType, string[]> = {
  entree: ["Réception fournisseur", "Approvisionnement boutique", "Retour client", "Production atelier teinte"],
  sortie: ["Livraison chantier", "Casse / produit endommagé", "Échantillons", "Consommation interne"],
  transfert: ["Approvisionnement boutique", "Réapprovisionnement boutique", "Rééquilibrage des stocks"],
  ajustement: ["Inventaire mensuel", "Correction de saisie"],
}

const lineSchema = z.object({
  productId: z.string().min(1, "Produit requis"),
  quantity: z.number({ error: "Quantité requise" }).int("Nombre entier").refine((v) => v !== 0, "La quantité ne peut être nulle"),
})

const schema = z
  .object({
    type: z.enum(["entree", "sortie", "transfert", "ajustement"]),
    lines: z.array(lineSchema).min(1, "Ajoutez au moins un produit"),
    fromLocationId: z.string(),
    toLocationId: z.string(),
    reason: z.string().min(1, "Motif requis"),
    reference: z.string().trim().min(2, "Référence requise"),
  })
  .superRefine((v, ctx) => {
    if (v.type !== "ajustement") {
      v.lines.forEach((l, i) => {
        if (l.quantity < 0) ctx.addIssue({ code: "custom", path: ["lines", i, "quantity"], message: "La quantité doit être positive" })
      })
    }
    if ((v.type === "sortie" || v.type === "transfert") && !v.fromLocationId) ctx.addIssue({ code: "custom", path: ["fromLocationId"], message: "Site d'origine requis" })
    if ((v.type === "entree" || v.type === "transfert" || v.type === "ajustement") && !v.toLocationId)
      ctx.addIssue({ code: "custom", path: ["toLocationId"], message: v.type === "ajustement" ? "Site requis" : "Site de destination requis" })
    if (v.type === "transfert" && v.fromLocationId && v.fromLocationId === v.toLocationId)
      ctx.addIssue({ code: "custom", path: ["toLocationId"], message: "La destination doit différer de l'origine" })
  })
type FormValues = z.infer<typeof schema>

export interface MovementPreset {
  type?: StockMovementType
  /** Produit(s) pré-sélectionné(s) */
  productId?: string
  productIds?: string[]
  locationId?: string
}

function MovementFormDialogContent({ open, onOpenChange, preset }: { open: boolean; onOpenChange: (o: boolean) => void; preset?: MovementPreset }) {
  const createMovements = useStore((s) => s.createStockMovements)
  const currentUserId = useStore((s) => s.currentUserId)
  const stockLevels = useStore((s) => s.stockLevels)
  const { productOptions, productById, locationOptions: allLocations } = useLookups(["productOptions", "productById", "locationOptions"])
  const stockAccess = useModuleAccess("stock")
  const me = useCurrentUser()
  // Hors portée globale : seul le site d'affectation est proposé (transfert : destination libre)
  const locationOptions = stockAccess.global ? allLocations : allLocations.filter((l) => l.value === me?.locationId)
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" })

  React.useEffect(() => {
    if (!open) return
    const type = preset?.type ?? "entree"
    const ids = preset?.productIds ?? (preset?.productId ? [preset.productId] : [])
    form.reset({
      type,
      lines: ids.map((productId) => ({ productId, quantity: Number.NaN })),
      fromLocationId: type === "sortie" || type === "transfert" ? preset?.locationId ?? "" : "",
      toLocationId: type === "entree" || type === "ajustement" ? preset?.locationId ?? "" : "",
      reason: MOVEMENT_REASONS[type][0],
      reference: "",
    })
  }, [open, preset, form])

  const [type, from, lines] = useWatch({ control: form.control, name: ["type", "fromLocationId", "lines"] })
  const outgoing = type === "sortie" || type === "transfert"
  const availableAt = (productId: string) => (from ? stockLevels.find((l) => l.productId === productId && l.locationId === from)?.quantity ?? 0 : null)

  React.useEffect(() => {
    if (type && form.formState.dirtyFields.type) form.setValue("reason", MOVEMENT_REASONS[type][0])
  }, [type, form])

  // Le sélecteur ne propose que les produits pas encore ajoutés
  const selected = new Set((lines ?? []).map((l) => l.productId))
  const pickerOptions = productOptions.filter((o) => !selected.has(o.value))

  const addProduct = (productId: string) => {
    if (!productId || selected.has(productId)) return
    append({ productId, quantity: Number.NaN }, { shouldFocus: false })
    form.clearErrors("lines")
  }

  const copyFirstQuantity = () => {
    const q = form.getValues("lines.0.quantity")
    if (!Number.isFinite(q)) return
    form.getValues("lines").forEach((_, i) => form.setValue(`lines.${i}.quantity`, q, { shouldValidate: true }))
  }

  const onSubmit = form.handleSubmit(async (v) => {
    if (outgoing) {
      let blocked = false
      v.lines.forEach((l, i) => {
        const available = availableAt(l.productId)
        if (available !== null && l.quantity > available) {
          form.setError(`lines.${i}.quantity`, { message: `Stock insuffisant (${formatNumber(available)} disponible)` })
          blocked = true
        }
      })
      if (blocked) return
    }
    const date = format(new Date(), "yyyy-MM-dd'T'HH:mm")
    const ok = await createMovements(
      v.lines.map((l) => ({
        id: uid("m"),
        date,
        type: v.type,
        productId: l.productId,
        quantity: l.quantity,
        fromLocationId: outgoing ? v.fromLocationId : undefined,
        toLocationId: v.type !== "sortie" ? v.toLocationId : undefined,
        reason: v.reason,
        reference: v.reference,
        userId: currentUserId ?? "",
      }))
    )
    if (!ok) return
    toast.success(v.lines.length > 1 ? `${v.lines.length} mouvements enregistrés` : "Mouvement enregistré", {
      description: `${movementType[v.type].label} · ${v.reason} · ${v.reference}`,
    })
    onOpenChange(false)
  })

  const linesError = form.formState.errors.lines?.root?.message ?? form.formState.errors.lines?.message

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouveau mouvement de stock"
      description="Sélectionnez un ou plusieurs produits ; les niveaux de stock sont mis à jour immédiatement."
      onSubmit={onSubmit}
      submitLabel={fields.length > 1 ? `Enregistrer ${fields.length} mouvements` : "Enregistrer"}
      size="xl"
    >
      <div className="flex flex-col gap-6">
        <FormGrid>
          <SelectField control={form.control} name="type" label="Type de mouvement" required options={toOptions(movementType)} />
          <SelectField control={form.control} name="reason" label="Motif" required options={(MOVEMENT_REASONS[type ?? "entree"] ?? []).map((r) => ({ value: r, label: r }))} />
          {outgoing && <SelectField control={form.control} name="fromLocationId" label="Site d'origine" required options={locationOptions} />}
          {type !== "sortie" && (
            <SelectField
              control={form.control}
              name="toLocationId"
              label={type === "ajustement" ? "Site concerné" : "Site de destination"}
              required
              options={type === "transfert" ? allLocations : locationOptions}
            />
          )}
          <TextField control={form.control} name="reference" label="Référence" required placeholder="BR-00123, BL fournisseur…" className={type === "entree" || type === "ajustement" ? undefined : "sm:col-span-2"} />
        </FormGrid>

        <FormSection title={`Produits (${fields.length})`}>
          <Combobox value="" onChange={addProduct} options={pickerOptions} placeholder="Ajouter un produit (rechercher par nom ou référence)…" emptyText="Aucun autre produit." />
          {fields.length === 0 ? (
            <p className={linesError ? "rounded-lg border border-dashed border-destructive/50 p-6 text-center text-sm text-destructive" : "rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"}>
              {linesError ?? "Aucun produit sélectionné. Ajoutez-en autant que nécessaire avec la recherche ci-dessus."}
            </p>
          ) : (
            <div className="flex flex-col divide-y rounded-lg border">
              {fields.map((f, i) => {
                const product = productById.get(lines?.[i]?.productId ?? f.productId)
                const available = outgoing ? availableAt(f.productId) : null
                return (
                  <div key={f.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 flex-1 sm:pt-1.5">
                      <div className="truncate text-sm font-medium">{product?.name ?? "Produit"}</div>
                      <div className="text-xs text-muted-foreground">
                        {product?.sku}
                        {available !== null && ` · disponible : ${formatNumber(available)}`}
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <NumberField control={form.control} name={`lines.${i}.quantity`} step={1} placeholder="Quantité" className="w-36" />
                      <Button type="button" variant="ghost" size="icon" aria-label="Retirer le produit" className="hover:text-destructive" onClick={() => remove(i)}>
                        <LuTrash2 />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{type === "ajustement" ? "Quantité négative pour diminuer le stock." : "Les quantités s'expriment en unités (pièces, seaux, sacs…)."}</span>
            {fields.length > 1 && (
              <Button type="button" variant="outline" size="xs" onClick={copyFirstQuantity}>
                <LuCopy /> Même quantité pour tous
              </Button>
            )}
          </div>
        </FormSection>
      </div>
    </FormDialog>
  )
}

export const MovementFormDialog = lazyDialog(MovementFormDialogContent)
