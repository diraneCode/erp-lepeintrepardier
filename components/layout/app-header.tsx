"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LuBell, LuCheckCheck, LuMonitor, LuMoon, LuSearch, LuSun } from "react-icons/lu"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { CommandMenu, useCommandMenu } from "@/components/layout/command-menu"
import { useTheme, type Theme } from "@/components/providers/theme-provider"
import { useTransientState } from "@/hooks/use-transient-state"
import { formatDateTime } from "@/lib/format"
import { findNavItem, moduleForPath } from "@/lib/nav"
import { useAccess } from "@/hooks/use-access"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Changer de thème">
          {resolvedTheme === "dark" ? <LuMoon /> : <LuSun />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <DropdownMenuRadioItem value="light">
            <LuSun /> Clair
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <LuMoon /> Sombre
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <LuMonitor /> Système
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const toneDot = { info: "bg-info", success: "bg-success", warning: "bg-warning", danger: "bg-destructive" }

function Notifications() {
  const all = useStore((s) => s.notifications)
  const { can } = useAccess()
  const notifications = all.filter((n) => {
    const m = moduleForPath(n.href)
    return !m || can(m)
  })
  const markRead = useStore((s) => s.markNotificationsRead)
  const [open, setOpen] = useTransientState(false)
  const unread = notifications.filter((n) => !n.read).length
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <LuBell />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-white">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          <Button variant="ghost" size="xs" onClick={() => markRead(notifications.map((n) => n.id))} disabled={!unread}>
            <LuCheckCheck /> Tout marquer comme lu
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune notification.</p>}
          {notifications.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              onClick={() => {
                markRead([n.id])
                setOpen(false)
              }}
              className={cn("flex gap-3 border-b px-4 py-3 last:border-0 hover:bg-muted/60", !n.read && "bg-primary/[0.03]")}
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : toneDot[n.tone])} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{n.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{n.module}</span>
                </div>
                <p className="text-xs text-muted-foreground">{n.description}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(n.date)}</p>
              </div>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function AppHeader() {
  const pathname = usePathname()
  const item = findNavItem(pathname)
  const [open, setOpen] = useCommandMenu()

  return (
    <header data-print="hide" className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 h-4" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {item && "group" in item && (
            <>
              <BreadcrumbItem className="hidden md:inline-flex">{item.group}</BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
            </>
          )}
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{item?.title ?? "Le Peintre Pardier"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="outline" className="hidden w-64 justify-start text-muted-foreground md:inline-flex" onClick={() => setOpen(true)}>
          <LuSearch />
          <span>Rechercher…</span>
          <Kbd className="ml-auto">⌘K</Kbd>
        </Button>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Rechercher">
          <LuSearch />
        </Button>
        <ThemeToggle />
        <Notifications />
      </div>
      <CommandMenu open={open} onOpenChange={setOpen} />
    </header>
  )
}
