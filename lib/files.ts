"use client"

import * as React from "react"
import { createStore, del, get, set } from "idb-keyval"

import type { StoredFile } from "@/lib/types"

/**
 * Les fichiers (photos, CNI, CV…) sont stockés dans IndexedDB : le
 * localStorage, limité à quelques Mo, ne conserve que leurs métadonnées.
 */
const store = typeof indexedDB !== "undefined" ? createStore("pardier-files", "files") : undefined

export async function saveFile(file: File): Promise<StoredFile> {
  const id = `file_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  await set(id, file, store)
  return { id, name: file.name, type: file.type, size: file.size, uploadedAt: new Date().toISOString().slice(0, 10) }
}

export async function getFileBlob(id: string) {
  return (await get<Blob>(id, store)) ?? null
}

export async function deleteFile(id: string) {
  await del(id, store)
}

export async function openFile(meta: StoredFile) {
  const blob = await getFileBlob(meta.id)
  if (!blob) return false
  const url = URL.createObjectURL(blob)
  window.open(url, "_blank", "noopener")
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`
}

/** URL d'objet temporaire pour afficher un fichier stocké (ex. photo). */
export function useFileUrl(id?: string) {
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (!id) return
    let objectUrl: string | null = null
    let cancelled = false
    void getFileBlob(id).then((blob) => {
      if (cancelled || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [id])
  return id ? url : null
}
