"use client"

import * as React from "react"
import { Controller, useFieldArray, useWatch, type Control, type UseFormSetValue } from "react-hook-form"
import { LuCalculator, LuPackage, LuPenLine, LuPlus, LuTrash2 } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/forms/fields"
import { useLookups } from "@/hooks/use-lookups"
import { lineSubtotal } from "@/lib/calc"
import { formatMoney } from "@/lib/format"
import { productUnit } from "@/lib/labels"
import { effectivePrice } from "@/lib/products"
import { SECTION_LABEL, SECTIONS, amountInWords, computedQuantity, sectionOf, sectionTotals } from "@/lib/proforma"
import type { LineItem, LineSection, SurfaceRow } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface ProformaForm {
  items: LineItem[]
  surfaces: SurfaceRow[]
  applyTax: boolean
}

const num = (v: string) => (v === "" ? Number.NaN : Number(v))
const val = (v?: number) => (v !== undefined && Number.isFinite(v) ? v : "")

/** Grilles de colonnes par rubrique (bureau) */
const GRID: Record<LineSection, string> = {
  traitement: "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_72px_80px_80px_76px_100px_100px_32px]",
  main_oeuvre: "md:grid-cols-[minmax(0,1fr)_90px_110px_120px_32px]",
  accessoires: "md:grid-cols-[minmax(0,1fr)_90px_110px_120px_32px]",
}

function SectionHeader({ section, total }: { section: LineSection; total: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-primary px-3 py-1.5 text-xs font-semibold tracking-wide text-primary-foreground uppercase">
      <span>{SECTION_LABEL[section].title}</span>
      <span className="tabular">{formatMoney(total)}</span>
    </div>
  )
}

