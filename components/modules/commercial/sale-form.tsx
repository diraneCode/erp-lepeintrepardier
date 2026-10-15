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

const defaults = (): FormValues => ({
  date: format(new Date(), "yyyy-MM-dd"),
  boutiqueId: "",
  sellerId: "",
  clientId: COUNTER,
  channel: "boutique",
  paymentMethod: "especes",
  status: "livree",
  items: [{ ...emptyLine }],
  createInvoice: true,
  notes: "",
})

function SaleFormDialogContent({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const createSale = useStore((s) => s.createSale)
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
    if (open) form.reset({ ...defaults(), sellerId: acc.global ? "" : me?.id ?? "", boutiqueId: !acc.global && myShop ? myShop.value : "" })
  }, [open, form, acc.global, me, myShop])

  const onSubmit = form.handleSubmit(async (values) => {
    const { createInvoice, clientId: cid, ...rest } = values
    const number = nextNumber("VTE", useStore.getState().sales)
    if (!(await createSale({ ...rest, id: uid("v"), number, clientId: cid === COUNTER ? null : cid }, { createInvoice: createInvoice && cid !== COUNTER }))) return
    toast.success("Vente enregistrée", { description: `${number} — stock mis à jour` })
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvelle vente"
      description="Le stock de la boutique est décrémenté à la validation."
      onSubmit={onSubmit}
      size="xl"
      submitLabel="Valider la vente"
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
            error={form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message}
          />
        </FormSection>
        <FormGrid>
          <SwitchField
            control={form.control}
            name="createInvoice"
            label="Générer la facture"
            description={clientId === COUNTER ? "Disponible uniquement pour un client identifié" : "Une facture est créée et le paiement enregistré (sauf crédit)"}
            disabled={clientId === COUNTER}
          />
          <TextareaField control={form.control} name="notes" label="Notes" rows={3} />
        </FormGrid>
      </div>
    </FormDialog>
  )
}

export const SaleFormDialog = lazyDialog(SaleFormDialogContent)
