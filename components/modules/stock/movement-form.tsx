"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { format } from "date-fns"

import { ComboboxField, NumberField, SelectField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid } from "@/components/shared/form-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { useCurrentUser, useModuleAccess } from "@/hooks/use-access"
import { formatNumber } from "@/lib/format"
import { movementType, toOptions } from "@/lib/labels"
import { uid, useStore } from "@/lib/store"
import type { StockMovementType } from "@/lib/types"
import { lazyDialog } from "@/components/shared/lazy-dialog"

const REASONS: Record<StockMovementType, string[]> = {
  entree: ["Réception fournisseur", "Retour client", "Production atelier teinte"],
  sortie: ["Livraison chantier", "Casse / produit endommagé", "Échantillons", "Consommation interne"],
  transfert: ["Réapprovisionnement boutique", "Rééquilibrage des stocks"],
  ajustement: ["Inventaire mensuel", "Correction de saisie"],
}

const schema = z
  .object({
    type: z.enum(["entree", "sortie", "transfert", "ajustement"]),
    productId: z.string().min(1, "Produit requis"),
    quantity: z.number({ error: "Quantité requise" }).int("Nombre entier").refine((v) => v !== 0, "La quantité ne peut être nulle"),
    fromLocationId: z.string(),
    toLocationId: z.string(),
    reason: z.string().min(1, "Motif requis"),
    reference: z.string().trim().min(2, "Référence requise"),
  })
  .superRefine((v, ctx) => {
    if (v.type !== "ajustement" && v.quantity < 0) ctx.addIssue({ code: "custom", path: ["quantity"], message: "La quantité doit être positive" })
    if ((v.type === "sortie" || v.type === "transfert") && !v.fromLocationId) ctx.addIssue({ code: "custom", path: ["fromLocationId"], message: "Site d'origine requis" })
    if ((v.type === "entree" || v.type === "transfert" || v.type === "ajustement") && !v.toLocationId)
      ctx.addIssue({ code: "custom", path: ["toLocationId"], message: v.type === "ajustement" ? "Site requis" : "Site de destination requis" })
    if (v.type === "transfert" && v.fromLocationId && v.fromLocationId === v.toLocationId)
      ctx.addIssue({ code: "custom", path: ["toLocationId"], message: "La destination doit différer de l'origine" })
  })
type FormValues = z.infer<typeof schema>

export interface MovementPreset {
  type?: StockMovementType
  productId?: string
  locationId?: string
}

function MovementFormDialogContent({ open, onOpenChange, preset }: { open: boolean; onOpenChange: (o: boolean) => void; preset?: MovementPreset }) {
  const createMovement = useStore((s) => s.createStockMovement)
  const currentUserId = useStore((s) => s.currentUserId)
  const stockLevels = useStore((s) => s.stockLevels)
  const { productOptions, locationOptions: allLocations } = useLookups(["productOptions", "locationOptions"])
  const stockAccess = useModuleAccess("stock")
  const me = useCurrentUser()
  // Hors portée globale : seul le site d'affectation est proposé (transfert : destination libre)
  const locationOptions = stockAccess.global ? allLocations : allLocations.filter((l) => l.value === me?.locationId)
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (!open) return
    const type = preset?.type ?? "entree"
    form.reset({
      type,
      productId: preset?.productId ?? "",
      quantity: Number.NaN,
      fromLocationId: type === "sortie" || type === "transfert" ? preset?.locationId ?? "" : "",
      toLocationId: type === "entree" || type === "ajustement" ? preset?.locationId ?? "" : "",
      reason: REASONS[type][0],
      reference: "",
    })
  }, [open, preset, form])

  const [type, productId, from] = useWatch({ control: form.control, name: ["type", "productId", "fromLocationId"] })
  const available = productId && from ? stockLevels.find((l) => l.productId === productId && l.locationId === from)?.quantity ?? 0 : null

  React.useEffect(() => {
    if (type && form.formState.dirtyFields.type) form.setValue("reason", REASONS[type][0])
  }, [type, form])

  const onSubmit = form.handleSubmit(async (v) => {
    if ((v.type === "sortie" || v.type === "transfert") && available !== null && v.quantity > available) {
      form.setError("quantity", { message: `Stock insuffisant (${formatNumber(available)} disponible)` })
      return
    }
    const userId = currentUserId ?? ""
    if (!(await createMovement({
      id: uid("m"),
      date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      type: v.type,
      productId: v.productId,
      quantity: v.quantity,
      fromLocationId: v.type === "sortie" || v.type === "transfert" ? v.fromLocationId : undefined,
      toLocationId: v.type !== "sortie" ? v.toLocationId : undefined,
      reason: v.reason,
      reference: v.reference,
      userId,
    }))) return
    toast.success("Mouvement enregistré", { description: `${movementType[v.type].label} · ${v.reference}` })
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Nouveau mouvement de stock" description="Les niveaux de stock sont mis à jour immédiatement." onSubmit={onSubmit} size="lg">
      <FormGrid>
        <SelectField control={form.control} name="type" label="Type de mouvement" required options={toOptions(movementType)} />
        <TextField control={form.control} name="reference" label="Référence" required placeholder="BR-00123, BL fournisseur…" />
        <ComboboxField control={form.control} name="productId" label="Produit" required options={productOptions} className="sm:col-span-2" />
        {(type === "sortie" || type === "transfert") && (
          <SelectField control={form.control} name="fromLocationId" label="Site d'origine" required options={locationOptions} />
        )}
        {type !== "sortie" && (
          <SelectField control={form.control} name="toLocationId" label={type === "ajustement" ? "Site concerné" : "Site de destination"} required options={type === "transfert" ? allLocations : locationOptions} />
        )}
        <NumberField
          control={form.control}
          name="quantity"
          label="Quantité"
          required
          step={1}
          description={type === "ajustement" ? "Valeur négative pour diminuer le stock" : available !== null ? `Disponible : ${formatNumber(available)}` : undefined}
        />
        <SelectField control={form.control} name="reason" label="Motif" required options={(REASONS[type ?? "entree"] ?? []).map((r) => ({ value: r, label: r }))} />
      </FormGrid>
    </FormDialog>
  )
}

export const MovementFormDialog = lazyDialog(MovementFormDialogContent)
