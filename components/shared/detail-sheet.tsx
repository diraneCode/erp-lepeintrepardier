"use client"

import * as React from "react"

import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  badge,
  children,
  footer,
  wide,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  badge?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn("flex w-full flex-col gap-0 p-0", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <SheetHeader className="border-b px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <SheetTitle className="text-lg">{title}</SheetTitle>
            {badge}
          </div>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t px-5 py-3">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}

export function DescriptionList({ items, cols = 2 }: { items: { label: string; value: React.ReactNode; full?: boolean }[]; cols?: 1 | 2 }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4", cols === 2 && "sm:grid-cols-2")}>
      {items.map((it) => (
        <div key={it.label} className={cn("flex min-w-0 flex-col gap-0.5", it.full && "sm:col-span-2")}>
          <dt className="text-xs text-muted-foreground">{it.label}</dt>
          <dd className="text-sm font-medium break-words">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  )
}

export function DetailSection({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b py-5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  )
}
