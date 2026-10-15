"use client"

import { useQuery } from "@tanstack/react-query"

import { getSupabase } from "@/lib/supabase/client"
import type { StoredFile } from "@/lib/types"

/**
 * Pièces des employés (photo, CNI, CV…) : bucket privé Supabase Storage
 * « employee-files ». L'identifiant d'un fichier est son chemin dans le bucket
 * (employees/<id employé>/<type>-<horodatage>.<ext>) ; il est servi par URL
 * signée de courte durée, après contrôle des droits par la base.
 */
export const FILES_BUCKET = "employee-files"
const SIGNED_URL_TTL = 60 * 60

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }

/** Poids maximal stocké (identique à la limite du bucket, 04_storage.sql). */
export const MAX_STORED_SIZE = 5 * 1024 * 1024
/** Une image peut être plus lourde au départ : elle est compressée avant l'envoi. */
export const MAX_IMAGE_INPUT_SIZE = 20 * 1024 * 1024

/** Dimension maximale (plus grand côté) après compression. */
const MAX_DIMENSION: Record<string, number> = { photo: 800 }
const DEFAULT_MAX_DIMENSION = 2000
const JPEG_QUALITY = 0.82

export class FileTooLargeError extends Error {}

/**
 * Compresse une photo ou un scan : redimensionnement (800 px pour une photo
 * d'identité, 2000 px pour un document) puis ré-encodage JPEG. Le fichier
 * d'origine est conservé si la compression ne le rend pas plus léger.
 */
export async function compressImage(file: File, kind: string): Promise<File> {
  if (!file.type.startsWith("image/")) return file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }
  const max = MAX_DIMENSION[kind] ?? DEFAULT_MAX_DIMENSION
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return file
  // Fond blanc : les zones transparentes d'un PNG ne deviennent pas noires en JPEG
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY))
  if (!blob || blob.size >= file.size) return file
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: Date.now() })
}

export async function saveFile(original: File, folder: string, kind: string): Promise<StoredFile> {
  const file = await compressImage(original, kind)
  if (file.size > MAX_STORED_SIZE) throw new FileTooLargeError()
  const ext = EXTENSIONS[file.type] ?? file.name.split(".").pop()?.toLowerCase() ?? "bin"
  const path = `${folder}/${kind}-${Date.now()}.${ext}`
  // Nom unique et horodaté : le fichier ne change jamais, il peut être mis en cache longtemps
  const { error } = await getSupabase().storage.from(FILES_BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" })
  if (error) throw error
  return { id: path, name: file.name, type: file.type, size: file.size, uploadedAt: new Date().toLocaleDateString("sv-SE") }
}

export async function deleteFile(id: string) {
  await getSupabase().storage.from(FILES_BUCKET).remove([id])
}

async function signedUrl(id: string) {
  const { data, error } = await getSupabase().storage.from(FILES_BUCKET).createSignedUrl(id, SIGNED_URL_TTL)
  if (error) throw error
  return data.signedUrl
}

export async function openFile(meta: StoredFile) {
  // Fenêtre ouverte immédiatement pour ne pas être bloquée par le navigateur
  const win = window.open("", "_blank")
  try {
    const url = await signedUrl(meta.id)
    if (win) win.location.href = url
    else window.open(url, "_blank", "noopener")
    return true
  } catch {
    win?.close()
    return false
  }
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`
}

/** URL signée (mise en cache) pour afficher un fichier stocké, ex. une photo. */
export function useFileUrl(id?: string) {
  const { data } = useQuery({
    queryKey: ["file-url", id],
    queryFn: () => signedUrl(id!),
    enabled: !!id && id.includes("/"),
    staleTime: (SIGNED_URL_TTL - 300) * 1000,
    gcTime: SIGNED_URL_TTL * 1000,
    retry: false,
  })
  return id ? (data ?? null) : null
}
