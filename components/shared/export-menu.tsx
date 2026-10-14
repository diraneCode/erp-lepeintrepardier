"use client"

import * as React from "react"
import { toast } from "sonner"
import { LuDownload, LuFileSpreadsheet, LuFileText, LuSheet } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { exportData, type ExportFormat, type ExportOptions } from "@/lib/export"
import { useStore } from "@/lib/store"

export function ExportMenu<T>({
  getOptions,
  disabled,
  label = "Exporter",
  size = "default",
}: {
  /** Construit les options d'export au moment du clic (données filtrées à jour). */
  getOptions: () => ExportOptions<T>
  disabled?: boolean
  label?: string
  size?: "default" | "sm"
}) {
  const [pending, setPending] = React.useState<ExportFormat | null>(null)
  const log = useStore((s) => s.log)

  const run = async (fmt: ExportFormat) => {
    const options = getOptions()
    setPending(fmt)
    try {
      await exportData(fmt, options)
      toast.success("Export terminé", { description: `${options.rows.length} ligne(s) exportée(s) au format ${fmt.toUpperCase()}.` })
      log("Export", options.title, `${options.rows.length} ligne(s) — ${fmt.toUpperCase()}`)
    } catch (e) {
      console.error(e)
      toast.error("Échec de l'export", { description: "Une erreur est survenue lors de la génération du fichier." })
    } finally {
      setPending(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={disabled || pending !== null}>
          {pending ? <Spinner /> : <LuDownload />}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Format d&apos;export</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => run("pdf")}>
          <LuFileText className="text-destructive" /> PDF
          <span className="ml-auto text-xs text-muted-foreground">.pdf</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("excel")}>
          <LuFileSpreadsheet className="text-success" /> Excel
          <span className="ml-auto text-xs text-muted-foreground">.xlsx</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => run("csv")}>
          <LuSheet className="text-info" /> CSV
          <span className="ml-auto text-xs text-muted-foreground">.csv</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
