"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
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
import { useAccess } from "@/hooks/use-access"
import { useNavCounters, useStore } from "@/lib/store"

/** Compteurs des menus (demandes en attente, retards…), calculés par la base. */
function useNavBadges(): Record<string, number> {
  const c = useNavCounters()
  return {
    "/rh/conges": c?.leaves ?? 0,
    "/facturation": c?.invoices ?? 0,
    "/stock": c?.stock ?? 0,
    "/depenses": c?.expenses ?? 0,
    "/commercial/relances": c?.followups ?? 0,
  }
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
                  <UserAvatar name={fullName} className="size-8 rounded-lg" photoId={user?.documents?.photo?.id} />
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
                  onSelect={async () => {
                    await logout()
                    router.replace("/login")
                    router.refresh()
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
