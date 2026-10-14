import { addDays, addMonths, eachDayOfInterval, format, isWeekend, startOfMonth, subDays, subMonths } from "date-fns"

import { DEFAULT_PASSWORD, type Role } from "@/lib/access"

import { EXPENSE_ACCOUNT } from "@/lib/data/accounts"
import { computePayslip, documentTotals, businessDaysBetween } from "@/lib/calc"
import type {
  ActivityLog,
  AppNotification,
  Attendance,
  Campaign,
  Category,
  Client,
  Employee,
  Expense,
  Invoice,
  JournalEntry,
  Leave,
  LineItem,
  Opportunity,
  Payment,
  PaymentMethod,
  Payslip,
  Product,
  Promotion,
  Quote,
  Sale,
  Shop,
  StockLevel,
  StockMovement,
  ShopTarget,
  Prospect,
  Followup,
  Appointment,
  MarketingEvent,
  EventParticipant,
  Warehouse,
} from "@/lib/types"

/* ---------- Générateur pseudo-aléatoire déterministe ---------- */

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEED = 20261014
let rand = mulberry32(SEED)
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]
const chance = (p: number) => rand() < p
const round = (n: number, step = 500) => Math.round(n / step) * step
function weighted<T>(entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [v, w] of entries) {
    r -= w
    if (r <= 0) return v
  }
  return entries[entries.length - 1][0]
}
const iso = (d: Date) => format(d, "yyyy-MM-dd")
const pad = (n: number, size = 4) => n.toString().padStart(size, "0")

/* ---------- Référentiels ---------- */

const FIRST_M = ["Jean", "Paul", "Brice", "Hervé", "Arnaud", "Yannick", "Franck", "Serge", "Boris", "Rodrigue", "Ibrahim", "Junior", "Patrick", "Steve", "Alain", "Cédric", "Martial", "Olivier", "Landry", "Samuel"]
const FIRST_F = ["Marie", "Aïcha", "Sandrine", "Christelle", "Larissa", "Carine", "Mireille", "Nadège", "Estelle", "Danielle", "Fadimatou", "Gisèle", "Laure", "Chantal", "Vanessa", "Prisca", "Murielle", "Raïssa"]
const LAST = ["Mbarga", "Nkoulou", "Fotso", "Kamga", "Tchoupo", "Ngono", "Abena", "Manga", "Bello", "Ndjock", "Essomba", "Tagne", "Owona", "Djoumessi", "Nana", "Kouam", "Moukoko", "Ateba", "Onana", "Biyong", "Fouda", "Ngassa", "Simo", "Talla", "Wamba", "Mvondo", "Ekotto", "Hamadou", "Njoya", "Tchami"]
const CITIES = ["Douala", "Yaoundé", "Bafoussam", "Garoua", "Kribi", "Limbé", "Buea", "Bamenda"]
const QUARTERS: Record<string, string[]> = {
  Douala: ["Akwa", "Bonapriso", "Bonabéri", "Makepe", "Logbessou", "Bali", "Deido", "Bassa"],
  Yaoundé: ["Bastos", "Mvan", "Nkolbisson", "Essos", "Biyem-Assi", "Omnisport", "Mendong"],
  Bafoussam: ["Centre commercial", "Tamdja", "Kouogouo"],
  Garoua: ["Roumdé Adjia", "Plateau"],
  Kribi: ["Mokolo", "Dombè"],
  Limbé: ["Down Beach", "Mile 4"],
  Buea: ["Molyko", "Great Soppo"],
  Bamenda: ["Commercial Avenue", "Nkwen"],
}
const COMPANY_A = ["BatiPlus", "Construct", "Immo", "Rénov", "Habitat", "Global", "Prestige", "Horizon", "Atlas", "Sahel", "Équateur", "Wouri", "Sanaga", "Mungo", "Etoile", "Sky"]
const COMPANY_B = ["Sarl", "SA", "BTP", "Services", "Bâtiment", "Décor", "Immobilier", "& Fils", "Génie Civil", "Résidences"]

function phone() {
  return `+237 6${pick(["5", "7", "8", "9"])}${int(0, 9)} ${pad(int(0, 99), 2)} ${pad(int(0, 99), 2)} ${pad(int(0, 99), 2)}`
}
function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "")
}
function address(city: string) {
  return `${pick(QUARTERS[city] ?? ["Centre"])}, ${city}`
}

/* ---------- Génération ---------- */

