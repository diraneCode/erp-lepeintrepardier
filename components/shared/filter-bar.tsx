"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { LuCirclePlus, LuSearch, LuSlidersHorizontal, LuX, LuCheck } from "react-icons/lu"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { DateRangePicker } from "@/components/shared/date-range-picker"
import { useTransientState } from "@/hooks/use-transient-state"
import type { FacetDef, FiltersApi, RangeDef } from "@/hooks/use-filters"
import { describeRange } from "@/lib/date-range"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

export function FilterBar<T>({ filters, children, className }: { filters: FiltersApi<T>; children?: React.ReactNode; className?: string }) {
  const { state, config, setSearch, setDate, setFacet, setRange, reset, facetCounts, activeCount } = filters

  const chips: { key: string; label: string; onRemove: () => void }[] = []
  if (state.date?.from || state.date?.to) chips.push({ key: "date", label: describeRange(state.date), onRemove: () => setDate(undefined) })
  for (const f of config.facets ?? []) {
    for (const v of state.facets[f.id] ?? []) {
      chips.push({
        key: `${f.id}:${v}`,
        label: `${f.label} : ${f.options.find((o) => o.value === v)?.label ?? v}`,
        onRemove: () => setFacet(f.id, (state.facets[f.id] ?? []).filter((x) => x !== v)),
      })
    }
  }
  for (const r of config.ranges ?? []) {
    const range = state.ranges[r.id]
    if (range && (range.min !== undefined || range.max !== undefined)) {
      chips.push({
        key: `range:${r.id}`,
        label: `${r.label} : ${range.min !== undefined ? formatNumber(range.min) : "…"} – ${range.max !== undefined ? formatNumber(range.max) : "…"}`,
        onRemove: () => setRange(r.id, {}),
      })
    }
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        {config.search && (
          <div className="relative w-full lg:max-w-xs">
            <LuSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={state.search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={config.search.placeholder}
              className="pr-8 pl-8"
              aria-label="Rechercher"
            />
            {state.search && (
              <button
                type="button"
                aria-label="Effacer la recherche"
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
              >
                <LuX className="size-3.5" />
              </button>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {config.date && (
            <DateRangePicker
              value={state.date}
              preset={state.datePreset}
              onChange={setDate}
              placeholder={config.date.label}
              className="min-w-[180px]"
            />
          )}
          {config.facets?.map((f) => (
            <FacetFilter
              key={f.id}
              facet={f}
              selected={state.facets[f.id] ?? []}
              counts={facetCounts[f.id] ?? {}}
              onChange={(v) => setFacet(f.id, v)}
            />
          ))}
          {!!config.ranges?.length && <RangeFilter ranges={config.ranges} values={state.ranges} onChange={setRange} />}
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground">
              <LuX /> Réinitialiser
            </Button>
          )}
        </div>
        {children && <div className="flex items-center gap-2 lg:ml-auto">{children}</div>}
      </div>
      <AnimatePresence initial={false}>
        {chips.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap items-center gap-1.5 overflow-hidden"
          >
            <AnimatePresence initial={false}>
              {chips.map((c) => (
                <motion.span
                  key={c.key}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="inline-flex h-6 items-center gap-1 rounded-md border bg-muted/60 pr-1 pl-2 text-xs"
                >
                  {c.label}
                  <button type="button" onClick={c.onRemove} className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground" aria-label={`Retirer ${c.label}`}>
                    <LuX className="size-3" />
                  </button>
                </motion.span>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function FacetFilter<T>({
  facet,
  selected,
  counts,
  onChange,
}: {
  facet: FacetDef<T>
  selected: string[]
  counts: Record<string, number>
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useTransientState(false)
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("border-dashed font-normal", selected.length && "border-solid border-primary/40 bg-primary/5")}>
          <LuCirclePlus className="text-muted-foreground" />
          {facet.label}
          {selected.length > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1 h-4" />
              {selected.length > 2 ? (
                <Badge variant="violet" className="rounded-sm px-1">
                  {selected.length} sélectionnés
                </Badge>
              ) : (
                selected.map((v) => (
                  <Badge key={v} variant="violet" className="max-w-28 truncate rounded-sm px-1">
                    {facet.options.find((o) => o.value === v)?.label ?? v}
                  </Badge>
                ))
              )}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          {facet.options.length > 6 && <CommandInput placeholder={facet.label} />}
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandGroup>
              {facet.options.map((o) => {
                const isSelected = selected.includes(o.value)
                return (
                  <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => toggle(o.value)}>
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[4px] border",
                        isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input"
                      )}
                    >
                      {isSelected && <LuCheck className="size-3" />}
                    </div>
                    <span className="truncate">{o.label}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground tabular">{counts[o.value] ?? 0}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selected.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])} className="justify-center text-center">
                    Effacer la sélection
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function RangeFilter<T>({
  ranges,
  values,
  onChange,
}: {
  ranges: RangeDef<T>[]
  values: Record<string, { min?: number; max?: number }>
  onChange: (id: string, range: { min?: number; max?: number }) => void
}) {
  const [open, setOpen] = useTransientState(false)
  const active = ranges.filter((r) => values[r.id]?.min !== undefined || values[r.id]?.max !== undefined).length
  const parse = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(/\s/g, "").replace(",", ".")))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("border-dashed font-normal", active && "border-solid border-primary/40 bg-primary/5")}>
          <LuSlidersHorizontal className="text-muted-foreground" />
          {ranges.length === 1 ? ranges[0].label : "Intervalles"}
          {active > 0 && (
            <Badge variant="violet" className="rounded-sm px-1">
              {active}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="flex flex-col gap-4">
          {ranges.map((r) => (
            <div key={r.id} className="flex flex-col gap-2">
              <Label className="text-xs text-muted-foreground">
                {r.label}
                {r.unit ? ` (${r.unit})` : ""}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="numeric"
                  placeholder="Min"
                  defaultValue={values[r.id]?.min ?? ""}
                  onBlur={(e) => onChange(r.id, { ...values[r.id], min: parse(e.target.value) })}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  inputMode="numeric"
                  placeholder="Max"
                  defaultValue={values[r.id]?.max ?? ""}
                  onBlur={(e) => onChange(r.id, { ...values[r.id], max: parse(e.target.value) })}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => ranges.forEach((r) => onChange(r.id, {}))}>
              Effacer
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              Fermer
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
