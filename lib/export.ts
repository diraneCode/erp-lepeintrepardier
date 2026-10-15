"use client"

import { format } from "date-fns"

import { formatDate, formatMoney, formatNumber } from "@/lib/format"

export type ExportFormat = "pdf" | "excel" | "csv"
export type ExportValue = string | number | null | undefined

export interface ExportColumn<T> {
  header: string
  value: (row: T) => ExportValue
  type?: "text" | "money" | "number" | "date" | "percent"
  /** Largeur indicative en caractères (Excel) */
  width?: number
}

export interface ExportOptions<T> {
  filename: string
  title: string
  subtitle?: string
  columns: ExportColumn<T>[]
  rows: T[]
  /** Paires libellé / valeur imprimées au-dessus du tableau (PDF) et en tête (Excel). */
  summary?: { label: string; value: string }[]
  orientation?: "portrait" | "landscape"
}

const BRAND: [number, number, number] = [75, 46, 158]
const MUTED: [number, number, number] = [107, 104, 128]
const COMPANY = {
  name: "LE PEINTRE PARDIER",
  address: "BP 4638 Douala — Cameroun",
  contact: "Tél : 652 385 838 / 698 56 29 59 · sales@pardier.com",
  legal: "Le Peintre Pardier — peintures, revêtements et étanchéité",
  footer: "BP: 4638 Douala-Cameroun  -  Tél: 652 385 838 / 698 56 29 59  -  Email: sales@pardier.com",
}

