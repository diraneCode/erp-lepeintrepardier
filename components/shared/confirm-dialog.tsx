"use client"

import type * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { buttonVariants } from "@/components/ui/button"
import { useSubmitLock } from "@/components/shared/form-dialog"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmer",
  destructive,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  /** Peut renvoyer une promesse : les boutons restent désactivés jusqu'à sa résolution */
  onConfirm: () => unknown
}) {
  const { submitting, handleSubmit } = useSubmitLock(async (e: React.MouseEvent) => {
    // La fermeture intervient après le traitement, pas au clic
    e.preventDefault()
    await onConfirm()
    onOpenChange(false)
  })
  return (
    <AlertDialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            className={cn(destructive && buttonVariants({ variant: "destructive" }), destructive && "bg-destructive text-white hover:bg-destructive/90")}
            disabled={submitting}
            onClick={(e) => void handleSubmit(e)}
          >
            {submitting && <Spinner />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
