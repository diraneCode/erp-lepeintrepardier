"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useMemo } from "react"
import { LuChevronsUpDown, LuLogOut, LuUserCog } from "react-icons/lu"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Logo, LogoMark } from "@/components/layout/logo"
import { UserAvatar } from "@/components/shared/user-avatar"
import { findNavItem, visibleNav } from "@/lib/nav"
import { useAccess, useScopedData } from "@/hooks/use-access"
import { useStore } from "@/lib/store"
import { invoiceStatus } from "@/lib/calc"

function useNavBadges() {
  const leaves = useStore((s) => s.leaves)
  const { invoices, stockLevels: levels, expenses, followups } = useScopedData()
  const products = useStore((s) => s.products)
  return useMemo(() => {
    const min = new Map(products.map((p) => [p.id, p.minStock]))
    return {
      "/rh/conges": leaves.filter((l) => l.status === "en_attente").length,
      "/facturation": invoices.filter((i) => invoiceStatus(i) === "en_retard").length,
      "/stock": levels.filter((l) => l.quantity <= (min.get(l.productId) ?? 0)).length,
      "/depenses": expenses.filter((e) => e.status === "en_attente").length,
      "/commercial/relances": followups.filter((f) => (f.status === "a_faire" || f.status === "reporte") && f.dueDate <= new Date().toISOString().slice(0, 10)).length,
    } as Record<string, number>
  }, [leaves, invoices, levels, products, expenses, followups])
}

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { setOpenMobile, isMobile } = useSidebar()
  const { user, roleLabel, can } = useAccess()
  const logout = useStore((s) => s.logout)
  const badges = useNavBadges()
  const nav = visibleNav(can)
  const fullName = user ? `${user.firstName} ${user.lastName}` : "Utilisateur"

  // Seul l'élément le plus spécifique correspondant à l'URL est actif
  const activeHref = findNavItem(pathname)?.href
  const isActive = (href: string) => href === activeHref

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="h-14 justify-center border-b">
        <Link href="/" className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" onClick={() => isMobile && setOpenMobile(false)}>
          <Logo className="h-9 group-data-[collapsible=icon]:hidden" />
          <LogoMark className="hidden group-data-[collapsible=icon]:block" />
        </Link>
      </SidebarHeader>
      <SidebarContent className="scrollbar-thin">
        {nav.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const badge = badges[item.href]
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                      <Link href={item.href} onClick={() => isMobile && setOpenMobile(false)}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {badge > 0 && <SidebarMenuBadge className="rounded-full bg-primary/10 text-primary tabular">{badge}</SidebarMenuBadge>}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <UserAvatar name={fullName} className="size-8 rounded-lg" />
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{fullName}</span>
                    <span className="truncate text-xs text-muted-foreground">{roleLabel}</span>
                  </div>
                  <LuChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-medium">{fullName}</div>
                  <div className="text-xs text-muted-foreground">{user?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push("/compte")}>
                  <LuUserCog /> Mon compte
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    logout()
                    router.replace("/login")
                  }}
                >
                  <LuLogOut /> Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