export function generateSeed(today = new Date()) {
  rand = mulberry32(SEED)
  const start = subMonths(startOfMonth(today), 14)
  const randomDate = (from: Date, to: Date) => new Date(from.getTime() + rand() * (to.getTime() - from.getTime()))
  /** Date biaisée vers la période récente (activité croissante). */
  const recentDate = (from: Date, to: Date) => new Date(from.getTime() + Math.sqrt(rand()) * (to.getTime() - from.getTime()))

  /* Entrepôts & boutiques */
  const warehouses: Warehouse[] = [
    { id: "w1", code: "ENT-DLA", name: "Siège & entrepôt Douala Bassa", type: "entrepot", city: "Douala", address: "Zone industrielle Bassa, Douala", managerId: "e5", phone: phone(), capacity: 1800, status: "actif", createdAt: "2019-03-01" },
    { id: "w2", code: "ENT-YDE", name: "Entrepôt Yaoundé Nkolbisson", type: "entrepot", city: "Yaoundé", address: "Nkolbisson, Yaoundé", managerId: "e6", phone: phone(), capacity: 1200, status: "actif", createdAt: "2020-06-15" },
    { id: "w3", code: "DEP-BFS", name: "Dépôt Bafoussam", type: "depot", city: "Bafoussam", address: "Tamdja, Bafoussam", managerId: "e7", phone: phone(), capacity: 450, status: "actif", createdAt: "2022-01-10" },
  ]
  const shops: Shop[] = [
    { id: "s1", code: "BTQ-AKW", name: "Boutique Douala Akwa", city: "Douala", address: "Bd de la Liberté, Akwa", managerId: "e8", phone: phone(), openingHours: "Lun–Sam · 8h–19h", monthlyTarget: 18_000_000, supplyWarehouseId: "w1", status: "ouverte", openedAt: "2019-05-02" },
    { id: "s2", code: "BTQ-BNB", name: "Boutique Douala Bonabéri", city: "Douala", address: "Carrefour Ancien Dalip, Bonabéri", managerId: "e9", phone: phone(), openingHours: "Lun–Sam · 8h–18h30", monthlyTarget: 11_000_000, supplyWarehouseId: "w1", status: "ouverte", openedAt: "2021-02-15" },
    { id: "s3", code: "BTQ-MVN", name: "Boutique Yaoundé Mvan", city: "Yaoundé", address: "Route de l'aéroport, Mvan", managerId: "e10", phone: phone(), openingHours: "Lun–Sam · 8h–19h", monthlyTarget: 14_000_000, supplyWarehouseId: "w2", status: "ouverte", openedAt: "2020-09-01" },
    { id: "s4", code: "BTQ-BST", name: "Boutique Yaoundé Bastos", city: "Yaoundé", address: "Rue 1.750, Bastos", managerId: "e11", phone: phone(), openingHours: "Lun–Sam · 9h–19h", monthlyTarget: 9_000_000, supplyWarehouseId: "w2", status: "ouverte", openedAt: "2023-04-10" },
    { id: "s5", code: "BTQ-BFS", name: "Boutique Bafoussam Centre", city: "Bafoussam", address: "Marché A, Bafoussam", managerId: "e12", phone: phone(), openingHours: "Lun–Sam · 8h–18h", monthlyTarget: 7_000_000, supplyWarehouseId: "w3", status: "travaux", openedAt: "2024-01-20" },
  ]
  const shopIds = shops.map((s) => s.id)
  const locationIds = [...warehouses.map((w) => w.id), ...shopIds]

  /* Employés */
  const roles: [Employee["department"], string, number, string][] = [
    ["direction", "Directeur général", 1_450_000, "w1"],
    ["comptabilite", "Responsable administratif et financier", 950_000, "w1"],
    ["rh", "Responsable RH", 780_000, "w1"],
    ["commercial", "Directeur commercial", 900_000, "w1"],
    ["logistique", "Gestionnaire de stock", 420_000, "w1"],
    ["logistique", "Magasinier", 230_000, "w2"],
    ["logistique", "Magasinier", 200_000, "w3"],
    ["boutique", "Responsable de boutique", 380_000, "s1"],
    ["boutique", "Responsable de boutique", 350_000, "s2"],
    ["boutique", "Responsable de boutique", 360_000, "s3"],
    ["boutique", "Responsable de boutique", 340_000, "s4"],
    ["boutique", "Responsable de boutique", 320_000, "s5"],
    ["marketing", "Chargée de marketing", 450_000, "w1"],
    ["comptabilite", "Comptable", 420_000, "w1"],
    ["boutique", "Caissière", 250_000, "s1"],
    ["commercial", "Commercial(e)", 280_000, "w1"],
    ["commercial", "Commercial(e)", 270_000, "w2"],
    ["commercial", "Commercial(e) grands comptes", 520_000, "w1"],
    ["technique", "Conseiller coloriste", 300_000, "s1"],
    ["technique", "Chef de chantier peinture", 380_000, "w1"],
    ["technique", "Peintre applicateur", 190_000, "w1"],
    ["technique", "Peintre applicateur", 185_000, "w2"],
    ["boutique", "Vendeur conseil", 160_000, "s1"],
    ["boutique", "Caissière", 160_000, "s2"],
    ["boutique", "Vendeur conseil", 165_000, "s3"],
    ["boutique", "Caissière", 150_000, "s4"],
    ["boutique", "Vendeur conseil", 150_000, "s5"],
    ["logistique", "Magasinier", 140_000, "w1"],
    ["logistique", "Magasinier", 140_000, "w2"],
    ["logistique", "Chauffeur livreur", 150_000, "w1"],
    ["rh", "Assistante RH", 230_000, "w1"],
    ["marketing", "Community manager", 260_000, "w1"],
  ]
  // Rôle applicatif par poste (même ordre que `roles`)
  const ROLE_BY_INDEX: Role[] = [
    "super_admin", "comptable", "rh", "directeur_commercial", "gestionnaire_stock", "magasinier", "magasinier",
    "responsable_boutique", "responsable_boutique", "responsable_boutique", "responsable_boutique", "responsable_boutique",
    "marketing", "comptable", "caissiere", "commercial", "commercial", "commercial",
    "vendeur", "employe", "employe", "employe", "vendeur", "caissiere", "vendeur", "caissiere", "vendeur",
    "magasinier", "magasinier", "employe", "rh", "marketing",
  ]
  const usedNames = new Set<string>(["DiraneMekem"])
  const employees: Employee[] = roles.map(([dept, position, salary, loc], i) => {
    const gender: "H" | "F" = /ère|euse|ante|ée|Chargée|Vendeuse|Caissière|Assistante|manager/.test(position) && !/Directeur/.test(position) ? "F" : chance(0.3) ? "F" : "H"
    let firstName = "", lastName = ""
    do {
      firstName = pick(gender === "F" ? FIRST_F : FIRST_M)
      lastName = pick(LAST)
    } while (usedNames.has(firstName + lastName))
    usedNames.add(firstName + lastName)
    if (i === 0) {
      firstName = "Dirane"
      lastName = "Mekem"
    }
    const hire = randomDate(new Date(2016, 0, 1), subMonths(today, 4))
    const contract = i < 20 ? "cdi" : weighted<Employee["contractType"]>([["cdi", 5], ["cdd", 3], ["stage", 1], ["interim", 1]])
    return {
      id: `e${i + 1}`,
      matricule: `ISO-${pad(i + 101, 4)}`,
      firstName,
      lastName,
      gender: i === 0 ? "H" : gender,
      email: `${slug(firstName)}.${slug(lastName)}@isonem.cm`,
      phone: phone(),
      birthDate: iso(randomDate(new Date(1972, 0, 1), new Date(2002, 11, 31))),
      hireDate: iso(hire),
      department: dept,
      position,
      contractType: contract,
      baseSalary: salary,
      locationId: loc,
      status: i === 26 ? "suspendu" : i === 31 ? "sorti" : "actif",
      cnpsNumber: `${int(100, 999)}-${int(1000000, 9999999)}-${pad(int(0, 99), 2)}`,
      bankAccount: `CM21 ${int(10000, 99999)} ${int(10000, 99999)} ${int(10000000000, 99999999999)} ${pad(int(0, 99), 2)}`,
      address: address(loc.startsWith("s3") || loc.startsWith("s4") || loc === "w2" ? "Yaoundé" : loc === "w3" || loc === "s5" ? "Bafoussam" : "Douala"),
      maritalStatus: weighted([["celibataire", 4], ["marie", 5], ["divorce", 1], ["veuf", 0.3]]),
      children: int(0, 5),
      role: ROLE_BY_INDEX[i] ?? "employe",
    }
  })
  const sellers = employees.filter((e) => ["vendeur", "caissiere", "responsable_boutique", "commercial"].includes(e.role))
  const commercials = employees.filter((e) => e.department === "commercial" || e.department === "direction")
  const sellerFor = (shopId: string) => {
    const local = sellers.filter((e) => e.locationId === shopId)
    return (local.length ? pick(local) : pick(sellers)).id
  }

  /* Catégories & produits */
  const categories: Category[] = [
    { id: "c1", name: "Peintures intérieures", description: "Acryliques, vinyliques, satinées et mates pour murs et plafonds", color: "#4b2e9e" },
    { id: "c2", name: "Peintures façades", description: "Peintures extérieures, pliolite, siloxane", color: "#2f80d1" },
    { id: "c3", name: "Laques & vernis", description: "Glycéro, laques bois et métal, vernis", color: "#ee8f1f" },
    { id: "c4", name: "Enduits & préparation", description: "Enduits, sous-couches, impressions, mastics", color: "#5aa832" },
    { id: "c5", name: "Outillage", description: "Rouleaux, pinceaux, spatules, pistolets", color: "#dc3b30" },
    { id: "c6", name: "Accessoires & protection", description: "Bâches, rubans, gants, solvants", color: "#8b74e0" },
    { id: "c7", name: "Étanchéité & spéciaux", description: "Anti-rouille, étanchéité, peintures de sol", color: "#1f6f8b" },
  ]
  const productDefs: [string, string, Product["unit"], number, number][] = [
    ["Acrylique mate blanche Pardier", "c1", "seau_20l", 28_000, 38_500],
    ["Acrylique mate blanche Pardier", "c1", "pot_4l", 6_200, 8_900],
    ["Acrylique satinée lessivable", "c1", "seau_20l", 36_000, 49_000],
    ["Acrylique satinée lessivable", "c1", "pot_4l", 8_100, 11_500],
    ["Vinylique économique plafond", "c1", "seau_20l", 17_500, 24_000],
    ["Peinture velours teintable", "c1", "pot_4l", 9_800, 14_000],
    ["Peinture cuisine & bain anti-moisissure", "c1", "pot_4l", 11_000, 15_900],
    ["Façade pliolite blanche", "c2", "seau_20l", 46_000, 62_000],
    ["Façade siloxane premium", "c2", "seau_20l", 58_000, 79_000],
    ["Façade acrylique teintée", "c2", "seau_20l", 41_000, 56_000],
    ["Peinture toiture tôle", "c2", "seau_20l", 39_000, 53_500],
    ["Glycéro brillante blanche", "c3", "pot_4l", 12_500, 17_800],
    ["Glycéro brillante blanche", "c3", "pot_1l", 3_400, 4_900],
    ["Laque satinée bois & métal", "c3", "pot_1l", 4_100, 5_900],
    ["Vernis bois incolore", "c3", "pot_1l", 3_900, 5_600],
    ["Vernis marine extérieur", "c3", "pot_4l", 14_000, 19_900],
    ["Enduit de lissage poudre", "c4", "sac_25kg", 7_800, 11_000],
    ["Enduit de rebouchage pâte", "c4", "kg", 900, 1_400],
    ["Sous-couche universelle", "c4", "seau_20l", 24_000, 33_000],
    ["Impression fixatrice", "c4", "pot_4l", 6_800, 9_600],
    ["Mastic acrylique", "c4", "piece", 1_100, 1_800],
    ["Rouleau anti-goutte 180 mm", "c5", "piece", 2_100, 3_500],
    ["Rouleau façade 250 mm", "c5", "piece", 3_200, 5_200],
    ["Pinceau plat 50 mm", "c5", "piece", 700, 1_200],
    ["Brosse à rechampir 30 mm", "c5", "piece", 600, 1_000],
    ["Spatule inox 20 cm", "c5", "piece", 1_500, 2_500],
    ["Pistolet airless compact", "c5", "piece", 245_000, 329_000],
    ["Bac à peinture 10 L", "c5", "piece", 1_300, 2_200],
    ["Bâche de protection 4×5 m", "c6", "piece", 1_200, 2_000],
    ["Ruban de masquage 48 mm", "c6", "rouleau", 650, 1_100],
    ["White spirit", "c6", "litre", 1_400, 2_200],
    ["Diluant cellulosique", "c6", "litre", 1_700, 2_600],
    ["Gants nitrile (boîte de 100)", "c6", "piece", 3_500, 5_500],
    ["Anti-rouille minium", "c7", "pot_4l", 13_500, 18_900],
    ["Résine d'étanchéité toiture", "c7", "seau_20l", 62_000, 84_000],
    ["Peinture de sol époxy", "c7", "pot_4l", 21_000, 29_500],
    ["Hydrofuge façade", "c7", "seau_20l", 33_000, 45_000],
  ]
  const brands: Record<string, string[]> = {
    c1: ["Pardier", "Pardier Pro", "Seigneurie"],
    c2: ["Pardier Façade", "Tollens"],
    c3: ["Pardier Laque", "Ripolin"],
    c4: ["Toupret", "Pardier"],
    c5: ["L'Outil Parfait", "Nespoli"],
    c6: ["Tesa", "Générique"],
    c7: ["Sika", "Pardier Tech"],
  }
  const unitSuffix: Partial<Record<Product["unit"], string>> = { seau_20l: "20 L", pot_4l: "4 L", pot_1l: "1 L", sac_25kg: "25 kg" }
  const products: Product[] = productDefs.map(([name, cat, unit, pp, sp], i) => ({
    id: `p${i + 1}`,
    sku: `${cat.toUpperCase()}-${pad(i + 1, 3)}`,
    name: unitSuffix[unit] ? `${name} ${unitSuffix[unit]}` : name,
    categoryId: cat,
    brand: pick(brands[cat]),
    unit,
    purchasePrice: pp,
    salePrice: sp,
    taxRate: 19.25,
    minStock: unit === "seau_20l" ? int(15, 30) : unit === "piece" && pp > 100_000 ? 2 : int(20, 60),
    status: i === 26 && chance(0.2) ? "inactif" : "actif",
    barcode: cat === "c5" || cat === "c6" ? (chance(0.5) ? `620${int(100000000, 999999999)}${int(0, 9)}` : undefined) : `620${int(100000000, 999999999)}${int(0, 9)}`,
    // Produits chimiques (peintures, enduits, vernis…) : date de péremption du lot en stock
    expiryDate: ["c1", "c2", "c3", "c4", "c7"].includes(cat) ? iso(addDays(today, weighted([[int(-20, -1), 0.6], [int(1, 45), 1.2], [int(46, 120), 2], [int(121, 900), 8]]))) : undefined,
    ...(chance(0.18) ? { promoPrice: Math.round((sp * pick([0.85, 0.9, 0.95])) / 100) * 100, promoEndDate: iso(addDays(today, int(5, 40))) } : {}),
    supplier: pick(["Pardier Industries", "SoCaPeint", "Colorama Distribution", "Afrique Outillage", "Import Chimie Douala"]),
    description: `${name} — ${categories.find((c) => c.id === cat)?.name.toLowerCase()}.`,
    createdAt: iso(randomDate(new Date(2021, 0, 1), subMonths(today, 6))),
  }))

  const makeItems = (count: number, bulk = false): LineItem[] => {
    const chosen = new Set<string>()
    const items: LineItem[] = []
    while (items.length < count) {
      const p = pick(products)
      if (chosen.has(p.id) || p.status === "inactif") continue
      chosen.add(p.id)
      const qty = p.salePrice > 100_000 ? 1 : bulk ? int(5, 60) : int(1, 12)
      items.push({
        productId: p.id,
        description: p.name,
        quantity: qty,
        unitPrice: p.salePrice,
        discount: bulk ? pick([0, 0, 5, 10]) : pick([0, 0, 0, 5]),
        taxRate: p.taxRate,
      })
    }
    return items
  }

  /* Clients */
  const clients: Client[] = Array.from({ length: 72 }, (_, i) => {
    const isCompany = chance(0.55)
    const city = weighted(CITIES.map((c, idx) => [c, idx < 3 ? 6 - idx : 1] as [string, number]))
    const contactFirst = pick(chance(0.5) ? FIRST_M : FIRST_F)
    const contactLast = pick(LAST)
    const name = isCompany
      ? `${pick(COMPANY_A)} ${pick(COMPANY_B)}${chance(0.3) ? ` ${city}` : ""}`
      : `${contactFirst} ${contactLast}`
    const segment: Client["segment"] = isCompany
      ? weighted([["btp", 5], ["revendeur", 3], ["administration", 1.5], ["hotellerie", 1.5]])
      : "particulier"
    return {
      id: `cl${i + 1}`,
      code: `CLI-${pad(i + 1, 4)}`,
      type: isCompany ? "entreprise" : "particulier",
      name,
      contactName: `${contactFirst} ${contactLast}`,
      email: isCompany ? `contact@${slug(name).replace(/\./g, "")}.cm` : `${slug(contactFirst)}.${slug(contactLast)}@gmail.com`,
      phone: phone(),
      city,
      address: address(city),
      segment,
      status: weighted([["actif", 8], ["inactif", 1.5]]),
      ownerId: pick(commercials).id,
      creditLimit: isCompany ? pick([1_000_000, 2_500_000, 5_000_000, 10_000_000]) : 0,
      createdAt: iso(randomDate(subMonths(today, 30), subDays(today, 5))),
      notes: chance(0.3) ? pick(["Client fidèle, paie à 30 jours.", "Préfère être contacté sur WhatsApp.", "Chantiers réguliers à Bonamoussadi.", "Demande souvent des teintes sur mesure."]) : undefined,
    }
  })
  const activeClients = clients.filter((c) => c.status === "actif")

  /* Ventes, factures, paiements */
  const sales: Sale[] = []
  const invoices: Invoice[] = []
  const payments: Payment[] = []
  let invoiceSeq = 0
  for (let i = 0; i < 460; i++) {
    const date = recentDate(start, today)
    const shopId = weighted<string>([["s1", 5], ["s2", 3], ["s3", 4], ["s4", 2.5], ["s5", 1.2]])
    const client = chance(0.72) ? pick(activeClients) : null
    const bulk = client?.type === "entreprise"
    const items = makeItems(int(1, bulk ? 5 : 3), bulk)
    const ageDays = (today.getTime() - date.getTime()) / 86_400_000
    const status: Sale["status"] = ageDays < 2 ? weighted([["confirmee", 3], ["brouillon", 1]]) : weighted([["livree", 18], ["annulee", 1], ["confirmee", ageDays < 10 ? 3 : 0.2]])
    const method: PaymentMethod = client?.type === "entreprise" ? weighted([["virement", 4], ["cheque", 2], ["credit", 3], ["mobile_money", 1]]) : weighted([["especes", 5], ["mobile_money", 4], ["carte", 1]])
    const sale: Sale = {
      id: `v${i + 1}`,
      number: `VTE-${format(date, "yyyy")}-${pad(i + 1, 5)}`,
      date: iso(date),
      clientId: client?.id ?? null,
      boutiqueId: shopId,
      sellerId: sellerFor(shopId),
      items,
      paymentMethod: method,
      status,
      channel: client?.type === "entreprise" ? weighted([["chantier", 3], ["telephone", 2], ["boutique", 2]]) : weighted([["boutique", 8], ["en_ligne", 1], ["telephone", 1]]),
    }
    if (client && status !== "annulee" && status !== "brouillon") {
      invoiceSeq++
      const total = documentTotals(items).total
      const dueDate = addDays(date, client.type === "entreprise" ? 30 : 7)
      let invStatus: Invoice["status"]
      let paid = 0
      if (method !== "credit" && method !== "virement" && method !== "cheque") {
        invStatus = "payee"
        paid = total
      } else if (ageDays > 50) {
        invStatus = weighted([["payee", 17], ["partielle", 2], ["emise", 1.3]])
      } else {
        invStatus = weighted([["payee", 5], ["partielle", 2], ["emise", 4]])
      }
      if (invStatus === "payee") paid = total
      if (invStatus === "partielle") paid = round(total * (0.3 + rand() * 0.4))
      const invoice: Invoice = {
        id: `f${invoiceSeq}`,
        number: `FAC-${format(date, "yyyy")}-${pad(invoiceSeq, 5)}`,
        clientId: client.id,
        boutiqueId: shopId,
        date: iso(date),
        dueDate: iso(dueDate),
        items,
        status: invStatus,
        amountPaid: paid,
        saleId: sale.id,
      }
      sale.invoiceId = invoice.id
      invoices.push(invoice)
      if (paid > 0) {
        const parts = invStatus === "payee" && chance(0.2) ? 2 : 1
        let remaining = paid
        for (let k = 0; k < parts; k++) {
          const amount = k === parts - 1 ? remaining : round(paid / 2)
          remaining -= amount
          const payDate = method === "credit" || method === "virement" || method === "cheque" ? addDays(date, int(2, 40)) : date
          payments.push({
            id: `pay${payments.length + 1}`,
            invoiceId: invoice.id,
            date: iso(payDate > today ? today : payDate),
            amount,
            method: method === "credit" ? pick<PaymentMethod>(["virement", "cheque", "mobile_money"]) : method,
            reference: `REG-${pad(payments.length + 1, 5)}`,
          })
        }
      }
    }
    sales.push(sale)
  }
  sales.sort((a, b) => a.date.localeCompare(b.date))

  /* Devis */
  const quotes: Quote[] = Array.from({ length: 64 }, (_, i) => {
    const date = recentDate(start, today)
    const age = (today.getTime() - date.getTime()) / 86_400_000
    const status: Quote["status"] = age > 30 ? weighted([["accepte", 5], ["refuse", 2], ["expire", 2]]) : weighted([["envoye", 4], ["brouillon", 2], ["accepte", 2], ["refuse", 0.5]])
    return {
      id: `d${i + 1}`,
      number: `DEV-${format(date, "yyyy")}-${pad(i + 1, 4)}`,
      clientId: pick(clients).id,
      date: iso(date),
      validUntil: iso(addDays(date, 30)),
      items: makeItems(int(2, 6), true),
      status,
      ownerId: pick(commercials).id,
      notes: chance(0.3) ? "Prix valables sous réserve de disponibilité du stock." : undefined,
    }
  })

  /* Opportunités */
  const oppTitles = ["Rénovation façade immeuble", "Peinture intérieure villa", "Chantier hôtel — 120 chambres", "Fourniture revendeur trimestrielle", "Réfection bureaux administratifs", "Étanchéité toiture entrepôt", "Peinture école primaire", "Ravalement résidence", "Peinture sol parking", "Lot appartements neufs"]
  const opportunities: Opportunity[] = Array.from({ length: 46 }, (_, i) => {
    const stage = weighted<Opportunity["stage"]>([["prospection", 3], ["qualification", 3], ["proposition", 3], ["negociation", 2], ["gagnee", 3], ["perdue", 1.5]])
    const prob = { prospection: 10, qualification: 25, proposition: 50, negociation: 75, gagnee: 100, perdue: 0 }[stage]
    const created = randomDate(subMonths(today, 8), subDays(today, 3))
    const client = pick(clients.filter((c) => c.type === "entreprise"))
    return {
      id: `o${i + 1}`,
      title: `${pick(oppTitles)} — ${client.city}`,
      clientId: client.id,
      amount: round(int(800_000, 45_000_000), 50_000),
      stage,
      probability: prob,
      expectedClose: iso(addDays(created, int(20, 120))),
      ownerId: pick(commercials).id,
      source: weighted([["recommandation", 3], ["site_web", 2], ["salon", 1], ["appel_entrant", 2], ["terrain", 3], ["reseaux_sociaux", 2]]),
      createdAt: iso(created),
    }
  })

  /* Stock */
  const stockLevels: StockLevel[] = []
  for (const p of products) {
    for (const loc of locationIds) {
      const isWarehouse = loc.startsWith("w")
      const base = p.minStock * (isWarehouse ? 4 : 1.4)
      let qty = Math.max(0, Math.round(base * (0.3 + rand() * 1.5)))
      if (chance(0.06)) qty = int(0, Math.max(1, Math.floor(p.minStock / 3)))
      stockLevels.push({ id: `sl_${p.id}_${loc}`, productId: p.id, locationId: loc, quantity: qty })
    }
  }
  const reasons = {
    entree: ["Réception fournisseur", "Retour client", "Production atelier teinte"],
    sortie: ["Vente comptoir", "Livraison chantier", "Casse / produit endommagé", "Échantillons"],
    transfert: ["Réapprovisionnement boutique", "Rééquilibrage des stocks"],
    ajustement: ["Inventaire mensuel", "Correction de saisie"],
  }
  const stockMovements: StockMovement[] = Array.from({ length: 280 }, (_, i) => {
    const type = weighted<StockMovement["type"]>([["entree", 3], ["sortie", 4], ["transfert", 3], ["ajustement", 1]])
    const p = pick(products)
    const wh = pick(warehouses).id
    const shop = pick(shops)
    const date = recentDate(subMonths(today, 6), today)
    return {
      id: `m${i + 1}`,
      date: format(date, "yyyy-MM-dd'T'HH:mm"),
      productId: p.id,
      type,
      quantity: type === "ajustement" ? int(-6, 6) || 2 : int(2, p.unit === "seau_20l" ? 40 : 120),
      fromLocationId: type === "sortie" ? pick(locationIds) : type === "transfert" ? shop.supplyWarehouseId : undefined,
      toLocationId: type === "entree" ? wh : type === "transfert" ? shop.id : type === "ajustement" ? pick(locationIds) : undefined,
      reason: pick(reasons[type]),
      reference: `${type === "entree" ? "BR" : type === "sortie" ? "BS" : type === "transfert" ? "BT" : "INV"}-${pad(i + 1, 5)}`,
      userId: pick(employees.filter((e) => e.department === "logistique")).id,
    }
  }).sort((a, b) => a.date.localeCompare(b.date))

  /* Marketing */
  const campaignNames = ["Promo saison sèche", "Lancement Façade siloxane", "Fête des mères — déco", "Rentrée chantiers", "Black Friday peinture", "Programme fidélité artisans", "Salon Promote Yaoundé", "Couleurs de l'année", "Spécial revendeurs", "Fin d'année — rénovation", "Atelier coloriste gratuit", "Radio Équinoxe — spot", "Panneaux carrefour Ndokoti", "Relance clients inactifs"]
  const campaigns: Campaign[] = campaignNames.map((name, i) => {
    const s = randomDate(subMonths(today, 12), addDays(today, 30))
    const e = addDays(s, int(10, 60))
    const status: Campaign["status"] = s > today ? weighted([["planifiee", 3], ["brouillon", 1]]) : e < today ? "terminee" : weighted([["en_cours", 5], ["suspendue", 1]])
    const budget = round(int(150_000, 3_500_000), 50_000)
    const progress = status === "terminee" ? 1 : status === "en_cours" || status === "suspendue" ? rand() * 0.8 + 0.1 : 0
    const reach = Math.round(int(2_000, 60_000) * progress)
    const leads = Math.round(reach * (0.01 + rand() * 0.04))
    const conversions = Math.round(leads * (0.1 + rand() * 0.3))
    return {
      id: `cp${i + 1}`,
      name,
      channel: pick<Campaign["channel"]>(["sms", "email", "facebook", "whatsapp", "radio", "affichage"]),
      status,
      segment: pick<Campaign["segment"]>(["tous", "btp", "particulier", "revendeur", "hotellerie"]),
      startDate: iso(s),
      endDate: iso(e),
      budget,
      spent: Math.round(budget * progress * (0.8 + rand() * 0.25)),
      reach,
      leads,
      conversions,
      revenue: conversions * int(40_000, 260_000),
      ownerId: pick(employees.filter((x) => x.department === "marketing")).id,
      description: "Campagne multicanal ciblant les clients du segment sélectionné.",
    }
  })
  const promotions: Promotion[] = [
    ["SAISON10", "Saison sèche −10 %", "pourcentage", 10, 50_000, "c2"],
    ["ARTISAN15", "Remise artisans", "pourcentage", 15, 200_000, null],
    ["BIENVENUE", "Bienvenue nouveaux clients", "montant", 5_000, 30_000, null],
    ["OUTIL20", "Outillage −20 %", "pourcentage", 20, 10_000, "c5"],
    ["FACADE25K", "25 000 offerts façade", "montant", 25_000, 300_000, "c2"],
    ["VERNIS5", "Vernis −5 %", "pourcentage", 5, 0, "c3"],
    ["NOEL2025", "Noël déco", "pourcentage", 12, 40_000, "c1"],
    ["PROSOL", "Sols époxy pros", "montant", 15_000, 150_000, "c7"],
  ].map(([code, name, type, value, min, cat], i) => {
    const s = randomDate(subMonths(today, 10), addDays(today, 15))
    const e = addDays(s, int(15, 90))
    const limit = pick([100, 200, 500, 1000])
    return {
      id: `pr${i + 1}`,
      code: code as string,
      name: name as string,
      type: type as Promotion["type"],
      value: value as number,
      minAmount: min as number,
      categoryId: cat as string | null,
      startDate: iso(s),
      endDate: iso(e),
      usageLimit: limit,
      usageCount: s > today ? 0 : int(0, limit),
      active: e >= today,
    }
  })

  /* Pointage (60 derniers jours) */
  const attendance: Attendance[] = []
  const workDays = eachDayOfInterval({ start: subDays(today, 60), end: today }).filter((d) => !isWeekend(d))
  const hm = (minutes: number) => `${pad(Math.floor(minutes / 60), 2)}:${pad(minutes % 60, 2)}`
  for (const e of employees.filter((x) => x.status !== "sorti")) {
    for (const d of workDays) {
      const status = weighted<Attendance["status"]>([["present", 82], ["retard", 8], ["absent", 2.5], ["conge", 4], ["mission", 3]])
      const isToday = iso(d) === iso(today)
      const checkInMin = status === "retard" ? int(8 * 60 + 10, 9 * 60 + 40) : int(7 * 60 + 30, 8 * 60 + 5)
      const checkOutMin = int(16 * 60 + 30, 18 * 60 + 45)
      const working = status === "present" || status === "retard" || status === "mission"
      attendance.push({
        id: `pt_${e.id}_${iso(d)}`,
        employeeId: e.id,
        date: iso(d),
        checkIn: working ? hm(checkInMin) : null,
        checkOut: working && !isToday ? hm(checkOutMin) : null,
        breakMinutes: working ? pick([45, 60, 60, 60, 90]) : 0,
        status,
        note: status === "absent" ? pick(["Absence non justifiée", "Justificatif en attente", "Maladie (certificat)"]) : status === "mission" ? pick(["Chantier client", "Formation fournisseur", "Livraison Kribi"]) : undefined,
      })
    }
  }

  /* Congés */
  const leaves: Leave[] = Array.from({ length: 48 }, (_, i) => {
    const e = pick(employees.filter((x) => x.status !== "sorti"))
    const s = randomDate(subMonths(today, 11), addDays(today, 60))
    const type = weighted<Leave["type"]>([["annuel", 6], ["maladie", 2], ["exceptionnel", 1.5], ["recuperation", 1.5], ["sans_solde", 0.5], ["maternite", 0.4]])
    const length = type === "maternite" ? 98 : type === "annuel" ? int(3, 15) : int(1, 4)
    let endDate = addDays(s, length - 1)
    if (isWeekend(endDate)) endDate = addDays(endDate, 2)
    const requested = subDays(s, int(3, 30))
    const status: Leave["status"] = s > today ? weighted([["en_attente", 4], ["approuve", 3], ["refuse", 0.5]]) : weighted([["approuve", 9], ["refuse", 1], ["annule", 0.5]])
    return {
      id: `l${i + 1}`,
      employeeId: e.id,
      type,
      startDate: iso(s),
      endDate: iso(endDate),
      days: businessDaysBetween(iso(s), iso(endDate)),
      reason: { annuel: "Congé annuel", maladie: "Arrêt maladie", exceptionnel: pick(["Mariage", "Décès d'un proche", "Naissance"]), recuperation: "Récupération heures supplémentaires", sans_solde: "Convenance personnelle", maternite: "Congé maternité" }[type],
      status,
      requestedAt: iso(requested > today ? today : requested),
      approverId: status !== "en_attente" ? "e3" : undefined,
      comment: status === "refuse" ? "Période de forte activité, merci de proposer d'autres dates." : undefined,
    }
  }).sort((a, b) => b.startDate.localeCompare(a.startDate))

  /* Bulletins de paie (6 derniers mois) */
  const payslips: Payslip[] = []
  for (let m = 5; m >= 0; m--) {
    const period = format(subMonths(today, m), "yyyy-MM")
    for (const e of employees) {
      if (e.status === "sorti" && m < 2) continue
      if (e.hireDate > `${period}-28`) continue
      const housing = e.baseSalary >= 400_000 ? round(e.baseSalary * 0.15, 1000) : 0
      payslips.push({
        id: `bp_${e.id}_${period}`,
        employeeId: e.id,
        period,
        baseSalary: e.baseSalary,
        overtime: ["logistique", "boutique", "technique"].includes(e.department) && chance(0.4) ? round(int(5_000, 45_000)) : 0,
        bonuses: chance(0.25) ? round(int(10_000, 120_000), 5_000) : 0,
        transportAllowance: e.baseSalary < 300_000 ? 25_000 : 40_000,
        housingAllowance: housing,
        otherDeductions: chance(0.1) ? round(int(10_000, 50_000), 5_000) : 0,
        status: m === 0 ? (today.getDate() > 25 ? "valide" : "brouillon") : "paye",
        paidAt: m === 0 ? undefined : iso(addDays(startOfMonth(subMonths(today, m - 1)), -2)),
      })
    }
  }

  /* Dépenses */
  const expenseDefs: [Expense["category"], string[], [number, number], string[]][] = [
    ["loyer", ["Loyer boutique", "Loyer entrepôt"], [350_000, 1_200_000], ["SCI Wouri Immobilier", "M. Nkoulou (bailleur)"]],
    ["transport", ["Carburant camion livraison", "Location camion", "Frais de transport marchandises"], [25_000, 280_000], ["Total Energies", "Tradex", "Transports Bello"]],
    ["fournitures", ["Fournitures de bureau", "Consommables caisse", "Cartouches imprimante"], [8_000, 120_000], ["Librairie Peuple", "Bureau Plus"]],
    ["marketing", ["Impression flyers", "Sponsoring Facebook", "Spot radio"], [40_000, 650_000], ["Imprimerie Moderne", "Meta Ads", "Radio Équinoxe"]],
    ["maintenance", ["Réparation machine à teinter", "Entretien climatisation", "Révision camion"], [30_000, 420_000], ["Froid Service", "Garage Central"]],
    ["energie", ["Facture électricité", "Facture eau"], [45_000, 320_000], ["ENEO", "CAMWATER"]],
    ["telecom", ["Abonnement internet fibre", "Crédit téléphonique flotte"], [25_000, 160_000], ["Camtel", "MTN Cameroon", "Orange Cameroun"]],
    ["impots", ["Patente annuelle", "Taxe communale", "Acompte IS"], [80_000, 1_500_000], ["Direction Générale des Impôts", "Commune de Douala"]],
    ["achats", ["Achat pigments", "Achat emballages", "Achat lot rouleaux"], [150_000, 2_800_000], ["Pardier Industries", "SoCaPeint", "Afrique Outillage"]],
    ["autres", ["Frais bancaires", "Réception clients", "Divers"], [5_000, 150_000], ["Afriland First Bank", "Restaurant Le Biniou"]],
  ]
  const expenses: Expense[] = Array.from({ length: 230 }, (_, i) => {
    const [category, labels, [min, max], suppliers] = weighted(expenseDefs.map((d) => [d, d[0] === "achats" || d[0] === "transport" ? 3 : d[0] === "impots" ? 0.6 : 1.5] as [typeof d, number]))
    const date = recentDate(start, today)
    const age = (today.getTime() - date.getTime()) / 86_400_000
    const status: Expense["status"] = age > 20 ? weighted([["payee", 12], ["rejetee", 1]]) : weighted([["en_attente", 4], ["approuvee", 3], ["payee", 3], ["rejetee", 0.5]])
    return {
      id: `x${i + 1}`,
      number: `DEP-${format(date, "yyyy")}-${pad(i + 1, 4)}`,
      date: iso(date),
      category,
      description: pick(labels),
      supplier: pick(suppliers),
      amount: round(int(min, max), 500),
      paymentMethod: weighted<PaymentMethod>([["virement", 3], ["especes", 3], ["mobile_money", 2], ["cheque", 1]]),
      locationId: pick(locationIds),
      status,
      submittedBy: pick(employees.slice(0, 15)).id,
      approvedBy: status === "en_attente" ? undefined : "e2",
      hasReceipt: chance(0.85),
    }
  }).sort((a, b) => a.date.localeCompare(b.date))

  /* Journal comptable généré à partir des opérations */
  const treasury = (m: PaymentMethod) => (m === "especes" ? "571" : m === "mobile_money" ? "585" : "521")
  const raw: Omit<JournalEntry, "id" | "number">[] = []
  for (const inv of invoices) {
    const t = documentTotals(inv.items)
    raw.push({
      date: inv.date,
      journal: "VE",
      label: `Facture ${inv.number}`,
      reference: inv.number,
      status: "valide",
      lines: [
        { account: "411", label: `Client — ${inv.number}`, debit: t.total, credit: 0 },
        { account: "701", label: "Ventes de marchandises", debit: 0, credit: t.subtotal },
        { account: "4431", label: "TVA collectée 19,25 %", debit: 0, credit: t.tax },
      ],
    })
  }
  for (const p of payments) {
    const inv = invoices.find((x) => x.id === p.invoiceId)
    raw.push({
      date: p.date,
      journal: p.method === "especes" ? "CA" : "BQ",
      label: `Règlement ${inv?.number ?? ""}`,
      reference: p.reference,
      status: "valide",
      lines: [
        { account: treasury(p.method), label: "Encaissement client", debit: p.amount, credit: 0 },
        { account: "411", label: `Client — ${inv?.number ?? ""}`, debit: 0, credit: p.amount },
      ],
    })
  }
  for (const x of expenses.filter((e) => e.status === "payee")) {
    raw.push({
      date: x.date,
      journal: x.category === "achats" ? "AC" : x.paymentMethod === "especes" ? "CA" : "BQ",
      label: `${x.description} — ${x.supplier}`,
      reference: x.number,
      status: "valide",
      lines: [
        { account: EXPENSE_ACCOUNT[x.category], label: x.description, debit: x.amount, credit: 0 },
        { account: treasury(x.paymentMethod), label: "Paiement", debit: 0, credit: x.amount },
      ],
    })
  }
  const periods = [...new Set(payslips.filter((p) => p.status === "paye").map((p) => p.period))]
  for (const period of periods) {
    const slips = payslips.filter((p) => p.period === period)
    const totals = slips.map((s) => computePayslip(s))
    const gross = totals.reduce((s, t) => s + t.gross, 0)
    const net = totals.reduce((s, t) => s + t.net, 0)
    const cnps = totals.reduce((s, t) => s + t.cnps, 0)
    const taxes = gross - net - cnps
    raw.push({
      date: `${period}-28`,
      journal: "PA",
      label: `Paie ${period}`,
      reference: `PAIE-${period}`,
      status: "valide",
      lines: [
        { account: "661", label: "Salaires bruts", debit: gross, credit: 0 },
        { account: "431", label: "Cotisations CNPS salariales", debit: 0, credit: cnps },
        { account: "4441", label: "Impôts et retenues sur salaires", debit: 0, credit: taxes },
        { account: "421", label: "Net à payer", debit: 0, credit: net },
      ],
    })
  }
  raw.sort((a, b) => a.date.localeCompare(b.date))
  const journalEntries: JournalEntry[] = raw.map((e, i) => ({ ...e, id: `je${i + 1}`, number: `EC-${e.date.slice(0, 4)}-${pad(i + 1, 5)}` }))

  /* Prospects */
  const needs = ["Peinture façade immeuble R+4", "Rénovation intérieure villa", "Fourniture régulière pour revendeur", "Étanchéité toiture entrepôt", "Peinture locaux administratifs", "Chantier hôtel (chambres + couloirs)", "Sol époxy atelier", "Peinture école / centre de santé"]
  const prospects: Prospect[] = Array.from({ length: 46 }, (_, i) => {
    const isCompany = chance(0.7)
    const city = weighted(CITIES.map((c, idx) => [c, idx < 3 ? 6 - idx : 1] as [string, number]))
    const first = pick(chance(0.5) ? FIRST_M : FIRST_F)
    const last = pick(LAST)
    const name = isCompany ? `${pick(COMPANY_A)} ${pick(COMPANY_B)}` : `${first} ${last}`
    const created = randomDate(subMonths(today, 7), subDays(today, 1))
    const status = weighted<Prospect["status"]>([["nouveau", 3], ["contacte", 4], ["qualifie", 3], ["converti", 2], ["perdu", 1.5]])
    const lastContact = status === "nouveau" ? undefined : iso(randomDate(created, today))
    return {
      id: `pp${i + 1}`,
      code: `PRO-${pad(i + 1, 4)}`,
      type: isCompany ? "entreprise" : "particulier",
      name,
      contactName: `${first} ${last}`,
      phone: phone(),
      email: isCompany ? `info@${slug(name).replace(/\./g, "")}.cm` : `${slug(first)}.${slug(last)}@gmail.com`,
      city,
      segment: isCompany ? weighted([["btp", 5], ["revendeur", 3], ["administration", 1.5], ["hotellerie", 1.5]]) : "particulier",
      source: weighted<Prospect["source"]>([["terrain", 3], ["recommandation", 3], ["site_web", 2], ["reseaux_sociaux", 2], ["appel_entrant", 2], ["salon", 1], ["evenement", 1], ["campagne", 1.5]]),
      need: pick(needs),
      potential: round(int(300_000, 25_000_000), 50_000),
      status,
      ownerId: pick(commercials).id,
      createdAt: iso(created),
      lastContact,
      nextAction: status === "converti" || status === "perdu" ? undefined : pick(["Envoyer le catalogue", "Rappeler pour devis", "Visite du chantier", "Inviter à l'atelier couleurs", "Présenter les tarifs revendeur"]),
      lostReason: status === "perdu" ? pick(["Prix jugé trop élevé", "A choisi un concurrent", "Projet reporté", "Injoignable"]) : undefined,
    }
  })

  /* Relances (factures impayées, devis en attente, prospects) */
  const followups: Followup[] = []
  const addFollowup = (f: Omit<Followup, "id" | "createdAt">) =>
    followups.push({ ...f, id: `rl${followups.length + 1}`, createdAt: iso(subDays(today, int(1, 25))) })
  for (const inv of invoices.filter((x) => (x.status === "emise" || x.status === "partielle") && x.dueDate < iso(today)).slice(0, 30)) {
    const due = addDays(new Date(`${inv.dueDate}T00:00:00`), int(1, 20))
    const done = due < today && chance(0.45)
    addFollowup({
      targetType: "facture",
      targetId: inv.id,
      subject: `Relance paiement ${inv.number}`,
      channel: weighted([["appel", 3], ["email", 2], ["whatsapp", 2], ["sms", 1]]),
      priority: chance(0.4) ? "haute" : "normale",
      dueDate: iso(due > addDays(today, 10) ? addDays(today, int(0, 10)) : due),
      status: done ? "fait" : "a_faire",
      ownerId: clients.find((c) => c.id === inv.clientId)?.ownerId ?? pick(commercials).id,
      outcome: done ? pick(["Promesse de paiement sous 7 jours", "Paiement partiel annoncé", "Client injoignable, nouvel essai prévu"]) : undefined,
      doneAt: done ? iso(due) : undefined,
    })
  }
  for (const q of quotes.filter((x) => x.status === "envoye")) {
    const due = addDays(new Date(`${q.date}T00:00:00`), 7)
    const done = due < subDays(today, 3) && chance(0.5)
    addFollowup({
      targetType: "devis",
      targetId: q.id,
      subject: `Relance devis ${q.number}`,
      channel: weighted([["appel", 3], ["email", 2], ["visite", 1]]),
      priority: "normale",
      dueDate: iso(due),
      status: done ? "fait" : "a_faire",
      ownerId: q.ownerId,
      outcome: done ? pick(["Client en réflexion, rappeler la semaine prochaine", "Demande d'ajustement de prix", "Validation attendue de la direction"]) : undefined,
      doneAt: done ? iso(due) : undefined,
    })
  }
  for (const p of prospects.filter((x) => x.status !== "converti" && x.status !== "perdu")) {
    addFollowup({
      targetType: "prospect",
      targetId: p.id,
      subject: p.nextAction ?? "Reprendre contact",
      channel: weighted([["appel", 3], ["whatsapp", 2], ["visite", 1], ["email", 1]]),
      priority: p.potential > 10_000_000 ? "haute" : chance(0.2) ? "basse" : "normale",
      dueDate: iso(addDays(today, int(-6, 14))),
      status: chance(0.1) ? "reporte" : "a_faire",
      ownerId: p.ownerId,
    })
  }

  /* Rendez-vous */
  const rdvTitles: Record<Appointment["type"], string> = {
    visite_showroom: "Visite du showroom",
    visite_chantier: "Visite de chantier et métré",
    conseil_couleur: "Conseil couleurs et finitions",
    demonstration: "Démonstration pistolet airless",
    rendez_vous_commercial: "Présentation de l'offre",
    appel_video: "Appel vidéo — devis",
  }
  const rdvHosts = employees.filter((e) => ["commercial", "vendeur", "responsable_boutique", "marketing", "directeur_commercial"].includes(e.role))
  const appointments: Appointment[] = Array.from({ length: 64 }, (_, i) => {
    const type = weighted<Appointment["type"]>([["conseil_couleur", 3], ["visite_chantier", 3], ["rendez_vous_commercial", 3], ["visite_showroom", 2], ["demonstration", 1], ["appel_video", 1]])
    let day = addDays(today, int(-30, 30))
    if (isWeekend(day)) day = addDays(day, 2)
    const past = iso(day) < iso(today)
    const host = pick(rdvHosts)
    const withProspect = chance(0.35)
    const pr = pick(prospects)
    const cl = pick(activeClients)
    return {
      id: `rdv${i + 1}`,
      title: rdvTitles[type],
      type,
      clientId: withProspect ? undefined : cl.id,
      prospectId: withProspect ? pr.id : undefined,
      contactName: withProspect ? pr.contactName : cl.contactName,
      phone: withProspect ? pr.phone : cl.phone,
      date: iso(day),
      startTime: `${pad(int(8, 16), 2)}:${pick(["00", "30"])}`,
      durationMinutes: pick([30, 45, 60, 90, 120]),
      location: type === "visite_chantier" ? address(withProspect ? pr.city : cl.city) : type === "appel_video" ? "Visioconférence" : shops.find((s) => s.id === host.locationId)?.name ?? "Siège Douala",
      assignedTo: host.id,
      status: past ? weighted([["realise", 8], ["absent", 1], ["annule", 1], ["reporte", 0.5]]) : weighted([["planifie", 4], ["confirme", 4], ["reporte", 0.5]]),
      notes: chance(0.3) ? pick(["Apporter le nuancier", "Prévoir échantillons façade", "Client souhaite un devis sur place"]) : undefined,
      createdAt: iso(subDays(day, int(2, 20))),
    }
  })

  /* Séminaires, formations & ateliers */
  const eventDefs: [string, MarketingEvent["type"], MarketingEvent["audience"], number, number][] = [
    ["Formation applicateurs : façades durables", "formation", "artisans", -75, 30],
    ["Atelier tendances couleurs 2026", "atelier", "clients", -48, 25],
    ["Séminaire revendeurs Pardier", "seminaire", "revendeurs", -30, 60],
    ["Démonstration pistolet airless", "demonstration", "artisans", -12, 20],
    ["Formation interne : conseil client en boutique", "formation", "interne", -5, 18],
    ["Atelier décoration intérieure", "atelier", "grand_public", 6, 30],
    ["Formation étanchéité toitures", "formation", "artisans", 14, 24],
    ["Salon Promote — stand Pardier", "salon", "grand_public", 28, 400],
    ["Séminaire grands comptes BTP", "seminaire", "clients", 40, 50],
    ["Formation sécurité produits chimiques", "formation", "interne", 55, 25],
  ]
  const events: MarketingEvent[] = eventDefs.map(([title, type, audience, offset, capacity], i) => {
    const start = addDays(today, offset)
    const days = type === "salon" ? 4 : type === "seminaire" ? 2 : 1
    const end = addDays(start, days - 1)
    const past = iso(end) < iso(today)
    const fill = past ? 0.6 + rand() * 0.35 : offset < 20 ? 0.5 + rand() * 0.5 : rand() * 0.5
    const count = type === "salon" ? int(15, 40) : Math.min(capacity, Math.round(capacity * fill))
    const participants: EventParticipant[] = Array.from({ length: count }, (_, k) => {
      const viaClient = audience !== "interne" && audience !== "grand_public" && chance(0.6)
      const cl = pick(activeClients)
      const emp = pick(employees)
      const first = pick(chance(0.5) ? FIRST_M : FIRST_F)
      const last = pick(LAST)
      return {
        id: `ev${i + 1}p${k + 1}`,
        name: audience === "interne" ? `${emp.firstName} ${emp.lastName}` : viaClient ? cl.contactName : `${first} ${last}`,
        company: audience === "interne" ? "Isonem" : viaClient ? cl.name : chance(0.4) ? `${pick(COMPANY_A)} ${pick(COMPANY_B)}` : undefined,
        phone: phone(),
        email: chance(0.6) ? `${slug(first)}.${slug(last)}@gmail.com` : undefined,
        clientId: viaClient ? cl.id : undefined,
        status: past ? weighted([["present", 8], ["absent", 1.5], ["annule", 0.5]]) : weighted([["inscrit", 4], ["confirme", 3], ["annule", 0.4]]),
        registeredAt: iso(subDays(start, int(2, 30))),
      }
    })
    const budget = type === "salon" ? 3_500_000 : type === "seminaire" ? 1_500_000 : round(int(150_000, 600_000), 50_000)
    return {
      id: `ev${i + 1}`,
      title,
      type,
      audience,
      startDate: iso(start),
      endDate: iso(end),
      startTime: type === "salon" ? "09:00" : pick(["08:30", "09:00", "14:00"]),
      endTime: type === "salon" ? "19:00" : pick(["12:30", "17:00", "17:30"]),
      location: type === "salon" ? "Palais des Congrès, Yaoundé" : pick(["Showroom Douala Akwa", "Salle de formation — siège Bassa", "Boutique Yaoundé Mvan", "Hôtel Akwa Palace, Douala"]),
      trainerId: chance(0.7) ? pick(employees.filter((e) => ["technique", "marketing", "commercial"].includes(e.department))).id : undefined,
      externalSpeaker: chance(0.3) ? pick(["Expert technique Pardier Industries", "Formateur Sika Cameroun", "Architecte d'intérieur invité"]) : undefined,
      capacity,
      budget,
      cost: past ? Math.round(budget * (0.75 + rand() * 0.3)) : Math.round(budget * rand() * 0.4),
      fee: audience === "artisans" && type === "formation" ? 10_000 : 0,
      status: past ? "termine" : count >= capacity ? "complet" : offset < 45 ? "inscriptions" : "planifie",
      description: `${title}. Programme pratique animé par l'équipe Isonem, avec démonstrations et échanges.`,
      program: "Accueil · présentation produits · mise en pratique · questions/réponses · remise des attestations",
      participants,
      ownerId: pick(employees.filter((e) => e.role === "marketing")).id,
    }
  })

  /* Objectifs mensuels des boutiques (14 mois passés + 3 mois à venir) */
  const SEASON = [0.85, 0.9, 1, 1.05, 1.05, 1, 0.9, 0.9, 1, 1.05, 1.1, 1.25]
  const shopTargets: ShopTarget[] = []
  for (const shop of shops) {
    for (let d = start; d <= addMonths(startOfMonth(today), 3); d = addMonths(d, 1)) {
      const growth = 1 + (d.getFullYear() - start.getFullYear()) * 0.05
      shopTargets.push({
        id: `obj_${shop.id}_${format(d, "yyyy-MM")}`,
        shopId: shop.id,
        period: format(d, "yyyy-MM"),
        amount: round(shop.monthlyTarget * SEASON[d.getMonth()] * growth, 500_000),
      })
    }
  }

  /* Comptes utilisateurs, notifications, activité */
  const passwords: Record<string, string> = Object.fromEntries(employees.map((e) => [e.id, DEFAULT_PASSWORD]))
  const now = format(today, "yyyy-MM-dd'T'HH:mm")
  const notifications: AppNotification[] = [
    { id: "n1", date: now, title: "Stock bas", description: "Plusieurs références sont sous le seuil minimum.", module: "Stock", href: "/stock", read: false, tone: "warning" },
    { id: "n2", date: format(subDays(today, 1), "yyyy-MM-dd'T'09:12"), title: "Factures en retard", description: "Des factures ont dépassé leur échéance.", module: "Facturation", href: "/facturation", read: false, tone: "danger" },
    { id: "n3", date: format(subDays(today, 1), "yyyy-MM-dd'T'15:40"), title: "Demandes de congé", description: "De nouvelles demandes attendent votre validation.", module: "RH", href: "/rh/conges", read: false, tone: "info" },
    { id: "n4", date: format(subDays(today, 3), "yyyy-MM-dd'T'11:05"), title: "Campagne terminée", description: "Les résultats de la dernière campagne sont disponibles.", module: "Marketing", href: "/marketing", read: true, tone: "success" },
    { id: "n5", date: format(subDays(today, 4), "yyyy-MM-dd'T'08:30"), title: "Paie du mois", description: "Les bulletins du mois sont prêts à être validés.", module: "Paie", href: "/rh/paie", read: true, tone: "info" },
  ]
  const activity: ActivityLog[] = [
    { id: "a2", userId: "e1", date: format(subDays(today, 1), "yyyy-MM-dd'T'16:22"), action: "Validation", module: "Dépenses", details: "Dépense approuvée" },
    { id: "a3", userId: "e1", date: format(subDays(today, 2), "yyyy-MM-dd'T'10:02"), action: "Export", module: "Ventes", details: "Export Excel des ventes du mois" },
    { id: "a4", userId: "e1", date: format(subDays(today, 4), "yyyy-MM-dd'T'14:47"), action: "Modification", module: "Produits", details: "Mise à jour des prix de vente" },
  ]

  return {
    warehouses,
    shops,
    employees,
    categories,
    products,
    clients,
    opportunities,
    quotes,
    sales,
    invoices,
    payments,
    stockLevels,
    stockMovements,
    campaigns,
    promotions,
    attendance,
    leaves,
    payslips,
    expenses,
    journalEntries,
    shopTargets,
    prospects,
    followups,
    appointments,
    events,
    passwords,
    notifications,
    activity,
  }
}

export type SeedData = ReturnType<typeof generateSeed>
