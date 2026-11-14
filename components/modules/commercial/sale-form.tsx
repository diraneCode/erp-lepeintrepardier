"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { format } from "date-fns"

import { ComboboxField, DateField, SelectField, SwitchField, TextareaField } from "@/components/forms/fields"
import { LineItemsEditor, emptyLine, lineItemsSchema } from "@/components/forms/line-items-editor"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { useCurrentUser, useModuleAccess } from "@/hooks/use-access"
import { paymentMethod, saleChannel, saleStatus, toOptions } from "@/lib/labels"
import { nextNumber, uid, useStore } from "@/lib/store"
import type { Sale } from "@/lib/types"
import { lazyDialog } from "@/components/shared/lazy-dialog"

const COUNTER = "__comptoir__"

const schema = z
  .object({
    date: z.string().min(1, "Date requise"),
    boutiqueId: z.string().min(1, "Boutique requise"),
    sellerId: z.string().min(1, "Vendeur requis"),
    clientId: z.string(),
    channel: z.enum(["boutique", "telephone", "chantier", "en_ligne"]),
    paymentMethod: z.enum(["especes", "mobile_money", "carte", "virement", "cheque", "credit"]),
    status: z.enum(["brouillon", "confirmee", "livree", "annulee"]),
    items: lineItemsSchema,
    createInvoice: z.boolean(),
    notes: z.string().optional(),
  })
  .refine((v) => v.paymentMethod !== "credit" || v.clientId !== COUNTER, {
    path: ["clientId"],
    message: "Une vente à crédit doit être rattachée à un client",
  })
type FormValues = z.infer<typeof schema>

const defaults = (sale?: Sale): FormValues => ({
  date: sale?.date ?? format(new Date(), "yyyy-MM-dd"),
  boutiqueId: sale?.boutiqueId ?? "",
  sellerId: sale?.sellerId ?? "",
  clientId: sale ? sale.clientId ?? COUNTER : COUNTER,
  channel: sale?.channel ?? "boutique",
  paymentMethod: sale?.paymentMethod ?? "especes",
  status: sale?.status ?? "livree",
  items: sale?.items ?? [{ ...emptyLine }],
  createInvoice: !sale,
  notes: sale?.notes ?? "",
})

function SaleFormDialogContent({ open, onOpenChange, sale }: { open: boolean; onOpenChange: (o: boolean) => void; sale?: Sale }) {
  const createSale = useStore((s) => s.createSale)
  const updateSale = useStore((s) => s.updateSale)
  const { clientOptions, employeeOptions, employeeById, shopOptions: allShops } = useLookups(["clientOptions", "employeeOptions", "employeeById", "shopOptions"])
  const acc = useModuleAccess("ventes")
  const me = useCurrentUser()
  const myShop = allShops.find((s) => s.value === me?.locationId)
  // Un vendeur / responsable vend dans sa boutique d'affectation
  const shopOptions = acc.global || !myShop ? allShops : [myShop]
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults() })
  const boutiqueId = useWatch({ control: form.control, name: "boutiqueId" })
  const clientId = useWatch({ control: form.control, name: "clientId" })

  React.useEffect(() => {
    if (!open) return
    if (sale) form.reset(defaults(sale))
    else form.reset({ ...defaults(), sellerId: acc.global ? "" : me?.id ?? "", boutiqueId: !acc.global && myShop ? myShop.value : "" })
  }, [open, sale, form, acc.global, me, myShop])

  // Modification : les quantités de la vente sont déjà sorties du stock de sa boutique
  const stockCredit = React.useMemo(() => {
    if (!sale || sale.status === "brouillon" || sale.boutiqueId !== boutiqueId) return undefined
    const credit: Record<string, number> = {}
    sale.items.forEach((i) => i.productId && (credit[i.productId] = (credit[i.productId] ?? 0) + i.quantity))
    return credit
  }, [sale, boutiqueId])

  const onSubmit = form.handleSubmit(async (values) => {
    const { createInvoice, clientId: cid, ...rest } = values
    if (sale) {
      if (!(await updateSale(sale.id, { ...rest, clientId: cid === COUNTER ? null : cid }))) return
      toast.success("Vente modifiée", { description: `${sale.number} — stock et encaissement ajustés` })
      onOpenChange(false)
      return
    }
    const number = nextNumber("VTE", useStore.getState().sales)
    if (!(await createSale({ ...rest, id: uid("v"), number, clientId: cid === COUNTER ? null : cid }, { createInvoice: createInvoice && cid !== COUNTER }))) return
    toast.success("Vente enregistrée", { description: `${number} — stock mis à jour` })
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={sale ? `Modifier la vente ${sale.number}` : "Nouvelle vente"}
      description={
        sale
          ? sale.invoiceId
            ? "Seuls les écarts sont répercutés : stock, facture liée, encaissement et caisse."
            : "Seuls les écarts sont répercutés : stock, écriture de vente et caisse."
          : "Le stock de la boutique est décrémenté à la validation."
      }
      onSubmit={onSubmit}
      size="xl"
      submitLabel={sale ? "Enregistrer les modifications" : "Valider la vente"}
    >
      <div className="flex flex-col gap-6">
        <FormSection title="Vente">
          <FormGrid cols={3}>
            <DateField control={form.control} name="date" label="Date" required />
            <SelectField control={form.control} name="boutiqueId" label="Boutique" required options={shopOptions} />
            {acc.global || acc.scope === "shop" ? (
              <ComboboxField control={form.control} name="sellerId" label="Vendeur" required options={acc.global ? employeeOptions : employeeOptions.filter((e) => employeeById.get(e.value)?.locationId === me?.locationId)} />
            ) : null}
            <ComboboxField
              control={form.control}
              name="clientId"
              label="Client"
              options={[{ value: COUNTER, label: "Client comptoir (anonyme)" }, ...clientOptions]}
              className="sm:col-span-2"
            />
            <SelectField control={form.control} name="channel" label="Canal" required options={toOptions(saleChannel)} />
            <SelectField control={form.control} name="paymentMethod" label="Mode de paiement" required options={toOptions(paymentMethod)} />
            <SelectField control={form.control} name="status" label="Statut" required options={toOptions(saleStatus).filter((o) => o.value !== "annulee")} />
          </FormGrid>
        </FormSection>
        <FormSection title="Articles">
          {!boutiqueId && <p className="text-xs text-muted-foreground">Choisissez une boutique pour afficher le stock disponible.</p>}
          <LineItemsEditor
            control={form.control}
            setValue={form.setValue}
            locationId={boutiqueId || undefined}
            stockCredit={stockCredit}
            error={form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message}
          />
        </FormSection>
        <FormGrid>
          {!sale && (
          <SwitchField
            control={form.control}
            name="createInvoice"
            label="Générer la facture"
            description={clientId === COUNTER ? "Disponible uniquement pour un client identifié" : "Une facture est créée et le paiement enregistré (sauf crédit)"}
            disabled={clientId === COUNTER}
          />
          )}
          <TextareaField control={form.control} name="notes" label="Notes" rows={3} />
        </FormGrid>
      </div>
    </FormDialog>
  )
}

export const SaleFormDialog = lazyDialog(SaleFormDialogContent)
