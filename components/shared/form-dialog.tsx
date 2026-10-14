"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

const sizes = {
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitLabel = "Enregistrer",
  pending,
  size = "md",
  children,
  footerStart,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  submitLabel?: string
  pending?: boolean
  size?: keyof typeof sizes
  children: React.ReactNode
  footerStart?: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0", sizes[size])}>
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          <DialogFooter className="m-0 shrink-0 items-center rounded-b-xl border-t px-5 py-3 sm:justify-between">
            <div className="hidden text-xs text-muted-foreground sm:block">
              {footerStart ?? (
                <>
                  Les champs marqués <span className="text-destructive">*</span> sont obligatoires.
                </>
              )}
            </div>
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner />}
                {submitLabel}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Grille responsive pour les champs de formulaire. */
export function FormGrid({ children, cols = 2, className }: { children: React.ReactNode; cols?: 1 | 2 | 3; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3", className)}>{children}</div>
  )
}

export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </div>
  )
}
