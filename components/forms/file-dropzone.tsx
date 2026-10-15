"use client"

import * as React from "react"
import { useDropzone, type Accept, type FileRejection } from "react-dropzone"
import { LuEye, LuFileText, LuImage, LuRefreshCw, LuUpload, LuX } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { FileTooLargeError, MAX_IMAGE_INPUT_SIZE, MAX_STORED_SIZE, formatFileSize, openFile, saveFile, useFileUrl } from "@/lib/files"
import type { StoredFile } from "@/lib/types"
import { cn } from "@/lib/utils"

export const IMAGE_ACCEPT: Accept = { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] }
export const DOC_ACCEPT: Accept = { "application/pdf": [".pdf"], ...IMAGE_ACCEPT }

const TOO_LARGE_PDF = "pdf-too-large"

/** Les PDF sont limités à 5 Mo ; les images (compressées avant envoi) jusqu'à 20 Mo. */
function sizeValidator(file: File) {
  if (!file.type.startsWith("image/") && file.size > MAX_STORED_SIZE) {
    return { code: TOO_LARGE_PDF, message: "PDF trop volumineux" }
  }
  return null
}

function rejectionMessage(rejections: FileRejection[]) {
  const code = rejections[0]?.errors[0]?.code
  if (code === TOO_LARGE_PDF) return `PDF trop volumineux (maximum ${formatFileSize(MAX_STORED_SIZE)}). Réduisez-le ou numérisez-le en image.`
  if (code === "file-too-large") return `Fichier trop volumineux (maximum ${formatFileSize(MAX_IMAGE_INPUT_SIZE)})`
  if (code === "file-invalid-type") return "Format non accepté"
  if (code === "too-many-files") return "Un seul fichier à la fois"
  return "Fichier refusé"
}

/** Zone de dépôt d'un fichier unique (glisser-déposer ou parcourir). */
export function FileDropzone({
  value,
  onChange,
  label,
  description,
  accept = DOC_ACCEPT,
  image = false,
  invalid,
  error,
  required,
  folder,
  kind,
}: {
  /** Dossier de destination dans le stockage (ex. employees/<id>) */
  folder: string
  /** Type de pièce, utilisé dans le nom du fichier */
  kind: string
  value?: StoredFile
  onChange: (file: StoredFile | undefined) => void
  label: string
  description?: string
  accept?: Accept
  /** Aperçu circulaire (photo d'identité) */
  image?: boolean
  invalid?: boolean
  error?: string
  required?: boolean
}) {
  const [busy, setBusy] = React.useState(false)
  const [rejected, setRejected] = React.useState<string | null>(null)
  const previewUrl = useFileUrl(value && value.type.startsWith("image/") ? value.id : undefined)

  const onDrop = React.useCallback(
    async (accepted: File[], rejections: FileRejection[]) => {
      if (rejections.length) {
        setRejected(rejectionMessage(rejections))
        return
      }
      if (!accepted[0]) return
      setRejected(null)
      setBusy(true)
      try {
        onChange(await saveFile(accepted[0], folder, kind))
      } catch (e) {
        setRejected(
          e instanceof FileTooLargeError
            ? `Fichier trop volumineux même après compression (maximum ${formatFileSize(MAX_STORED_SIZE)})`
            : "Envoi du fichier impossible. Vérifiez votre connexion et réessayez."
        )
      } finally {
        setBusy(false)
      }
    },
    [onChange, folder, kind]
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({ onDrop, accept, maxSize: MAX_IMAGE_INPUT_SIZE, validator: sizeValidator, maxFiles: 1, multiple: false, noClick: !!value })
  const message = rejected ?? error

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </span>
      <div
        {...getRootProps()}
        aria-invalid={invalid || !!rejected}
        className={cn(
          "relative flex min-h-24 items-center gap-3 rounded-lg border border-dashed p-3 text-sm transition-colors",
          !value && "cursor-pointer hover:border-primary/60 hover:bg-primary/[0.03]",
          isDragActive && "border-primary bg-primary/5",
          (invalid || rejected) && "border-destructive/60 bg-destructive/[0.03]",
          value && "border-solid bg-muted/30"
        )}
      >
        <input {...getInputProps()} />
        {busy ? (
          <div className="flex w-full items-center justify-center gap-2 text-muted-foreground">
            <Spinner /> Compression et envoi…
          </div>
        ) : value ? (
          <>
            {image && previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={label} className="size-16 shrink-0 rounded-full object-cover ring-2 ring-background" />
            ) : (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {value.type.startsWith("image/") ? <LuImage className="size-5" /> : <LuFileText className="size-5" />}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{value.name}</div>
              <div className="text-xs text-muted-foreground">{formatFileSize(value.size)}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Ouvrir" onClick={() => void openFile(value).then((ok) => !ok && setRejected("Fichier inaccessible"))}>
                <LuEye />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remplacer" onClick={open}>
                <LuRefreshCw />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Retirer" className="hover:text-destructive" onClick={() => onChange(undefined)}>
                <LuX />
              </Button>
            </div>
          </>
        ) : (
          <div className="flex w-full flex-col items-center justify-center gap-1 text-center text-muted-foreground">
            <LuUpload className="size-5" />
            <span>{isDragActive ? "Déposez le fichier ici" : <>Glissez-déposez ou <span className="font-medium text-primary">parcourez</span></>}</span>
            {description && <span className="text-xs">{description}</span>}
          </div>
        )}
      </div>
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  )
}
