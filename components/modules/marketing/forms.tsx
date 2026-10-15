"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { addDays, format } from "date-fns"

import { ComboboxField, DateField, NumberField, SelectField, SwitchField, TextareaField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { campaignChannel, campaignStatus, clientSegment, toOptions } from "@/lib/labels"
import { uid, useStore } from "@/lib/store"
import type { Campaign, Promotion } from "@/lib/types"
import { lazyDialog } from "@/components/shared/lazy-dialog"

const d = (n = 0) => format(addDays(new Date(), n), "yyyy-MM-dd")

/* ---------- Campagne ---------- */

const campaignSchema = z
  .object({
    name: z.string().trim().min(3, "Nom requis (3 caractères min.)"),
    channel: z.enum(["sms", "email", "facebook", "whatsapp", "radio", "affichage"]),
    status: z.enum(["brouillon", "planifiee", "en_cours", "suspendue", "terminee"]),
    segment: z.enum(["tous", "btp", "particulier", "revendeur", "administration", "hotellerie"]),
    startDate: z.string().min(1, "Date de début requise"),
    endDate: z.string().min(1, "Date de fin requise"),
    budget: z.number({ error: "Budget requis" }).min(0),
    spent: z.number({ error: "Montant requis" }).min(0),
    reach: z.number({ error: "Valeur requise" }).int("Nombre entier").min(0),
    leads: z.number({ error: "Valeur requise" }).int("Nombre entier").min(0),
    conversions: z.number({ error: "Valeur requise" }).int("Nombre entier").min(0),
    revenue: z.number({ error: "Montant requis" }).min(0),
    ownerId: z.string().min(1, "Responsable requis"),
    description: z.string().optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "La fin doit suivre le début" })
  .refine((v) => v.conversions <= v.leads, { path: ["conversions"], message: "Ne peut dépasser le nombre de leads" })
type CampaignValues = z.infer<typeof campaignSchema>

const campaignDefaults = (c?: Campaign): CampaignValues => ({
  name: c?.name ?? "",
  channel: c?.channel ?? "facebook",
  status: c?.status ?? "brouillon",
  segment: c?.segment ?? "tous",
  startDate: c?.startDate ?? d(),
  endDate: c?.endDate ?? d(30),
  budget: c?.budget ?? 500_000,
  spent: c?.spent ?? 0,
  reach: c?.reach ?? 0,
  leads: c?.leads ?? 0,
  conversions: c?.conversions ?? 0,
  revenue: c?.revenue ?? 0,
  ownerId: c?.ownerId ?? "",
  description: c?.description ?? "",
})

function CampaignFormDialogContent({ open, onOpenChange, campaign }: { open: boolean; onOpenChange: (o: boolean) => void; campaign?: Campaign }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const { employeeOptions } = useLookups(["employeeOptions"])
  const form = useForm<CampaignValues>({ resolver: zodResolver(campaignSchema), defaultValues: campaignDefaults(campaign) })
  React.useEffect(() => {
    if (open) form.reset(campaignDefaults(campaign))
  }, [open, campaign, form])

  const onSubmit = form.handleSubmit(async (v) => {
    if (campaign) {
      if (!(await update("campaigns", campaign.id, v))) return
    } else if (!(await add("campaigns", { ...v, id: uid("cp") }))) return
    toast.success(campaign ? "Campagne mise à jour" : "Campagne créée", { description: v.name })
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={campaign ? "Modifier la campagne" : "Nouvelle campagne"} onSubmit={onSubmit} size="lg">
      <div className="flex flex-col gap-6">
        <FormSection title="Campagne">
          <FormGrid>
            <TextField control={form.control} name="name" label="Nom" required className="sm:col-span-2" />
            <SelectField control={form.control} name="channel" label="Canal" required options={toOptions(campaignChannel)} />
            <SelectField control={form.control} name="segment" label="Cible" required options={[{ value: "tous", label: "Tous les clients" }, ...toOptions(clientSegment)]} />
            <DateField control={form.control} name="startDate" label="Début" required />
            <DateField control={form.control} name="endDate" label="Fin" required />
            <SelectField control={form.control} name="status" label="Statut" required options={toOptions(campaignStatus)} />
            <ComboboxField control={form.control} name="ownerId" label="Responsable" required options={employeeOptions} />
          </FormGrid>
        </FormSection>
        <FormSection title="Budget & résultats">
          <FormGrid cols={3}>
            <NumberField control={form.control} name="budget" label="Budget" suffix="FCFA" min={0} step={50000} />
            <NumberField control={form.control} name="spent" label="Dépensé" suffix="FCFA" min={0} step={10000} />
            <NumberField control={form.control} name="revenue" label="CA généré" suffix="FCFA" min={0} step={10000} />
            <NumberField control={form.control} name="reach" label="Personnes touchées" min={0} step={100} />
            <NumberField control={form.control} name="leads" label="Leads" min={0} />
            <NumberField control={form.control} name="conversions" label="Conversions" min={0} />
          </FormGrid>
        </FormSection>
        <TextareaField control={form.control} name="description" label="Description" rows={3} />
      </div>
    </FormDialog>
  )
}

/* ---------- Promotion ---------- */

const promoSchema = z
  .object({
    code: z.string().trim().min(3, "3 caractères minimum").max(20).regex(/^[A-Z0-9_-]+$/, "Majuscules, chiffres, - et _ uniquement"),
    name: z.string().trim().min(3, "Libellé requis"),
    type: z.enum(["pourcentage", "montant"]),
    value: z.number({ error: "Valeur requise" }).positive("Doit être positive"),
    minAmount: z.number({ error: "Montant requis" }).min(0),
    categoryId: z.string(),
    startDate: z.string().min(1, "Date requise"),
    endDate: z.string().min(1, "Date requise"),
    usageLimit: z.number({ error: "Limite requise" }).int().positive("Doit être positive"),
    active: z.boolean(),
  })
  .refine((v) => v.type !== "pourcentage" || v.value <= 100, { path: ["value"], message: "Maximum 100 %" })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "La fin doit suivre le début" })
