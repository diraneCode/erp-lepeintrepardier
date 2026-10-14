"use client"

import { useMemo } from "react"

import { useStore } from "@/lib/store"

/** Tables de correspondance id → entité pour l'affichage des relations. */
export function useLookups() {
  const clients = useStore((s) => s.clients)
  const employees = useStore((s) => s.employees)
  const products = useStore((s) => s.products)
  const categories = useStore((s) => s.categories)
  const shops = useStore((s) => s.shops)
  const warehouses = useStore((s) => s.warehouses)

  return useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]))
    const employeeById = new Map(employees.map((e) => [e.id, e]))
    const productById = new Map(products.map((p) => [p.id, p]))
    const categoryById = new Map(categories.map((c) => [c.id, c]))
    const shopById = new Map(shops.map((s) => [s.id, s]))
    const warehouseById = new Map(warehouses.map((w) => [w.id, w]))
    const locations = [
      ...warehouses.map((w) => ({ id: w.id, name: w.name, kind: "entrepot" as const, city: w.city })),
      ...shops.map((s) => ({ id: s.id, name: s.name, kind: "boutique" as const, city: s.city })),
    ]
    const locationById = new Map(locations.map((l) => [l.id, l]))
    return {
      clientById,
      employeeById,
      productById,
      categoryById,
      shopById,
      warehouseById,
      locations,
      locationById,
      clientName: (id?: string | null) => (id ? clientById.get(id)?.name ?? "Client supprimé" : "Client comptoir"),
      employeeName: (id?: string) => {
        const e = id ? employeeById.get(id) : undefined
        return e ? `${e.firstName} ${e.lastName}` : "—"
      },
      productName: (id: string) => productById.get(id)?.name ?? "Produit supprimé",
      categoryName: (id?: string | null) => (id ? categoryById.get(id)?.name ?? "—" : "Toutes catégories"),
      shopName: (id: string) => shopById.get(id)?.name ?? "—",
      locationName: (id?: string) => (id ? locationById.get(id)?.name ?? "—" : "—"),
      clientOptions: clients.map((c) => ({ value: c.id, label: c.name, hint: c.code })),
      employeeOptions: employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}`, hint: e.position })),
      productOptions: products.filter((p) => p.status === "actif").map((p) => ({ value: p.id, label: p.name, hint: p.sku })),
      shopOptions: shops.map((s) => ({ value: s.id, label: s.name })),
      warehouseOptions: warehouses.map((w) => ({ value: w.id, label: w.name })),
      locationOptions: locations.map((l) => ({ value: l.id, label: l.name, hint: l.kind === "entrepot" ? "Entrepôt" : "Boutique" })),
      categoryOptions: categories.map((c) => ({ value: c.id, label: c.name })),
    }
  }, [clients, employees, products, categories, shops, warehouses])
}
