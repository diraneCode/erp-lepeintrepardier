"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { LuCopy } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberField, SelectField } from "@/components/forms/fields"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { formatMoney } from "@/lib/format"
import { MONTHS_FR, monthTarget } from "@/lib/targets"
import { useStore } from "@/lib/store"
import type { Shop } from "@/lib/types"
import { lazyDialog } from "@/components/shared/lazy-dialog"

const amount = z.number({ error: "Montant requis" }).min(0, "Doit être positif").max(10_000_000_000, "Montant trop élevé")
const schema = z.object({
  shopId: z.string().min(1, "Boutique requise"),
  year: z.string().min(4, "Année requise"),
  months: z.array(amount).length(12),
})
type FormValues = z.infer<typeof schema>

function ShopTargetsDialogContent({
  open,
  onOpenChange,
  shops,
  shopId,
  year,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  shops: Shop[]
  shopId?: string
  year: number
}) {
  const targets = useStore((s) => s.shopTargets)
  const setShopTargets = useStore((s) => s.setShopTargets)
  const [bulk, setBulk] = React.useState("")
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })
  const years = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - 1 + i))

  const load = React.useCallback(
    (sid: string, y: string) => {
      const shop = shops.find((s) => s.id === sid)
      return MONTHS_FR.map((_, i) => (shop ? monthTarget(targets, shop, `${y}-${String(i + 1).padStart(2, "0")}`) : Number.NaN))
    },
    [shops, targets]
  )

  React.useEffect(() => {
    if (!open) return
    const sid = shopId ?? shops[0]?.id ?? ""
    form.reset({ shopId: sid, year: String(year), months: load(sid, String(year)) })
  }, [open, shopId, year, shops, form, load])

  const [sid, y, months] = useWatch({ control: form.control, name: ["shopId", "year", "months"] })
  const prevKey = React.useRef("")
  React.useEffect(() => {
    // Recharge les montants enregistrés quand on change de boutique ou d'année
    const key = `${sid}|${y}`
    if (open && sid && y && prevKey.current && prevKey.current !== key) form.setValue("months", load(sid, y))
    prevKey.current = key
  }, [sid, y, open, form, load])

  const total = (months ?? []).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)

  const onSubmit = form.handleSubmit(async (v) => {
    if (!(await setShopTargets(
      v.shopId,
      v.months.map((amount, i) => ({ period: `${v.year}-${String(i + 1).padStart(2, "0")}`, amount: Math.round(amount) }))
    ))) return
    toast.success("Objectifs enregistrés", { description: `${shops.find((s) => s.id === v.shopId)?.name} · ${v.year}` })
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Objectifs mensuels"
      description="Chiffre d'affaires TTC à atteindre pour chaque mois."
      onSubmit={onSubmit}
      size="xl"
      submitLabel="Enregistrer les objectifs"
      footerStart={<>Total annuel : <span className="font-semibold text-foreground tabular">{formatMoney(total)}</span></>}
    >
      <div className="flex flex-col gap-6">
        <FormGrid>
          <SelectField control={form.control} name="shopId" label="Boutique" required options={shops.map((s) => ({ value: s.id, label: s.name }))} />
          <SelectField control={form.control} name="year" label="Année" required options={years.map((v) => ({ value: v, label: v }))} />
        </FormGrid>
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="bulk" className="text-xs">Appliquer un même montant à tous les mois</Label>
            <Input id="bulk" type="number" min={0} step={500000} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="Ex : 12 000 000" className="tabular" />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!bulk || Number(bulk) < 0}
            onClick={() => {
              form.setValue("months", Array(12).fill(Number(bulk)), { shouldValidate: true })
              setBulk("")
            }}
          >
            <LuCopy /> Appliquer
          </Button>
        </div>
        <FormSection title="Montants par mois">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {MONTHS_FR.map((m, i) => (
              <NumberField key={m} control={form.control} name={`months.${i}`} label={`${m} ${y ?? ""}`} suffix="FCFA" min={0} step={500000} />
            ))}
          </div>
        </FormSection>
      </div>
    </FormDialog>
  )
}

export const ShopTargetsDialog = lazyDialog(ShopTargetsDialogContent)