export function ProformaEditor({
  control,
  setValue,
  error,
}: {
  control: Control<ProformaForm>
  setValue: UseFormSetValue<ProformaForm>
  error?: string
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "items" })
  const surfacesArray = useFieldArray({ control, name: "surfaces" })
  const watchedItems = useWatch({ control, name: "items" }) as LineItem[] | undefined
  const items = React.useMemo(() => watchedItems ?? [], [watchedItems])
  const surfaces = (useWatch({ control, name: "surfaces" }) ?? []) as SurfaceRow[]
  const applyTax = useWatch({ control, name: "applyTax" })
  const { productById, productOptions } = useLookups()

  const projectSurface = surfaces.filter((s) => s.unit === "m²").reduce((s, r) => s + (Number.isFinite(r.quantity) ? r.quantity : 0), 0)

  // Champ calculé : quantité = surface ÷ couverture (rubrique traitement)
  React.useEffect(() => {
    items.forEach((it, i) => {
      if (sectionOf(it) !== "traitement") return
      const q = computedQuantity(it.surface, it.coverage)
      if (q !== null && q !== it.quantity) setValue(`items.${i}.quantity`, q, { shouldValidate: true })
    })
  }, [items, setValue])

  const safe = items.map((i) => ({
    ...i,
    quantity: Number.isFinite(i.quantity) ? i.quantity : 0,
    unitPrice: Number.isFinite(i.unitPrice) ? i.unitPrice : 0,
    discount: 0,
    taxRate: applyTax ? 19.25 : 0,
  }))
  const totals = sectionTotals(safe)

  const addLine = (section: LineSection, custom: boolean) =>
    append({
      productId: "",
      custom,
      description: "",
      quantity: section === "main_oeuvre" ? projectSurface || 1 : 1,
      unitPrice: Number.NaN,
      discount: 0,
      taxRate: applyTax ? 19.25 : 0,
      section,
      surface: section === "traitement" && projectSurface ? projectSurface : undefined,
    })

  const pickProduct = (i: number, id: string) => {
    const p = productById.get(id)
    if (!p) return
    setValue(`items.${i}.description`, p.name)
    setValue(`items.${i}.unitPrice`, effectivePrice(p), { shouldValidate: true })
    setValue(`items.${i}.specification`, p.specification ?? "")
    setValue(`items.${i}.packaging`, p.packaging ?? productUnit[p.unit])
    setValue(`items.${i}.coverage`, p.coverage)
    if (!items[i]?.surface && projectSurface) setValue(`items.${i}.surface`, projectSurface)
  }

  const numberCell = (name: `items.${number}.${"quantity" | "unitPrice" | "coverage" | "surface"}`, label: string, opts: { readOnly?: boolean; className?: string } = {}) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Input
          type="number"
          min={0}
          aria-label={label}
          placeholder={label}
          readOnly={opts.readOnly}
          aria-invalid={fieldState.invalid}
          className={cn("text-right tabular", opts.readOnly && "bg-muted/60", opts.className)}
          value={val(field.value as number | undefined)}
          onChange={(e) => field.onChange(num(e.target.value))}
        />
      )}
    />
  )

  const textCell = (name: `items.${number}.${"description" | "specification" | "packaging"}`, label: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => <Input {...field} value={(field.value as string) ?? ""} aria-label={label} placeholder={label} aria-invalid={fieldState.invalid} />}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Évaluation des surfaces */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-md bg-info/15 px-2.5 py-1 text-xs font-semibold tracking-wide text-info uppercase">Évaluation des surfaces à traiter</span>
          {projectSurface > 0 && <span className="text-xs text-muted-foreground">Surface totale : <span className="font-semibold text-foreground tabular">{projectSurface} m²</span></span>}
        </div>
        <div className="hidden grid-cols-[minmax(0,1fr)_90px_80px_minmax(0,1fr)_minmax(0,1.2fr)_32px] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
          <span>Désignation</span>
          <span className="text-right">Quantité</span>
          <span>Unité</span>
          <span>Traitement</span>
          <span>Nom commercial</span>
          <span />
        </div>
        {surfacesArray.fields.map((f, i) => (
          <div key={f.id} className="grid grid-cols-2 gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_90px_80px_minmax(0,1fr)_minmax(0,1.2fr)_32px] md:border-0 md:p-0">
            <Controller control={control} name={`surfaces.${i}.designation`} render={({ field, fieldState }) => <Input {...field} placeholder="Ex : Sol parking" aria-label="Désignation" aria-invalid={fieldState.invalid} className="col-span-2 md:col-span-1" />} />
            <Controller control={control} name={`surfaces.${i}.quantity`} render={({ field, fieldState }) => <Input type="number" min={0} aria-label="Quantité" placeholder="Qté" className="text-right tabular" aria-invalid={fieldState.invalid} value={val(field.value)} onChange={(e) => field.onChange(num(e.target.value))} />} />
            <Controller control={control} name={`surfaces.${i}.unit`} render={({ field }) => <Input {...field} aria-label="Unité" placeholder="m²" />} />
            <Controller control={control} name={`surfaces.${i}.treatment`} render={({ field }) => <Input {...field} aria-label="Traitement" placeholder="Traitement" />} />
            <Controller control={control} name={`surfaces.${i}.commercialName`} render={({ field }) => <Input {...field} aria-label="Nom commercial" placeholder="Produits utilisés" />} />
            <Button type="button" variant="ghost" size="icon" className="justify-self-end text-muted-foreground hover:text-destructive" onClick={() => surfacesArray.remove(i)} aria-label="Supprimer la surface">
              <LuTrash2 />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => surfacesArray.append({ designation: "", quantity: Number.NaN, unit: "m²", treatment: "", commercialName: "" })}>
          <LuPlus /> Ajouter une surface
        </Button>
      </div>

      {SECTIONS.map((section) => {
        const rows = fields.map((f, idx) => ({ f, idx })).filter(({ idx }) => sectionOf(items[idx] ?? { section: "traitement" } as LineItem) === section)
        return (
          <div key={section} className="flex flex-col gap-2">
            <SectionHeader section={section} total={totals[section]} />
            {rows.length > 0 && (
              <div className={cn("hidden gap-2 px-1 text-xs font-medium text-muted-foreground md:grid", GRID[section])}>
                {section === "traitement" ? (
                  <>
                    <span>Produit / service</span>
                    <span>Spécificité</span>
                    <span>Cond.</span>
                    <span className="text-right">Couv. (m²)</span>
                    <span className="text-right">Surface</span>
                    <span className="text-right">Qté</span>
                    <span className="text-right">PU</span>
                    <span className="text-right">Montant</span>
                  </>
                ) : (
                  <>
                    <span>Désignation</span>
                    <span className="text-right">{section === "main_oeuvre" ? "Qté (m²)" : "Qté"}</span>
                    <span className="text-right">PU</span>
                    <span className="text-right">Montant</span>
                  </>
                )}
                <span />
              </div>
            )}
            {rows.map(({ f, idx }) => {
              const it = items[idx] ?? ({} as LineItem)
              const auto = section === "traitement" && computedQuantity(it.surface, it.coverage) !== null
              const amount = Number.isFinite(it.quantity) && Number.isFinite(it.unitPrice) ? lineSubtotal({ ...it, discount: 0 }) : 0
              const designation = it.custom ? (
                textCell(`items.${idx}.description`, section === "main_oeuvre" ? "Prestation (ex : préparation de surface)" : "Désignation")
              ) : (
                <Controller
                  control={control}
                  name={`items.${idx}.productId`}
                  render={({ field, fieldState }) => (
                    <Combobox
                      value={field.value}
                      options={productOptions}
                      placeholder="Rechercher un produit…"
                      invalid={fieldState.invalid}
                      onChange={(id) => {
                        field.onChange(id)
                        pickProduct(idx, id)
                      }}
                    />
                  )}
                />
              )
              return (
                <div key={f.id} className={cn("grid grid-cols-2 items-start gap-2 rounded-lg border p-3 md:border-0 md:p-0", GRID[section])}>
                  <div className="col-span-2 md:col-span-1">{designation}</div>
                  {section === "traitement" ? (
                    <>
                      <div className="col-span-2 md:col-span-1">{textCell(`items.${idx}.specification`, "Spécificité")}</div>
                      {textCell(`items.${idx}.packaging`, "Cond.")}
                      {numberCell(`items.${idx}.coverage`, "Couv.")}
                      {numberCell(`items.${idx}.surface`, "Surface")}
                      <div className="relative">
                        {numberCell(`items.${idx}.quantity`, "Qté", { readOnly: auto, className: auto ? "pl-6" : undefined })}
                        {auto && <LuCalculator className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-primary" aria-label="Quantité calculée" />}
                      </div>
                      {numberCell(`items.${idx}.unitPrice`, "PU")}
                    </>
                  ) : (
                    <>
                      {numberCell(`items.${idx}.quantity`, "Qté")}
                      {numberCell(`items.${idx}.unitPrice`, "PU")}
                    </>
                  )}
                  <div className="flex h-8 items-center justify-end text-sm font-medium tabular">{formatMoney(amount, { currency: false })}</div>
                  <Button type="button" variant="ghost" size="icon" className="justify-self-end text-muted-foreground hover:text-destructive" onClick={() => remove(idx)} aria-label="Supprimer la ligne">
                    <LuTrash2 />
                  </Button>
                </div>
              )
            })}
            <div className="flex flex-wrap gap-2">
              {section !== "main_oeuvre" && (
                <Button type="button" variant="outline" size="sm" onClick={() => addLine(section, false)}>
                  <LuPackage /> Article du catalogue
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => addLine(section, true)}>
                <LuPenLine /> {section === "main_oeuvre" ? "Ajouter une prestation" : section === "accessoires" ? "Accessoire (ligne libre)" : "Ligne libre"}
              </Button>
            </div>
          </div>
        )
      })}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-3 sm:items-end">
        <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-muted/60 p-3 text-sm sm:w-80">
          {SECTIONS.map((s) => (
            <React.Fragment key={s}>
              <dt className="text-muted-foreground">{SECTION_LABEL[s].total}</dt>
              <dd className="text-right tabular">{formatMoney(totals[s])}</dd>
            </React.Fragment>
          ))}
          <dt className="border-t pt-1.5 font-semibold">{applyTax ? "Total projet HT" : "Total projet"}</dt>
          <dd className="border-t pt-1.5 text-right font-semibold tabular">{formatMoney(totals.subtotal)}</dd>
          {applyTax && (
            <>
              <dt className="text-muted-foreground">TVA 19,25 %</dt>
              <dd className="text-right tabular">{formatMoney(totals.tax)}</dd>
              <dt className="font-semibold">Total TTC</dt>
              <dd className="text-right font-semibold tabular">{formatMoney(totals.total)}</dd>
            </>
          )}
        </dl>
        <p className="text-xs text-muted-foreground italic sm:max-w-md sm:text-right">
          Arrêté la présente facture proforma à la somme de <span className="font-medium text-foreground not-italic">{amountInWords(totals.total)}</span>
        </p>
      </div>
    </div>
  )
}
