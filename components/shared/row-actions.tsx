"use client"

import * as React from "react"
import { LuEllipsis } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface RowAction {
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onSelect: () => void
  destructive?: boolean
  hidden?: boolean
  separatorBefore?: boolean
}

export function RowActions({ actions }: { actions: RowAction[] }) {
  const visible = actions.filter((a) => !a.hidden)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Actions">
          <LuEllipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {visible.map((a) => (
          <React.Fragment key={a.label}>
            {a.separatorBefore && <DropdownMenuSeparator />}
            <DropdownMenuItem variant={a.destructive ? "destructive" : "default"} onSelect={a.onSelect}>
              {a.icon && <a.icon />}
              {a.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
