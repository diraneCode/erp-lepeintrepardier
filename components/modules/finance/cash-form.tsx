"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { DateField, NumberField, SelectField, SwitchField, TextField, TextareaField } from "@/components/forms/fields"
import { FormDialog, FormGrid } from "@/components/shared/form-dialog"
import { lazyDialog } from "@/components/shared/lazy-dialog"
import { useCurrentUser } from "@/hooks/use-access"
import { formatMoney, toISODate } from "@/lib/format"
import { BANKS, depositMode, expenseCategory, toOptions } from "@/lib/labels"
import { uid, useStore } from "@/lib/store"
import type { CashKind } from "@/lib/types"

/** Opérations saisies directement en caisse (les ventes et règlements arrivent automatiquement). */
export type ManualCashKind = Extract<CashKind, "versement_banque" | "depense" | "apport" | "autre_entree" | "autre_sortie">

const KINDS: Record<ManualCashKind, { label: string; out: boolean; title: string; description: string }> = {
  versement_banque: { label: "Versement en banque", out: true, title: "Versement en banque", description: "L'argent déposé à la banque sort de la caisse." },
  depense: { label: "Dépense de caisse", out: true, title: "Dépense payée en caisse", description: "Enregistrée comme dépense payée en espèces ; le montant sort de la caisse." },
  apport: { label: "Approvisionnement de caisse", out: false, title: "Approvisionnement de caisse", description: "Fonds de caisse, retrait bancaire ou apport du siège." },
  autre_entree: { label: "Autre entrée", out: false, title: "Autre entrée d'espèces", description: "Toute autre somme reçue en espèces." },
  autre_sortie: { label: "Autre sortie", out: true, title: "Autre sortie d'espèces", description: "Toute autre somme sortie de la caisse (hors dépense et versement)." },
}

const schema = z
  .object({
    kind: z.enum(["versement_banque", "depense", "apport", "autre_entree", "autre_sortie"]),
    date: z.string().min(1, "Date requise"),
    amount: z.number({ error: "Montant requis" }).int("Montant en FCFA, sans décimales").positive("Le montant doit être supérieur à 0"),
    label: z.string().trim().max(200).optional(),
    note: z.string().trim().max(500).optional(),
    // Versement
    bankName: z.string().trim().max(120).optional(),
    bankAccount: z.string().trim().max(60).optional(),
    depositMode: z.enum(["especes", "cheque", "mobile_money"]),
    slipNumber: z.string().trim().max(60).optional(),
    depositor: z.string().trim().max(120).optional(),
    // Dépense
    category: z.enum(["loyer", "transport", "fournitures", "marketing", "maintenance", "energie", "telecom", "impots", "achats", "autres"]),
    supplier: z.string().trim().max(120).optional(),
    hasReceipt: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.date > toISODate(new Date())) ctx.addIssue({ code: "custom", path: ["date"], message: "La date ne peut pas être dans le futur" })
    if (v.kind === "versement_banque") {
      if (!v.bankName) ctx.addIssue({ code: "custom", path: ["bankName"], message: "Banque requise" })
      if (!v.depositor) ctx.addIssue({ code: "custom", path: ["depositor"], message: "Indiquez qui a effectué le dépôt" })
    } else if (v.kind === "depense") {
      if (!v.label) ctx.addIssue({ code: "custom", path: ["label"], message: "Motif de la dépense requis" })
      if (!v.supplier) ctx.addIssue({ code: "custom", path: ["supplier"], message: "Bénéficiaire requis" })
    } else if (!v.label) {
      ctx.addIssue({ code: "custom", path: ["label"], message: "Libellé requis" })
    }
  })
type FormValues = z.infer<typeof schema>

