"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  LuArrowDown,
  LuArrowUp,
  LuArrowUpDown,
  LuChevronLeft,
  LuChevronRight,
  LuChevronsLeft,
  LuChevronsRight,
  LuColumns3,
  LuInbox,
  LuX,
} from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ExportMenu } from "@/components/shared/export-menu"
import type { ExportColumn, ExportOptions, ExportValue } from "@/lib/export"
import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface Column<T> {
  id: string
  header: string
  /** Valeur brute : sert au tri, à l'export et au rendu par défaut */
  accessor?: (row: T) => string | number | null | undefined
  cell?: (row: T) => React.ReactNode
  sortable?: boolean
  align?: "left" | "right" | "center"
  className?: string
  /** Masquée par défaut (réactivable via le menu Colonnes) */
  defaultHidden?: boolean
  /** Masquée sur mobile */
  hideOnMobile?: boolean
  /** Type pour l'export ; false pour exclure la colonne de l'export */
  exportType?: ExportColumn<T>["type"] | false
  exportValue?: (row: T) => ExportValue
  /** Cellule de pied de tableau calculée sur toutes les lignes filtrées */
  footer?: (rows: T[]) => React.ReactNode
}

export interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  getRowId: (row: T) => string
  onRowClick?: (row: T) => void
  rowActions?: (row: T) => React.ReactNode
  selectable?: boolean
  bulkActions?: (rows: T[], clear: () => void) => React.ReactNode
  pageSize?: number
  defaultSort?: { id: string; desc?: boolean }
  emptyTitle?: string
  emptyDescription?: string
  /** Options d'export (titre, nom de fichier…) ; les colonnes et lignes sont déduites du tableau. */
  exportOptions?: Omit<ExportOptions<T>, "columns" | "rows"> & { extraColumns?: ExportColumn<T>[] }
  toolbarStart?: React.ReactNode
  className?: string
  rowClassName?: (row: T) => string | undefined
}

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" })

