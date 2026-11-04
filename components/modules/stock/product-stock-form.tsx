"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { NumberField } from "@/components/forms/fields"
import { FormDialog } from "@/components/shared/form-dialog"
import { useStore } from "@/lib/store"
import type { Product, StockLevel } from "@/lib/types"
import { lazyDialog } from "@/components/shared/lazy-dialog"

const schema = z.object({
  levels: z.array(
    z.object({
      locationId: z.string(),
      quantity: z.number({ error: "Quantité requise" }).int("Nombre entier").min(0, "Doit être positive"),
      // Vide : le site reprend le seuil par défaut du produit
      minStock: z.union([z.number().int("Nombre entier").min(0, "Doit être positif"), z.nan()]),
    })
  ),
})
type FormValues = z.infer<typeof schema>

export interface StockSite {
  id: string
  name: string
  kind: "boutique" | "entrepot"
}

function ProductStockDialogContent({
  open,
  onOpenChange,
  product,
  sites,
  levels,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  product?: Product
  /** Sites modifiables par l'utilisateur */
  sites: StockSite[]
  levels: StockLevel[]
}) {
  const setProductStock = useStore((s) => s.setProductStock)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { levels: [] } })

  // Valeurs chargées à l'ouverture seulement : un rafraîchissement en arrière-plan n'efface pas la saisie
  const load = React.useEffectEvent((p: Product) =>
    form.reset({
      levels: sites.map((site) => {
        const l = levels.find((x) => x.productId === p.id && x.locationId === site.id)
        return { locationId: site.id, quantity: l?.quantity ?? 0, minStock: l?.minStock ?? Number.NaN }
      }),
    })
  )
  React.useEffect(() => {
    if (open && product) load(product)
  }, [open, product])

  const onSubmit = form.handleSubmit(async (v) => {
    if (!product) return
    const ok = await setProductStock(
      product.id,
      v.levels.map((l) => ({ locationId: l.locationId, quantity: l.quantity, minStock: Number.isNaN(l.minStock) ? undefined : l.minStock }))
    )
    if (!ok) return
    toast.success("Stock enregistré", { description: product.name })
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Stock par site"
      description={product ? `${product.name} · seuil par défaut : ${product.minStock}. Laissez le seuil vide pour l'appliquer.` : undefined}
      onSubmit={onSubmit}
      submitLabel="Enregistrer"
    >
      <div className="flex flex-col divide-y rounded-lg border">
        {sites.map((site, i) => (
          <div key={site.id} className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-[1fr_9rem_9rem] sm:items-start">
            <div className="flex flex-col sm:pt-7">
              <span className="font-medium">{site.name}</span>
              <span className="text-xs text-muted-foreground">{site.kind === "entrepot" ? "Entrepôt" : "Boutique"}</span>
            </div>
            <NumberField control={form.control} name={`levels.${i}.quantity`} label="Stock" required min={0} />
            <NumberField control={form.control} name={`levels.${i}.minStock`} label="Seuil d'alerte" min={0} placeholder={String(product?.minStock ?? "")} />
          </div>
        ))}
      </div>
    </FormDialog>
  )
}

export const ProductStockDialog = lazyDialog(ProductStockDialogContent)
