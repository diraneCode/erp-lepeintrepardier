"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { format } from "date-fns"

import { DateField, NumberField, SelectField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid } from "@/components/shared/form-dialog"
import { invoiceBalance } from "@/lib/calc"
import { formatMoney } from "@/lib/format"
import { paymentMethod, toOptions } from "@/lib/labels"
import { uid, useStore } from "@/lib/store"
import type { Invoice } from "@/lib/types"

export function PaymentFormDialog({ open, onOpenChange, invoice }: { open: boolean; onOpenChange: (o: boolean) => void; invoice?: Invoice | null }) {
  const recordPayment = useStore((s) => s.recordPayment)
  const balance = invoice ? invoiceBalance(invoice) : 0

  const schema = React.useMemo(
    () =>
      z.object({
        date: z.string().min(1, "Date requise"),
        amount: z.number({ error: "Montant requis" }).positive("Le montant doit être positif").max(balance, `Maximum ${formatMoney(balance)}`),
        method: z.enum(["especes", "mobile_money", "carte", "virement", "cheque"]),
        reference: z.string().trim().min(2, "Référence requise"),
      }),
    [balance]
  )
  type FormValues = z.infer<typeof schema>
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open) form.reset({ date: format(new Date(), "yyyy-MM-dd"), amount: balance, method: "virement", reference: "" })
  }, [open, balance, form])

  const onSubmit = form.handleSubmit((v) => {
    if (!invoice) return
    recordPayment({ id: uid("pay"), invoiceId: invoice.id, ...v })
    toast.success("Encaissement enregistré", { description: `${formatMoney(v.amount)} sur ${invoice.number}` })
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Enregistrer un encaissement"
      description={invoice ? `${invoice.number} · reste à payer ${formatMoney(balance)}` : undefined}
      onSubmit={onSubmit}
      submitLabel="Enregistrer"
    >
      <FormGrid>
        <NumberField control={form.control} name="amount" label="Montant" required suffix="FCFA" min={0} />
        <DateField control={form.control} name="date" label="Date" required />
        <SelectField control={form.control} name="method" label="Mode de paiement" required options={toOptions(paymentMethod).filter((o) => o.value !== "credit")} />
        <TextField control={form.control} name="reference" label="Référence" required placeholder="N° de virement, de chèque…" />
      </FormGrid>
    </FormDialog>
  )
}
