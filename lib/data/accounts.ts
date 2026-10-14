import type { Account, ExpenseCategory } from "@/lib/types"

/** Extrait du plan comptable SYSCOHADA révisé utilisé par Isonem. */
export const ACCOUNTS: Account[] = [
  { code: "101", name: "Capital social", class: 1 },
  { code: "121", name: "Report à nouveau", class: 1 },
  { code: "162", name: "Emprunts bancaires", class: 1 },
  { code: "241", name: "Matériel et outillage", class: 2 },
  { code: "245", name: "Matériel de transport", class: 2 },
  { code: "311", name: "Marchandises", class: 3 },
  { code: "401", name: "Fournisseurs", class: 4 },
  { code: "411", name: "Clients", class: 4 },
  { code: "421", name: "Personnel, rémunérations dues", class: 4 },
  { code: "431", name: "Sécurité sociale (CNPS)", class: 4 },
  { code: "4441", name: "État, impôts sur salaires", class: 4 },
  { code: "4431", name: "TVA facturée", class: 4 },
  { code: "4452", name: "TVA récupérable", class: 4 },
  { code: "521", name: "Banque", class: 5 },
  { code: "571", name: "Caisse", class: 5 },
  { code: "585", name: "Mobile Money", class: 5 },
  { code: "601", name: "Achats de marchandises", class: 6 },
  { code: "605", name: "Autres achats (fournitures)", class: 6 },
  { code: "6051", name: "Eau et électricité", class: 6 },
  { code: "612", name: "Transports", class: 6 },
  { code: "622", name: "Locations et charges locatives", class: 6 },
  { code: "624", name: "Entretien, réparations", class: 6 },
  { code: "627", name: "Publicité et relations publiques", class: 6 },
  { code: "628", name: "Frais de télécommunications", class: 6 },
  { code: "641", name: "Impôts et taxes", class: 6 },
  { code: "658", name: "Charges diverses", class: 6 },
  { code: "661", name: "Rémunérations du personnel", class: 6 },
  { code: "664", name: "Charges sociales", class: 6 },
  { code: "701", name: "Ventes de marchandises", class: 7 },
  { code: "706", name: "Services vendus", class: 7 },
  { code: "758", name: "Produits divers", class: 7 },
]

export const ACCOUNT_CLASSES: Record<number, string> = {
  1: "Ressources durables",
  2: "Actif immobilisé",
  3: "Stocks",
  4: "Tiers",
  5: "Trésorerie",
  6: "Charges",
  7: "Produits",
}

export const EXPENSE_ACCOUNT: Record<ExpenseCategory, string> = {
  loyer: "622",
  transport: "612",
  fournitures: "605",
  marketing: "627",
  maintenance: "624",
  energie: "6051",
  telecom: "628",
  impots: "641",
  achats: "601",
  autres: "658",
}

export function accountName(code: string) {
  return ACCOUNTS.find((a) => a.code === code)?.name ?? code
}