function stamp() {
  return format(new Date(), "yyyyMMdd-HHmm")
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function displayValue(value: ExportValue, type: ExportColumn<unknown>["type"]) {
  if (value === null || value === undefined || value === "") return ""
  if (type === "money" && typeof value === "number") return formatMoney(value, { currency: false })
  if (type === "number" && typeof value === "number") return formatNumber(value, Number.isInteger(value) ? 0 : 2)
  if (type === "percent" && typeof value === "number") return `${formatNumber(value, 1)} %`
  if (type === "date" && typeof value === "string") return formatDate(value)
  return String(value)
}

/* ---------- CSV ---------- */

export function exportCSV<T>({ filename, columns, rows }: ExportOptions<T>) {
  const escape = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const lines = [
    columns.map((c) => escape(c.header)).join(";"),
    ...rows.map((row) =>
      columns
        .map((c) => {
          const v = c.value(row)
          if (typeof v === "number") return String(v).replace(".", ",")
          return escape(c.type === "date" ? displayValue(v, "date") : String(v ?? ""))
        })
        .join(";")
    ),
  ]
  // BOM UTF-8 + séparateur ";" : ouverture directe dans Excel (paramètres régionaux FR)
  download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${filename}-${stamp()}.csv`)
}

/* ---------- Excel ---------- */

export async function exportExcel<T>({ filename, title, subtitle, columns, rows, summary }: ExportOptions<T>) {
  const { default: writeXlsxFile } = await import("write-excel-file/universal")
  type Cell = { value: string | number | Date | null; type?: StringConstructor | NumberConstructor | DateConstructor; format?: string; fontWeight?: "bold"; backgroundColor?: string; textColor?: string; fontSize?: number } | null

  const header: Cell[] = columns.map((c) => ({
    value: c.header,
    fontWeight: "bold",
    backgroundColor: "#4B2E9E",
    textColor: "#FFFFFF",
  }))
  const body: Cell[][] = rows.map((row) =>
    columns.map((c) => {
      const v = c.value(row)
      if (v === null || v === undefined || v === "") return null
      if ((c.type === "money" || c.type === "number") && typeof v === "number")
        return { value: v, type: Number, format: c.type === "money" ? "#,##0" : Number.isInteger(v) ? "#,##0" : "#,##0.00" }
      if (c.type === "percent" && typeof v === "number") return { value: v / 100, type: Number, format: "0.0%" }
      if (c.type === "date" && typeof v === "string") {
        const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v)
        return Number.isNaN(d.getTime()) ? { value: v } : { value: d, type: Date, format: "dd/mm/yyyy" }
      }
      return { value: String(v) }
    })
  )
  const pre: Cell[][] = [
    [{ value: title, fontWeight: "bold", fontSize: 14 }],
    [{ value: `${subtitle ? `${subtitle} · ` : ""}Généré le ${format(new Date(), "dd/MM/yyyy HH:mm")}`, textColor: "#6B6880" }],
    ...(summary ?? []).map<Cell[]>((s) => [{ value: s.label, fontWeight: "bold" }, { value: s.value }]),
    [null],
  ]
  const data = [...pre, header, ...body]
  const widths = columns.map((c, i) => ({
    width:
      c.width ??
      Math.min(48, Math.max(c.header.length + 2, ...rows.slice(0, 200).map((r) => displayValue(columns[i].value(r), c.type).length + 2))),
  }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = await writeXlsxFile(data as any, { columns: widths, sheet: title.slice(0, 31), stickyRowsCount: pre.length + 1 }).toBlob()
  download(blob, `${filename}-${stamp()}.xlsx`)
}

/* ---------- PDF ---------- */

let logoCache: string | null = null
async function loadLogo() {
  if (logoCache) return logoCache
  try {
    const res = await fetch("/logo.jpg")
    const blob = await res.blob()
    logoCache = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return logoCache
  } catch {
    return null
  }
}

async function createPdf(orientation: "portrait" | "landscape") {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")])
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" })
  const logo = await loadLogo()
  return { doc, autoTable, logo }
}

type PdfDoc = Awaited<ReturnType<typeof createPdf>>["doc"]

function drawHeader(doc: PdfDoc, logo: string | null, title: string, subtitle?: string) {
  const width = doc.internal.pageSize.getWidth()
  if (logo) doc.addImage(logo, "JPEG", 14, 10, 37, 15)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.setTextColor(26, 24, 48)
  doc.text(title, width - 14, 16, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  if (subtitle) doc.text(subtitle, width - 14, 21.5, { align: "right" })
  doc.text(`Généré le ${format(new Date(), "dd/MM/yyyy à HH:mm")}`, width - 14, subtitle ? 26 : 21.5, { align: "right" })
  doc.setDrawColor(231, 230, 238)
  doc.setLineWidth(0.3)
  doc.line(14, 31, width - 14, 31)
  return 37
}

function drawFooters(doc: PdfDoc) {
  const pages = doc.getNumberOfPages()
  const width = doc.internal.pageSize.getWidth()
  const height = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(`${COMPANY.name} · ${COMPANY.address}`, 14, height - 8)
    doc.text(`Page ${i} / ${pages}`, width - 14, height - 8, { align: "right" })
  }
}

export async function exportPDF<T>({ filename, title, subtitle, columns, rows, summary, orientation }: ExportOptions<T>) {
  const { doc, autoTable, logo } = await createPdf(orientation ?? (columns.length > 6 ? "landscape" : "portrait"))
  let y = drawHeader(doc, logo, title, subtitle)

  if (summary?.length) {
    const width = doc.internal.pageSize.getWidth() - 28
    const perRow = Math.min(4, summary.length)
    const boxW = (width - (perRow - 1) * 4) / perRow
    summary.forEach((s, i) => {
      const col = i % perRow
      const row = Math.floor(i / perRow)
      const x = 14 + col * (boxW + 4)
      const by = y + row * 18
      doc.setFillColor(246, 246, 249)
      doc.roundedRect(x, by, boxW, 14, 2, 2, "F")
      doc.setFontSize(7.5)
      doc.setTextColor(...MUTED)
      doc.text(s.label, x + 3, by + 5)
      doc.setFontSize(10.5)
      doc.setFont("helvetica", "bold")
      doc.setTextColor(26, 24, 48)
      doc.text(s.value, x + 3, by + 11)
      doc.setFont("helvetica", "normal")
    })
    y += Math.ceil(summary.length / perRow) * 18 + 2
  }

  autoTable(doc, {
    startY: y,
    head: [columns.map((c) => (c.type === "money" ? `${c.header} (FCFA)` : c.header))],
    body: rows.map((row) => columns.map((c) => displayValue(c.value(row), c.type))),
    margin: { left: 14, right: 14, bottom: 16 },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: [26, 24, 48], lineColor: [231, 230, 238], lineWidth: 0.1 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 248, 252] },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [i, c.type === "money" || c.type === "number" || c.type === "percent" ? { halign: "right" } : {}])
    ),
    didDrawPage: (data) => {
      if (data.pageNumber > 1) data.settings.margin.top = 14
    },
  })
  if (!rows.length) {
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text("Aucune donnée pour les filtres sélectionnés.", 14, y + 20)
  }
  drawFooters(doc)
  doc.save(`${filename}-${stamp()}.pdf`)
}

export async function exportData<T>(fmt: ExportFormat, options: ExportOptions<T>) {
  if (fmt === "csv") return exportCSV(options)
  if (fmt === "excel") return exportExcel(options)
  return exportPDF(options)
}

/* ---------- Documents commerciaux ---------- */

export interface CommercialDocument {
  kind: "FACTURE" | "DEVIS" | "TICKET DE VENTE"
  number: string
  date: string
  dueDate?: string
  dueLabel?: string
  status?: string
  client: { name: string; address?: string; phone?: string; email?: string; code?: string }
  issuer?: string
  lines: { description: string; quantity: number; unitPrice: number; discount: number; taxRate: number; total: number }[]
  totals: { gross: number; discount: number; subtotal: number; tax: number; total: number }
  paid?: number
  notes?: string
}

export async function exportDocumentPDF(d: CommercialDocument) {
  const { doc, autoTable, logo } = await createPdf("portrait")
  const width = doc.internal.pageSize.getWidth()
  if (logo) doc.addImage(logo, "JPEG", 14, 12, 45, 18)
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  ;[COMPANY.address, COMPANY.contact, COMPANY.legal].forEach((l, i) => doc.text(l, 14, 36 + i * 4))

  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.setTextColor(...BRAND)
  doc.text(d.kind, width - 14, 20, { align: "right" })
  doc.setFontSize(10)
  doc.setTextColor(26, 24, 48)
  doc.text(d.number, width - 14, 27, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text(`Date : ${formatDate(d.date)}`, width - 14, 33, { align: "right" })
  if (d.dueDate) doc.text(`${d.dueLabel ?? "Échéance"} : ${formatDate(d.dueDate)}`, width - 14, 37.5, { align: "right" })
  if (d.status) doc.text(`Statut : ${d.status}`, width - 14, 42, { align: "right" })

  // Bloc client
  doc.setFillColor(246, 246, 249)
  doc.roundedRect(width / 2 + 4, 50, width / 2 - 18, 30, 2, 2, "F")
  doc.setFontSize(7.5)
  doc.text("CLIENT", width / 2 + 9, 56)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10.5)
  doc.setTextColor(26, 24, 48)
  doc.text(d.client.name, width / 2 + 9, 62)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  ;[d.client.code, d.client.address, d.client.phone, d.client.email].filter(Boolean).forEach((l, i) => doc.text(String(l), width / 2 + 9, 67 + i * 4))
  if (d.issuer) {
    doc.text("Établi par", 14, 56)
    doc.setTextColor(26, 24, 48)
    doc.text(d.issuer, 14, 61)
  }

  autoTable(doc, {
    startY: 88,
    head: [["Désignation", "Qté", "P.U. HT", "Remise", "TVA", "Total HT"]],
    body: d.lines.map((l) => [
      l.description,
      formatNumber(l.quantity),
      formatMoney(l.unitPrice, { currency: false }),
      l.discount ? `${l.discount} %` : "—",
      `${formatNumber(l.taxRate, 2)} %`,
      formatMoney(l.total, { currency: false }),
    ]),
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8.5, cellPadding: 2.4, lineColor: [231, 230, 238], lineWidth: 0.1, textColor: [26, 24, 48] },
    headStyles: { fillColor: BRAND, textColor: 255 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = ((doc as any).lastAutoTable?.finalY ?? 120) + 8
  const rows: [string, string, boolean?][] = [
    ["Total brut HT", formatMoney(d.totals.gross)],
    ["Remises", d.totals.discount ? `− ${formatMoney(d.totals.discount)}` : formatMoney(0)],
    ["Total HT", formatMoney(d.totals.subtotal)],
    ["TVA", formatMoney(d.totals.tax)],
    ["Total TTC", formatMoney(d.totals.total), true],
  ]
  if (d.paid !== undefined) {
    rows.push(["Déjà réglé", formatMoney(d.paid)])
    rows.push(["Reste à payer", formatMoney(Math.max(0, d.totals.total - d.paid)), true])
  }
  rows.forEach(([label, value, strong]) => {
    if (strong) {
      doc.setFillColor(241, 238, 251)
      doc.rect(width - 90, y - 4.5, 76, 7, "F")
      doc.setFont("helvetica", "bold")
    }
    doc.setFontSize(9)
    doc.setTextColor(26, 24, 48)
    doc.text(label, width - 87, y)
    doc.text(value, width - 17, y, { align: "right" })
    doc.setFont("helvetica", "normal")
    y += 7
  })

  if (d.notes) {
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(doc.splitTextToSize(`Notes : ${d.notes}`, width / 2 - 10), 14, y - 30)
  }
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(
    d.kind === "DEVIS" ? "Devis valable 30 jours. Bon pour accord : date, signature et cachet du client." : "Merci de votre confiance. Paiement par virement, chèque ou Mobile Money.",
    14,
    y + 6
  )
  drawFooters(doc)
  doc.save(`${d.number}.pdf`)
}

export interface PayslipDocument {
  period: string
  employee: { name: string; matricule: string; position: string; department: string; cnps: string; hireDate: string; bank: string }
  earnings: [string, number][]
  deductions: [string, number][]
  gross: number
  net: number
  employerCost: number
  status: string
}

export async function exportPayslipPDF(p: PayslipDocument) {
  const { doc, autoTable, logo } = await createPdf("portrait")
  const width = doc.internal.pageSize.getWidth()
  let y = drawHeader(doc, logo, "BULLETIN DE PAIE", `Période : ${p.period}`)

  doc.setFillColor(246, 246, 249)
  doc.roundedRect(14, y, width - 28, 26, 2, 2, "F")
  doc.setFontSize(8)
  const info: [string, string][] = [
    ["Salarié", p.employee.name],
    ["Matricule", p.employee.matricule],
    ["Poste", p.employee.position],
    ["Service", p.employee.department],
    ["N° CNPS", p.employee.cnps],
    ["Date d'embauche", formatDate(p.employee.hireDate)],
  ]
  info.forEach(([label, value], i) => {
    const x = 18 + (i % 3) * ((width - 36) / 3)
    const by = y + 7 + Math.floor(i / 3) * 11
    doc.setTextColor(...MUTED)
    doc.text(label, x, by)
    doc.setTextColor(26, 24, 48)
    doc.setFont("helvetica", "bold")
    doc.text(value, x, by + 4.5)
    doc.setFont("helvetica", "normal")
  })
  y += 32

  autoTable(doc, {
    startY: y,
    head: [["Rubrique", "Gains", "Retenues"]],
    body: [
      ...p.earnings.map(([l, v]) => [l, formatMoney(v, { currency: false }), ""]),
      ...p.deductions.map(([l, v]) => [l, "", formatMoney(v, { currency: false })]),
    ],
    foot: [["Totaux", formatMoney(p.gross, { currency: false }), formatMoney(p.gross - p.net, { currency: false })]],
    margin: { left: 14, right: 14 },
    styles: { fontSize: 9, cellPadding: 2.4, lineColor: [231, 230, 238], lineWidth: 0.1, textColor: [26, 24, 48] },
    headStyles: { fillColor: BRAND, textColor: 255 },
    footStyles: { fillColor: [241, 238, 251], textColor: [26, 24, 48], fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY ?? 150) + 10
  doc.setFillColor(...BRAND)
  doc.roundedRect(width - 94, y, 80, 16, 2, 2, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8.5)
  doc.text("NET À PAYER", width - 90, y + 6)
  doc.setFontSize(13)
  doc.setFont("helvetica", "bold")
  doc.text(formatMoney(p.net), width - 18, y + 12, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(`Virement sur : ${p.employee.bank}`, 14, y + 6)
  doc.text(`Coût employeur estimé : ${formatMoney(p.employerCost)}`, 14, y + 11)
  doc.text(`Statut : ${p.status}`, 14, y + 16)
  doc.text("Barème simplifié (CNPS 4,2 %, IRPP, CAC, CFC, RAV, TDL) — à valider par le service paie.", 14, y + 28)
  drawFooters(doc)
  doc.save(`bulletin-${p.employee.matricule}-${p.period}.pdf`)
}

/* ---------- Facture proforma (modèle Pardier / ISONEM) ---------- */

export interface ProformaDocument {
  number: string
  date: string
  issuedIn: string
  project: string
  site: string
  client: { name: string; address?: string; phone?: string }
  surfaces: { designation: string; quantity: number; unit: string; treatment: string; commercialName: string }[]
  sections: {
    key: "traitement" | "main_oeuvre" | "accessoires"
    title: string
    totalLabel: string
    lines: { description: string; specification?: string; packaging?: string; coverage?: number; surface?: number; quantity: number; unitPrice: number; amount: number }[]
    total: number
  }[]
  subtotal: number
  tax: number
  total: number
  amountInWords: string
  validUntil?: string
  notes?: string
}

const PF = {
  blue: [46, 94, 142] as [number, number, number],
  teal: [30, 78, 95] as [number, number, number],
  green: [27, 77, 43] as [number, number, number],
  sky: [159, 220, 243] as [number, number, number],
  isonem: [30, 136, 201] as [number, number, number],
  ink: [20, 20, 20] as [number, number, number],
}

export async function exportProformaPDF(d: ProformaDocument) {
  const { doc, autoTable, logo } = await createPdf("portrait")
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 12
  const n = (v?: number) => (v === undefined || !Number.isFinite(v) ? "" : formatNumber(v))

  // En-tête : logo Pardier + marque ISONEM
  if (logo) doc.addImage(logo, "JPEG", M, 8, 52, 21)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(30)
  doc.setTextColor(...PF.isonem)
  doc.text("ISONEM", W - M - 3, 24, { align: "right" })
  doc.setFontSize(7)
  doc.text("®", W - M - 1.5, 15)

  // Bandeau de titre
  doc.setFillColor(...PF.blue)
  doc.rect(M, 33, W - 2 * M, 6.5, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(9.5)
  doc.text(`FACTURE PROFORMA : ${d.number}`, W / 2, 37.4, { align: "center" })

  doc.setFont("helvetica", "normal")
  doc.setTextColor(...PF.ink)
  doc.setFontSize(9)
  doc.text(`${d.issuedIn} : ${formatDate(d.date, "dd-MM-yyyy")}`, W - M - 4, 45, { align: "right" })

  // Projet / Lieu / Doit
  doc.setFont("helvetica", "bolditalic")
  doc.text("Projet :", M + 1, 53)
  const pw = doc.getTextWidth("Projet :")
  doc.setLineWidth(0.2)
  doc.line(M + 1, 53.6, M + 1 + pw, 53.6)
  doc.text(d.project, M + 3 + pw, 53)
  doc.setFont("helvetica", "bold")
  doc.text("Lieu", W / 2 + 18, 53)
  doc.line(W / 2 + 18, 53.6, W / 2 + 18 + doc.getTextWidth("Lieu"), 53.6)
  doc.setFont("helvetica", "normal")
  doc.text(`: ${d.site}`, W / 2 + 19 + doc.getTextWidth("Lieu"), 53)
  doc.text("DOIT :", M + 1, 60)
  doc.setFont("helvetica", "bold")
  doc.text(d.client.name, M + 14, 60)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  const contact = [d.client.address, d.client.phone].filter(Boolean).join(" · ")
  if (contact) doc.text(contact, M + 14, 64.5)

  // Évaluation des surfaces
  let y = 71
  doc.setFillColor(...PF.sky)
  doc.rect(M, y, 70, 5.5, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.text("EVALUATION DES SURFACES A TRAITER", M + 1.5, y + 3.9)
  y += 9
  const grid = { lineColor: [0, 0, 0] as [number, number, number], lineWidth: 0.25 }
  if (d.surfaces.length) {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M + 60 },
      head: [["Désignations", "Quantite", "Unite", "Traitement", "Nom Commercial"]],
      body: d.surfaces.map((s) => [s.designation, n(s.quantity), s.unit, s.treatment, s.commercialName]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 1.5, textColor: PF.ink, ...grid, valign: "middle" },
      headStyles: { fillColor: [255, 255, 255], textColor: PF.ink, fontStyle: "bold", halign: "center" },
      columnStyles: { 0: { halign: "left" }, 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "center", fontSize: 7 } },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 6
  }

  // Corps : une ligne d'en-tête commune puis une table par rubrique
  const widths = [36, 30, 20, 24, 20, 14, 21, 21]
  const head = [["Produits /Services", "Spécificité", "Conditionnement", "Couverture (par M²)", "Surface", "Qté", "PU", "Montant"]]
  const columnStyles = Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w, halign: i >= 2 ? (i >= 5 ? "right" : "center") : "left" }]))
  const bar = (label: string, fill: [number, number, number]) => ({ content: label, colSpan: 8, styles: { fillColor: fill, textColor: 255, fontStyle: "bold" as const, halign: "center" as const } })
  const totalRow = (label: string, value: number, fill: [number, number, number]) => [
    { content: "", colSpan: 4, styles: { lineWidth: 0, fillColor: false as unknown as [number, number, number] } },
    { content: label, colSpan: 3, styles: { fillColor: fill, textColor: 255, fontStyle: "bold" as const, halign: "center" as const } },
    { content: n(value), styles: { fillColor: fill, textColor: 255, fontStyle: "bold" as const, halign: "right" as const } },
  ]

  d.sections.forEach((section, si) => {
    const body: unknown[][] = [[bar(section.title.toUpperCase(), PF.blue)]]
    for (const l of section.lines) {
      if (section.key === "traitement")
        body.push([l.description, l.specification ?? "", l.packaging ?? "", n(l.coverage), n(l.surface), n(l.quantity), n(l.unitPrice), n(l.amount)])
      else body.push([{ content: l.description, colSpan: 5 }, n(l.quantity), n(l.unitPrice), n(l.amount)])
    }
    body.push(totalRow(section.totalLabel.toUpperCase(), section.total, section.key === "accessoires" ? PF.teal : PF.blue))
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 20 },
      head: si === 0 ? head : undefined,
      showHead: si === 0 ? "firstPage" : "never",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: body as any,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 7.8, cellPadding: 1.5, textColor: PF.ink, ...grid, valign: "middle" },
      headStyles: { fillColor: [255, 255, 255], textColor: PF.ink, fontStyle: "bold", halign: "center", fontSize: 7.5 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      columnStyles: columnStyles as any,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 5
  })

  // Totaux généraux
  const totals: unknown[][] = []
  if (d.tax > 0) {
    totals.push(totalRow("TOTAL PROJET HT", d.subtotal, PF.blue))
    totals.push(totalRow("TVA 19,25 %", d.tax, PF.blue))
    totals.push(totalRow("TOTAL PROJET TTC", d.total, PF.green))
  } else totals.push(totalRow("TOTAL PROJET", d.total, PF.green))
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 20 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: totals as any,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.6, ...grid },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    columnStyles: columnStyles as any,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = ((doc as any).lastAutoTable?.finalY ?? y) + 8
  if (y > H - 60) {
    doc.addPage()
    y = 20
  }

  doc.setFont("helvetica", "bolditalic")
  doc.setFontSize(9)
  doc.setTextColor(...PF.ink)
  doc.text(doc.splitTextToSize(`Arrêté la présente facture proforma à la somme de ${d.amountInWords}`, W - 2 * M), M, y)
  y += 8
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(90, 90, 90)
  const conditions = [d.validUntil ? `Offre valable jusqu'au ${formatDate(d.validUntil)}.` : "", d.notes ?? ""].filter(Boolean).join(" ")
  if (conditions) {
    doc.text(doc.splitTextToSize(conditions, W - 2 * M), M, y)
    y += 6
  }

  // Signatures
  y = Math.max(y + 12, H - 62)
  doc.setFont("helvetica", "bolditalic")
  doc.setFontSize(9)
  doc.setTextColor(...PF.ink)
  doc.text("LA DIRECTION", M + 14, y)
  doc.line(M + 14, y + 0.7, M + 14 + doc.getTextWidth("LA DIRECTION"), y + 0.7)
  doc.setFont("helvetica", "bold")
  doc.text("LE CLIENT", W / 2 + 20, y)
  doc.line(W / 2 + 20, y + 0.7, W / 2 + 20 + doc.getTextWidth("LE CLIENT"), y + 0.7)

  // Pied de page sur chaque page
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFillColor(...PF.blue)
    doc.rect(M, H - 16, W - 2 * M, 5.5, "F")
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(255, 255, 255)
    doc.text(COMPANY.footer, W / 2, H - 12.3, { align: "center" })
    if (pages > 1) {
      doc.setTextColor(120, 120, 120)
      doc.text(`Page ${i} / ${pages}`, W - M, H - 6, { align: "right" })
    }
  }
  doc.save(`proforma-${d.number.replace(/\//g, "-")}.pdf`)
}