type PromoValues = z.infer<typeof promoSchema>

const promoDefaults = (p?: Promotion): PromoValues => ({
  code: p?.code ?? "",
  name: p?.name ?? "",
  type: p?.type ?? "pourcentage",
  value: p?.value ?? 10,
  minAmount: p?.minAmount ?? 0,
  categoryId: p?.categoryId ?? "all",
  startDate: p?.startDate ?? d(),
  endDate: p?.endDate ?? d(30),
  usageLimit: p?.usageLimit ?? 200,
  active: p?.active ?? true,
})

function PromotionFormDialogContent({ open, onOpenChange, promotion }: { open: boolean; onOpenChange: (o: boolean) => void; promotion?: Promotion }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const { categoryOptions } = useLookups(["categoryOptions"])
  const form = useForm<PromoValues>({ resolver: zodResolver(promoSchema), defaultValues: promoDefaults(promotion) })
  React.useEffect(() => {
    if (open) form.reset(promoDefaults(promotion))
  }, [open, promotion, form])
  const type = form.watch("type")

  const onSubmit = form.handleSubmit(async (v) => {
    const exists = useStore.getState().promotions.some((p) => p.code === v.code && p.id !== promotion?.id)
    if (exists) {
      form.setError("code", { message: "Ce code existe déjà" })
      return
    }
    const payload = { ...v, categoryId: v.categoryId === "all" ? null : v.categoryId }
    if (promotion) {
      if (!(await update("promotions", promotion.id, payload))) return
    } else if (!(await add("promotions", { ...payload, id: uid("pr"), usageCount: 0 }))) return
    toast.success(promotion ? "Promotion mise à jour" : "Promotion créée", { description: v.code })
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={promotion ? "Modifier la promotion" : "Nouvelle promotion"} onSubmit={onSubmit} size="lg">
      <FormGrid>
        <TextField control={form.control} name="code" label="Code promo" required placeholder="EX : SAISON10" onInput={(e) => (e.currentTarget.value = e.currentTarget.value.toUpperCase())} />
        <TextField control={form.control} name="name" label="Libellé" required />
        <SelectField control={form.control} name="type" label="Type de remise" required options={[{ value: "pourcentage", label: "Pourcentage" }, { value: "montant", label: "Montant fixe" }]} />
        <NumberField control={form.control} name="value" label="Valeur" required suffix={type === "pourcentage" ? "%" : "FCFA"} min={0} />
        <NumberField control={form.control} name="minAmount" label="Achat minimum" suffix="FCFA" min={0} step={5000} />
        <SelectField control={form.control} name="categoryId" label="Catégorie" options={[{ value: "all", label: "Toutes catégories" }, ...categoryOptions]} />
        <DateField control={form.control} name="startDate" label="Début" required />
        <DateField control={form.control} name="endDate" label="Fin" required />
        <NumberField control={form.control} name="usageLimit" label="Utilisations max." required min={1} />
        <SwitchField control={form.control} name="active" label="Promotion active" description="Utilisable en caisse" />
      </FormGrid>
    </FormDialog>
  )
}

export const CampaignFormDialog = lazyDialog(CampaignFormDialogContent)

export const PromotionFormDialog = lazyDialog(PromotionFormDialogContent)
