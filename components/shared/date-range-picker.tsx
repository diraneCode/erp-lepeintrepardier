"use client"

import * as React from "react"
import { fr } from "date-fns/locale"
import { LuCalendarRange, LuChevronDown, LuX } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { useIsMobile } from "@/hooks/use-mobile"
import { useTransientState } from "@/hooks/use-transient-state"
import { DATE_PRESETS, type DateRange } from "@/lib/date-range"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"

export function DateRangePicker({
  value,
  preset,
  onChange,
  placeholder = "Toutes les dates",
  className,
  align = "start",
}: {
  value?: DateRange
  preset?: string
  onChange: (range: DateRange | undefined, preset?: string) => void
  placeholder?: string
  className?: string
  align?: "start" | "end"
}) {
  const [open, setOpen] = useTransientState(false)
  const isMobile = useIsMobile()
  const presetLabel = DATE_PRESETS.find((p) => p.id === preset)?.label
  const label = presetLabel
    ? presetLabel
    : value?.from
      ? value.to
        ? `${formatDate(value.from)} – ${formatDate(value.to)}`
        : `Depuis le ${formatDate(value.from)}`
      : placeholder
  const active = Boolean(value?.from || value?.to)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative inline-flex", className)}>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("w-full justify-start font-normal", active && "border-primary/40 bg-primary/5 pr-8")}>
            <LuCalendarRange className="text-muted-foreground" />
            <span className="truncate">{label}</span>
            {!active && <LuChevronDown className="ml-auto text-muted-foreground" />}
          </Button>
        </PopoverTrigger>
        {active && (
          <button
            type="button"
            aria-label="Effacer la période"
            onClick={() => onChange(undefined)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LuX className="size-3.5" />
          </button>
        )}
      </div>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="flex flex-col sm:flex-row">
          <div className="flex gap-1 overflow-x-auto p-2 sm:w-44 sm:flex-col sm:overflow-visible">
            {DATE_PRESETS.map((p) => (
              <Button
                key={p.id}
                variant={preset === p.id ? "secondary" : "ghost"}
                size="sm"
                className="shrink-0 justify-start"
                onClick={() => {
                  onChange(p.range(), p.id)
                  setOpen(false)
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Separator orientation="vertical" className="hidden h-auto sm:block" />
          <Separator className="sm:hidden" />
          <div className="flex flex-col">
            <Calendar
              mode="range"
              locale={fr}
              numberOfMonths={isMobile ? 1 : 2}
              defaultMonth={value?.from}
              selected={value?.from ? { from: value.from, to: value.to } : undefined}
              onSelect={(r) => onChange(r?.from ? { from: r.from, to: r.to } : undefined)}
              captionLayout="dropdown"
              className="p-3"
            />
            <div className="flex items-center justify-between gap-2 border-t p-2">
              <span className="text-xs text-muted-foreground">
                {value?.from ? `${formatDate(value.from)} → ${value.to ? formatDate(value.to) : "…"}` : "Sélectionnez une date de début"}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
                  Effacer
                </Button>
                <Button size="sm" onClick={() => setOpen(false)}>
                  Appliquer
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