export function DataTable<T>({
  data,
  columns,
  getRowId,
  onRowClick,
  rowActions,
  selectable,
  bulkActions,
  pageSize: initialPageSize = 10,
  defaultSort,
  emptyTitle = "Aucun résultat",
  emptyDescription = "Modifiez vos filtres ou ajoutez un nouvel élément.",
  exportOptions,
  toolbarStart,
  className,
  rowClassName,
}: DataTableProps<T>) {
  const [sort, setSort] = React.useState<{ id: string; desc: boolean } | null>(
    defaultSort ? { id: defaultSort.id, desc: defaultSort.desc ?? false } : null
  )
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(initialPageSize)
  const [hidden, setHidden] = React.useState<Set<string>>(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id)))
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const visibleColumns = columns.filter((c) => !hidden.has(c.id))

  const sorted = React.useMemo(() => {
    if (!sort) return data
    const col = columns.find((c) => c.id === sort.id)
    if (!col?.accessor) return data
    const acc = col.accessor
    return [...data].sort((a, b) => {
      const va = acc(a)
      const vb = acc(b)
      let r: number
      if (va == null && vb == null) r = 0
      else if (va == null) r = 1
      else if (vb == null) r = -1
      else if (typeof va === "number" && typeof vb === "number") r = va - vb
      else r = collator.compare(String(va), String(vb))
      return sort.desc ? -r : r
    })
  }, [data, sort, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const rows = sorted.slice(currentPage * pageSize, currentPage * pageSize + pageSize)

  // Seules les lignes encore présentes après filtrage comptent dans la sélection
  const selectedRows = React.useMemo(() => sorted.filter((r) => selected.has(getRowId(r))), [sorted, selected, getRowId])
  const allSelected = selectable && sorted.length > 0 && selectedRows.length === sorted.length
  const someSelected = selectedRows.length > 0 && !allSelected
  const clearSelection = React.useCallback(() => setSelected(new Set()), [])

  const toggleSort = (id: string) => {
    setSort((s) => (s?.id !== id ? { id, desc: false } : !s.desc ? { id, desc: true } : null))
  }

  const hasFooter = columns.some((c) => c.footer)

  const buildExport = (): ExportOptions<T> => {
    const exportCols: ExportColumn<T>[] = visibleColumns
      .filter((c) => c.exportType !== false && (c.exportValue || c.accessor))
      .map((c) => ({
        header: c.header,
        type: (c.exportType || "text") as ExportColumn<T>["type"],
        value: (row: T) => (c.exportValue ? c.exportValue(row) : c.accessor!(row)),
      }))
    const { extraColumns, ...rest } = exportOptions!
    return {
      ...rest,
      columns: [...exportCols, ...(extraColumns ?? [])],
      rows: selectedRows.length ? selectedRows : sorted,
      subtitle: [rest.subtitle, selectedRows.length ? `${selectedRows.length} ligne(s) sélectionnée(s)` : null].filter(Boolean).join(" · "),
    }
  }

  const alignClass = (a?: "left" | "right" | "center") => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left")

  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-h-8 flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {toolbarStart}
          <span>
            <span className="font-medium text-foreground tabular">{formatNumber(data.length)}</span> résultat{data.length > 1 ? "s" : ""}
          </span>
          <AnimatePresence>
            {selectedRows.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {selectedRows.length} sélectionné{selectedRows.length > 1 ? "s" : ""}
                </span>
                {bulkActions?.(selectedRows, clearSelection)}
                <Button variant="ghost" size="sm" onClick={clearSelection}>
                  <LuX /> Désélectionner
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="default" className="hidden sm:inline-flex">
                <LuColumns3 /> Colonnes
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Colonnes affichées</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.id}
                  checked={!hidden.has(c.id)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={(v) =>
                    setHidden((h) => {
                      const next = new Set(h)
                      if (v) next.delete(c.id)
                      else next.add(c.id)
                      return next
                    })
                  }
                >
                  {c.header}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {exportOptions && <ExportMenu getOptions={buildExport} disabled={!data.length} />}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              {selectable && (
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    aria-label="Tout sélectionner"
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(v) => setSelected(v ? new Set(sorted.map(getRowId)) : new Set())}
                  />
                </TableHead>
              )}
              {visibleColumns.map((c) => {
                const sortable = c.sortable ?? Boolean(c.accessor)
                const active = sort?.id === c.id
                return (
                  <TableHead
                    key={c.id}
                    className={cn(
                      "h-10 text-xs font-medium tracking-wide text-muted-foreground uppercase",
                      alignClass(c.align),
                      c.hideOnMobile && "hidden md:table-cell",
                      c.className
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className={cn(
                          "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase hover:bg-muted hover:text-foreground",
                          active && "text-foreground",
                          c.align === "right" && "flex-row-reverse"
                        )}
                      >
                        {c.header}
                        {active ? (
                          sort.desc ? (
                            <LuArrowDown className="size-3.5" />
                          ) : (
                            <LuArrowUp className="size-3.5" />
                          )
                        ) : (
                          <LuArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </TableHead>
                )
              })}
              {rowActions && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}>
                  <Empty className="py-10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <LuInbox />
                      </EmptyMedia>
                      <EmptyTitle>{emptyTitle}</EmptyTitle>
                      <EmptyDescription>{emptyDescription}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const id = getRowId(row)
                const isSelected = selected.has(id)
                return (
                  <TableRow
                    key={id}
                    data-state={isSelected ? "selected" : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(onRowClick && "cursor-pointer", rowClassName?.(row))}
                  >
                    {selectable && (
                      <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label="Sélectionner la ligne"
                          checked={isSelected}
                          onCheckedChange={(v) =>
                            setSelected((s) => {
                              const next = new Set(s)
                              if (v) next.add(id)
                              else next.delete(id)
                              return next
                            })
                          }
                        />
                      </TableCell>
                    )}
                    {visibleColumns.map((c) => (
                      <TableCell
                        key={c.id}
                        className={cn("py-2.5", alignClass(c.align), c.align === "right" && "tabular", c.hideOnMobile && "hidden md:table-cell", c.className)}
                      >
                        {c.cell ? c.cell(row) : (c.accessor?.(row) ?? "—")}
                      </TableCell>
                    ))}
                    {rowActions && (
                      <TableCell className="pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {rowActions(row)}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })
            )}
          </TableBody>
          {hasFooter && sorted.length > 0 && (
            <TableFooter className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                {selectable && <TableCell />}
                {visibleColumns.map((c, i) => (
                  <TableCell
                    key={c.id}
                    className={cn("py-2.5 font-semibold tabular", alignClass(c.align), c.hideOnMobile && "hidden md:table-cell")}
                  >
                    {c.footer ? c.footer(sorted) : i === 0 ? "Total" : null}
                  </TableCell>
                ))}
                {rowActions && <TableCell />}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      <div className="flex flex-col-reverse items-center justify-between gap-3 text-sm sm:flex-row">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="hidden sm:inline">Lignes par page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v))
              setPage(0)
            }}
          >
            <SelectTrigger size="sm" className="w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground tabular">
            {sorted.length ? `${currentPage * pageSize + 1}–${Math.min(sorted.length, (currentPage + 1) * pageSize)} sur ${formatNumber(sorted.length)}` : "0 sur 0"}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => setPage(0)} disabled={currentPage === 0} aria-label="Première page">
              <LuChevronsLeft />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0} aria-label="Page précédente">
              <LuChevronLeft />
            </Button>
            <span className="px-2 text-muted-foreground tabular">
              {currentPage + 1} / {pageCount}
            </span>
            <Button variant="outline" size="icon-sm" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount - 1} aria-label="Page suivante">
              <LuChevronRight />
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => setPage(pageCount - 1)} disabled={currentPage >= pageCount - 1} aria-label="Dernière page">
              <LuChevronsRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
