"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { LuMoon, LuPlus, LuSun } from "react-icons/lu"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useTheme } from "@/components/providers/theme-provider"
import { useTransientState } from "@/hooks/use-transient-state"
import { visibleNav } from "@/lib/nav"
import { useAccess, useScopedData } from "@/hooks/use-access"
import { useCollection } from "@/lib/store"

export function useCommandMenu() {
  const [open, setOpen] = useTransientState(false)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [setOpen])
  return [open, setOpen] as const
}

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const { setTheme } = useTheme()
  const { can, access } = useAccess()
  // Les données de recherche ne sont chargées qu'à l'ouverture de la palette
  const scoped = useScopedData(open ? ["clients", "invoices"] : [])
  const products = useCollection("products", open)
  const clients = can("clients") ? scoped.clients : []
  const invoices = can("facturation") ? scoped.invoices : []
  const nav = visibleNav(can)
  const quick = [
    { href: "/ventes?nouveau=1", label: "Nouvelle vente", module: "ventes" as const },
    { href: "/facturation?nouveau=1", label: "Nouvelle facture", module: "facturation" as const },
    { href: "/commercial/clients?nouveau=1", label: "Nouveau client", module: "clients" as const },
    { href: "/depenses?nouveau=1", label: "Nouvelle dépense", module: "depenses" as const },
    { href: "/commercial/prospects?nouveau=1", label: "Nouveau prospect", module: "prospects" as const },
    { href: "/commercial/relances?nouveau=1", label: "Programmer une relance", module: "relances" as const },
    { href: "/marketing/rendez-vous?nouveau=1", label: "Prendre un rendez-vous", module: "rendez_vous" as const },
    { href: "/marketing/evenements?nouveau=1", label: "Organiser une formation", module: "evenements" as const },
    { href: "/moi/conges?nouveau=1", label: "Demander un congé", module: undefined },
  ].filter((q) => !q.module || (access(q.module)?.write ?? false))

  const go = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Recherche globale" description="Rechercher un module, un client, un produit ou une facture">
      {/* Le contexte de recherche (cmdk) est fourni par Command, pas par la fenêtre */}
      <Command>
      <CommandInput placeholder="Rechercher un module, un client, un produit, une facture…" />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>
        <CommandGroup heading="Actions rapides">
          {quick.map((q) => (
            <CommandItem key={q.href} onSelect={() => go(q.href)}>
              <LuPlus /> {q.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        {nav.map((g) => (
          <CommandGroup key={g.label} heading={g.label}>
            {g.items.map((i) => (
              <CommandItem key={i.href} value={`${i.title} ${i.keywords ?? ""} ${i.description}`} onSelect={() => go(i.href)}>
                <i.icon />
                {i.title}
                <span className="ml-2 truncate text-xs text-muted-foreground">{i.description}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Clients">
          {clients.slice(0, 80).map((c) => (
            <CommandItem key={c.id} value={`client ${c.name} ${c.code} ${c.city}`} onSelect={() => go(`/commercial/clients?q=${encodeURIComponent(c.name)}`)}>
              {c.name}
              <CommandShortcut>{c.code}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        {can("produits") && <CommandGroup heading="Produits">
          {products.map((p) => (
            <CommandItem key={p.id} value={`produit ${p.name} ${p.sku}`} onSelect={() => go(`/produits?q=${encodeURIComponent(p.sku)}`)}>
              {p.name}
              <CommandShortcut>{p.sku}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>}
        <CommandGroup heading="Factures">
          {invoices.slice(0, 60).map((f) => (
            <CommandItem key={f.id} value={`facture ${f.number}`} onSelect={() => go(`/facturation?q=${encodeURIComponent(f.number)}`)}>
              {f.number}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Thème">
          <CommandItem onSelect={() => { setTheme("light"); onOpenChange(false) }}>
            <LuSun /> Thème clair
          </CommandItem>
          <CommandItem onSelect={() => { setTheme("dark"); onOpenChange(false) }}>
            <LuMoon /> Thème sombre
          </CommandItem>
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