function CashFormDialogContent({
  open,
  onOpenChange,
  locationId,
  locationName,
  kind,
  balance,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  locationId: string
  locationName: string
  kind: ManualCashKind
  /** Solde actuel de la caisse */
  balance: number
}) {
  const add = useStore((s) => s.add)
  const recordCashExpense = useStore((s) => s.recordCashExpense)
  const me = useCurrentUser()
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      kind,
      date: toISODate(new Date()),
      amount: Number.NaN,
      label: "",
      note: "",
      bankName: "",
      bankAccount: "",
      depositMode: "especes",
      slipNumber: "",
      depositor: me ? `${me.firstName} ${me.lastName}` : "",
      category: "autres",
      supplier: "",
      hasReceipt: true,
    })
  }, [open, kind, me, form])

  const [current, amount] = useWatch({ control: form.control, name: ["kind", "amount"] })
  const def = KINDS[current ?? kind]
  const exceeds = def.out && Number.isFinite(amount) && amount > balance

  const onSubmit = form.handleSubmit(async (v) => {
    if (KINDS[v.kind].out && v.amount > balance) {
      form.setError("amount", { message: `Solde de caisse insuffisant : ${formatMoney(balance)} disponibles` })
      return
    }
    if (v.kind === "depense") {
      const number = await recordCashExpense({
        locationId,
        date: v.date,
        amount: v.amount,
        category: v.category,
        description: v.label ?? "",
        supplier: v.supplier ?? "",
        hasReceipt: v.hasReceipt,
      })
      if (!number) return
      toast.success("Dépense enregistrée", { description: `${number} · ${formatMoney(v.amount)} sortis de la caisse` })
    } else {
      const ok = await add("cashMovements", {
        id: uid("cai"),
        number: "",
        date: v.date,
        locationId,
        direction: KINDS[v.kind].out ? "sortie" : "entree",
        kind: v.kind,
        amount: v.amount,
        label: v.kind === "versement_banque" ? v.label || `Versement ${v.bankName}` : (v.label ?? ""),
        note: v.note || undefined,
        ...(v.kind === "versement_banque"
          ? { bankName: v.bankName, bankAccount: v.bankAccount || undefined, depositMode: v.depositMode, slipNumber: v.slipNumber || undefined, depositor: v.depositor }
          : {}),
      })
      if (!ok) return
      toast.success(`${KINDS[v.kind].label} enregistré`, { description: `${formatMoney(v.amount)} · caisse ${locationName}` })
    }
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={def.title}
      description={`${def.description} Caisse : ${locationName}.`}
      onSubmit={onSubmit}
      submitLabel="Enregistrer"
      size="lg"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Solde actuel de la caisse</span>
          <span className={exceeds ? "font-semibold text-destructive tabular" : "font-semibold tabular"}>{formatMoney(balance)}</span>
        </div>
        <FormGrid>
          <SelectField
            control={form.control}
            name="kind"
            label="Opération"
            required
            options={(Object.keys(KINDS) as ManualCashKind[]).map((k) => ({ value: k, label: KINDS[k].label }))}
          />
          <DateField control={form.control} name="date" label="Date" required />
          <NumberField
            control={form.control}
            name="amount"
            label="Montant"
            required
            suffix="FCFA"
            min={1}
            step={500}
            description={exceeds ? `Supérieur au solde (${formatMoney(balance)})` : def.out ? `Disponible : ${formatMoney(balance)}` : undefined}
          />

          {current === "versement_banque" && (
            <>
              <TextField control={form.control} name="bankName" label="Banque" required list="cash-banks" placeholder="Ex : Afriland First Bank" />
              <SelectField control={form.control} name="depositMode" label="Mode de versement" required options={toOptions(depositMode)} />
              <TextField control={form.control} name="bankAccount" label="N° de compte" placeholder="Facultatif" />
              <TextField control={form.control} name="slipNumber" label="N° de bordereau" placeholder="Bordereau de versement" />
              <TextField control={form.control} name="depositor" label="Déposant" required description="Personne qui a déposé l'argent à la banque" />
              <TextField control={form.control} name="label" label="Libellé" placeholder="Versement recette de la semaine…" className="sm:col-span-2" />
              <datalist id="cash-banks">
                {BANKS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </>
          )}

          {current === "depense" && (
            <>
              <SelectField control={form.control} name="category" label="Catégorie" required options={toOptions(expenseCategory)} />
              <TextField control={form.control} name="supplier" label="Bénéficiaire" required placeholder="Fournisseur, prestataire…" />
              <TextField control={form.control} name="label" label="Motif" required placeholder="Ex : Transport livraison client" className="sm:col-span-2" />
              <SwitchField control={form.control} name="hasReceipt" label="Justificatif fourni" description="Facture, reçu ou ticket conservé" className="sm:col-span-2" />
            </>
          )}

          {(current === "apport" || current === "autre_entree" || current === "autre_sortie") && (
            <TextField
              control={form.control}
              name="label"
              label="Libellé"
              required
              placeholder={current === "apport" ? "Ex : Fonds de caisse, retrait banque" : "Motif de l'opération"}
              className="sm:col-span-2"
            />
          )}

          {current !== "depense" && <TextareaField control={form.control} name="note" label="Observation" rows={2} className="sm:col-span-2" />}
        </FormGrid>
      </div>
    </FormDialog>
  )
}

export const CashFormDialog = lazyDialog(CashFormDialogContent)
