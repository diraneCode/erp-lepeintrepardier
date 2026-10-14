import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { StoreGate } from "@/components/providers/store-gate"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppHeader />
        <main className="min-w-0 flex-1">
          <StoreGate>{children}</StoreGate>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
