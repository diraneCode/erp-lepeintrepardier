"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { ComboboxField, DateField, NumberField, SelectField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid } from "@/components/shared/form-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { cityOptions } from "@/lib/labels"
import { toISODate } from "@/lib/format"
import { nextCode, uid, useStore } from "@/lib/store"
import type { Shop, Warehouse } from "@/lib/types"

const phone = z.string().trim().regex(/^\+?[0-9\s]{8,}$/, "Numéro de téléphone invalide")

const warehouseSchema = z.object({
  name: z.string().trim().min(3, "Nom requis"),
  type: z.enum(["entrepot", "depot"]),
  city: z.string().min(1, "Ville requise"),
  address: z.string().trim().min(3, "Adresse requise"),
  managerId: z.string().min(1, "Responsable requis"),
  phone,
  capacity: z.number({ error: "Surface requise" }).positive("Doit être positive"),
  status: z.enum(["actif", "inactif", "maintenance"]),
})
type WarehouseValues = z.infer<typeof warehouseSchema>

export function WarehouseFormDialog({ open, onOpenChange, warehouse }: { open: boolean; onOpenChange: (o: boolean) => void; warehouse?: Warehouse }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const { employeeOptions } = useLookups()
  const form = useForm<WarehouseValues>({ resolver: zodResolver(warehouseSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        name: warehouse?.name ?? "",
        type: warehouse?.type ?? "entrepot",
        city: warehouse?.city ?? "Douala",
        address: warehouse?.address ?? "",
        managerId: warehouse?.managerId ?? "",
        phone: warehouse?.phone ?? "+237 ",
        capacity: warehouse?.capacity ?? 500,
        status: warehouse?.status ?? "actif",
      })
  }, [open, warehouse, form])

  const onSubmit = form.handleSubmit((v) => {
    if (warehouse) update("warehouses", warehouse.id, v)
    else {
      const id = uid("w")
      add("warehouses", { ...v, id, code: nextCode(v.type === "entrepot" ? "ENT" : "DEP", useStore.getState().warehouses.map((w) => w.code), 3), createdAt: toISODate(new Date()) })
      // Initialise les niveaux de stock à zéro pour le nouveau site
      useStore.setState((s) => ({ stockLevels: [...s.stockLevels, ...s.products.map((p) => ({ id: uid("sl"), productId: p.id, locationId: id, quantity: 0 }))] }))
    }
    toast.success(warehouse ? "Magasin mis à jour" : "Magasin créé", { description: v.name })
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={warehouse ? "Modifier le magasin" : "Nouveau magasin"} onSubmit={onSubmit} size="lg">
      <FormGrid>
        <TextField control={form.control} name="name" label="Nom" required className="sm:col-span-2" />
        <SelectField control={form.control} name="type" label="Type" required options={[{ value: "entrepot", label: "Entrepôt" }, { value: "depot", label: "Dépôt" }]} />
        <SelectField control={form.control} name="status" label="Statut" required options={[{ value: "actif", label: "Actif" }, { value: "maintenance", label: "En maintenance" }, { value: "inactif", label: "Inactif" }]} />
        <SelectField control={form.control} name="city" label="Ville" required options={cityOptions} />
        <TextField control={form.control} name="address" label="Adresse" required />
        <ComboboxField control={form.control} name="managerId" label="Responsable" required options={employeeOptions} />
        <TextField control={form.control} name="phone" label="Téléphone" required type="tel" />
        <NumberField control={form.control} name="capacity" label="Surface de stockage" required suffix="m²" min={0} />
      </FormGrid>
    </FormDialog>
  )
}

const shopSchema = z.object({
  name: z.string().trim().min(3, "Nom requis"),
  city: z.string().min(1, "Ville requise"),
  address: z.string().trim().min(3, "Adresse requise"),
  managerId: z.string().min(1, "Responsable requis"),
  phone,
  openingHours: z.string().trim().min(3, "Horaires requis"),
  monthlyTarget: z.number({ error: "Objectif requis" }).positive("Doit être positif"),
  supplyWarehouseId: z.string().min(1, "Entrepôt d'approvisionnement requis"),
  status: z.enum(["ouverte", "fermee", "travaux"]),
  openedAt: z.string().min(1, "Date requise"),
})
type ShopValues = z.infer<typeof shopSchema>

export function ShopFormDialog({ open, onOpenChange, shop }: { open: boolean; onOpenChange: (o: boolean) => void; shop?: Shop }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const { employeeOptions, warehouseOptions } = useLookups()
  const form = useForm<ShopValues>({ resolver: zodResolver(shopSchema) })
  React.useEffect(() => {
    if (open)
      form.reset({
        name: shop?.name ?? "",
        city: shop?.city ?? "Douala",
        address: shop?.address ?? "",
        managerId: shop?.managerId ?? "",
        phone: shop?.phone ?? "+237 ",
        openingHours: shop?.openingHours ?? "Lun–Sam · 8h–19h",
        monthlyTarget: shop?.monthlyTarget ?? 10_000_000,
        supplyWarehouseId: shop?.supplyWarehouseId ?? "",
        status: shop?.status ?? "ouverte",
        openedAt: shop?.openedAt ?? toISODate(new Date()),
      })
  }, [open, shop, form])

  const onSubmit = form.handleSubmit((v) => {
    if (shop) update("shops", shop.id, v)
    else {
      const id = uid("s")
      add("shops", { ...v, id, code: nextCode("BTQ", useStore.getState().shops.map((s) => s.code), 3) })
      useStore.setState((s) => ({ stockLevels: [...s.stockLevels, ...s.products.map((p) => ({ id: uid("sl"), productId: p.id, locationId: id, quantity: 0 }))] }))
    }
    toast.success(shop ? "Boutique mise à jour" : "Boutique créée", { description: v.name })
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={shop ? "Modifier la boutique" : "Nouvelle boutique"} onSubmit={onSubmit} size="lg">
      <FormGrid>
        <TextField control={form.control} name="name" label="Nom" required className="sm:col-span-2" />
        <SelectField control={form.control} name="city" label="Ville" required options={cityOptions} />
        <TextField control={form.control} name="address" label="Adresse" required />
        <ComboboxField control={form.control} name="managerId" label="Responsable" required options={employeeOptions} />
        <TextField control={form.control} name="phone" label="Téléphone" required type="tel" />
        <TextField control={form.control} name="openingHours" label="Horaires" required />
        <NumberField control={form.control} name="monthlyTarget" label="Objectif mensuel par défaut" required suffix="FCFA" min={0} step={500000} description="Utilisé pour les mois sans objectif spécifique" />
        <SelectField control={form.control} name="supplyWarehouseId" label="Approvisionnée par" required options={warehouseOptions} />
        <SelectField control={form.control} name="status" label="Statut" required options={[{ value: "ouverte", label: "Ouverte" }, { value: "travaux", label: "En travaux" }, { value: "fermee", label: "Fermée" }]} />
        <DateField control={form.control} name="openedAt" label="Date d'ouverture" required />
      </FormGrid>
    </FormDialog>
  )
}
