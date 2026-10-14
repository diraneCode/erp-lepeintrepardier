import type { Role } from "@/lib/access"

/* ==========================================================================
   Modèle de données Le Peintre Pardier — toutes les dates sont au format ISO "yyyy-MM-dd"
   (ou "yyyy-MM-ddTHH:mm" pour les horodatages).
   ========================================================================== */

export type ID = string

export type PaymentMethod = "especes" | "mobile_money" | "carte" | "virement" | "cheque" | "credit"

export type LineSection = "traitement" | "main_oeuvre" | "accessoires"

export interface LineItem {
  /** Article du catalogue ; chaîne vide pour une ligne libre (service, accessoire non référencé…) */
  productId: ID
  /** Ligne saisie librement, sans article du catalogue */
  custom?: boolean
  description: string
  quantity: number
  unitPrice: number
  /** Remise en % */
  discount: number
  /** TVA en % */
  taxRate: number
  /** Proforma : rubrique de la ligne */
  section?: LineSection
  /** Proforma : spécificité technique */
  specification?: string
  /** Proforma : conditionnement (ex. 20 kg, 4 L) */
  packaging?: string
  /** Proforma : surface couverte par conditionnement (m²) */
  coverage?: number
  /** Proforma : surface à traiter (m²) */
  surface?: number
}

/** Évaluation des surfaces à traiter (en-tête de proforma) */
export interface SurfaceRow {
  designation: string
  quantity: number
  unit: string
  treatment: string
  commercialName: string
}

/* ---------- Gestion commerciale ---------- */

export type ClientStatus = "actif" | "inactif"
export type ClientSegment = "btp" | "particulier" | "revendeur" | "administration" | "hotellerie"

export interface Client {
  id: ID
  code: string
  type: "entreprise" | "particulier"
  name: string
  contactName: string
  email: string
  phone: string
  city: string
  address: string
  segment: ClientSegment
  status: ClientStatus
  ownerId: ID
  creditLimit: number
  createdAt: string
  notes?: string
}

export type OpportunityStage = "prospection" | "qualification" | "proposition" | "negociation" | "gagnee" | "perdue"

export interface Opportunity {
  id: ID
  title: string
  clientId: ID
  amount: number
  stage: OpportunityStage
  probability: number
  expectedClose: string
  ownerId: ID
  source: "recommandation" | "site_web" | "salon" | "appel_entrant" | "terrain" | "reseaux_sociaux"
  createdAt: string
  notes?: string
}

/* ---------- Prospects & relances ---------- */

export type ProspectStatus = "nouveau" | "contacte" | "qualifie" | "converti" | "perdu"
export type LeadSource = "recommandation" | "site_web" | "salon" | "appel_entrant" | "terrain" | "reseaux_sociaux" | "evenement" | "campagne"

export interface Prospect {
  id: ID
  code: string
  type: "entreprise" | "particulier"
  name: string
  contactName: string
  phone: string
  email: string
  city: string
  segment: ClientSegment
  source: LeadSource
  /** Besoin exprimé */
  need: string
  /** Potentiel estimé (CA annuel) */
  potential: number
  status: ProspectStatus
  ownerId: ID
  createdAt: string
  lastContact?: string
  nextAction?: string
  lostReason?: string
  /** Client créé lors de la conversion */
  clientId?: ID
}

export type FollowupTarget = "prospect" | "client" | "devis" | "facture"
export type FollowupChannel = "appel" | "email" | "sms" | "whatsapp" | "visite"
export type FollowupStatus = "a_faire" | "fait" | "reporte" | "annule"

export interface Followup {
  id: ID
  targetType: FollowupTarget
  /** Identifiant du prospect, client, devis ou facture relancé */
  targetId: ID
  subject: string
  channel: FollowupChannel
  priority: "haute" | "normale" | "basse"
  dueDate: string
  status: FollowupStatus
  ownerId: ID
  notes?: string
  outcome?: string
  doneAt?: string
  createdAt: string
}

export type QuoteStatus = "brouillon" | "envoye" | "accepte" | "refuse" | "expire"

export interface Quote {
  id: ID
  number: string
  clientId: ID
  date: string
  validUntil: string
  items: LineItem[]
  status: QuoteStatus
  ownerId: ID
  notes?: string
  invoiceId?: ID
  /** Intitulé du projet (ex. Traitement parking) */
  project?: string
  /** Lieu du chantier */
  site?: string
  /** Ville d'émission (« Douala, le … ») */
  issuedIn?: string
  surfaces?: SurfaceRow[]
}

/* ---------- Ventes & facturation ---------- */

export type SaleStatus = "brouillon" | "confirmee" | "livree" | "annulee"
export type SaleChannel = "boutique" | "telephone" | "chantier" | "en_ligne"

export interface Sale {
  id: ID
  number: string
  date: string
  clientId: ID | null
  boutiqueId: ID
  sellerId: ID
  items: LineItem[]
  paymentMethod: PaymentMethod
  status: SaleStatus
  channel: SaleChannel
  invoiceId?: ID
  notes?: string
}

export type InvoiceStatus = "brouillon" | "emise" | "partielle" | "payee" | "en_retard" | "annulee"

export interface Invoice {
  id: ID
  number: string
  clientId: ID
  boutiqueId: ID
  date: string
  dueDate: string
  items: LineItem[]
  /** Statut saisi ; "en_retard" est dérivé de l'échéance (voir invoiceStatus). */
  status: Exclude<InvoiceStatus, "en_retard">
  amountPaid: number
  saleId?: ID
  quoteId?: ID
  notes?: string
}

export interface Payment {
  id: ID
  invoiceId: ID
  date: string
  amount: number
  method: PaymentMethod
  reference: string
}

/* ---------- Produits, stock, magasins, boutiques ---------- */

export interface Category {
  id: ID
  name: string
  description: string
  color: string
}

export type ProductUnit = "pot_1l" | "pot_4l" | "seau_20l" | "sac_25kg" | "piece" | "rouleau" | "kg" | "litre" | "m2"

export interface Product {
  id: ID
  sku: string
  name: string
  categoryId: ID
  brand: string
  unit: ProductUnit
  purchasePrice: number
  salePrice: number
  taxRate: number
  minStock: number
  status: "actif" | "inactif"
  /** Code-barres EAN (facultatif) */
  barcode?: string
  supplier: string
  /** Prix de vente HT promotionnel (facultatif), appliqué en caisse s'il est renseigné */
  promoPrice?: number
  /** Fin de validité du prix promotionnel (incluse) */
  promoEndDate?: string
  /** Conditionnement libre affiché sur les proformas (ex. 20 kg, 4,5 kg) */
  packaging?: string
  /** Spécificité technique affichée sur les proformas (ex. Résine époxy transparente) */
  specification?: string
  /** Surface couverte par conditionnement, en m² (sert au calcul des quantités) */
  coverage?: number
  /** Date de péremption du lot en stock (facultative : outillage, accessoires…) */
  expiryDate?: string
  description?: string
  createdAt: string
}

export interface Warehouse {
  id: ID
  code: string
  name: string
  type: "entrepot" | "depot"
  city: string
  address: string
  managerId: ID
  phone: string
  capacity: number
  status: "actif" | "inactif" | "maintenance"
  createdAt: string
}

export interface Shop {
  id: ID
  code: string
  name: string
  city: string
  address: string
  managerId: ID
  phone: string
  openingHours: string
  monthlyTarget: number
  supplyWarehouseId: ID
  status: "ouverte" | "fermee" | "travaux"
  openedAt: string
}

/** Objectif de chiffre d'affaires TTC d'une boutique pour un mois donné */
export interface ShopTarget {
  id: ID
  shopId: ID
  /** "yyyy-MM" */
  period: string
  amount: number
}

export interface StockLevel {
  id: ID
  productId: ID
  /** Identifiant d'un entrepôt ou d'une boutique */
  locationId: ID
  quantity: number
}

export type StockMovementType = "entree" | "sortie" | "transfert" | "ajustement"

export interface StockMovement {
  id: ID
  date: string
  productId: ID
  type: StockMovementType
  quantity: number
  fromLocationId?: ID
  toLocationId?: ID
  reason: string
  reference: string
  userId: ID
}

/* ---------- Marketing ---------- */

export type CampaignChannel = "sms" | "email" | "facebook" | "whatsapp" | "radio" | "affichage"
export type CampaignStatus = "brouillon" | "planifiee" | "en_cours" | "suspendue" | "terminee"

export interface Campaign {
  id: ID
  name: string
  channel: CampaignChannel
  status: CampaignStatus
  segment: ClientSegment | "tous"
  startDate: string
  endDate: string
  budget: number
  spent: number
  reach: number
  leads: number
  conversions: number
  revenue: number
  ownerId: ID
  description?: string
}

export type AppointmentType = "visite_showroom" | "visite_chantier" | "conseil_couleur" | "demonstration" | "rendez_vous_commercial" | "appel_video"
export type AppointmentStatus = "planifie" | "confirme" | "realise" | "reporte" | "annule" | "absent"

export interface Appointment {
  id: ID
  title: string
  type: AppointmentType
  /** Client ou prospect concerné (facultatif pour un contact libre) */
  clientId?: ID
  prospectId?: ID
  contactName: string
  phone: string
  date: string
  /** "HH:mm" */
  startTime: string
  durationMinutes: number
  location: string
  assignedTo: ID
  status: AppointmentStatus
  notes?: string
  createdAt: string
}

export type EventType = "formation" | "seminaire" | "atelier" | "demonstration" | "salon"
export type EventStatus = "planifie" | "inscriptions" | "complet" | "termine" | "annule"
export type ParticipantStatus = "inscrit" | "confirme" | "present" | "absent" | "annule"

export interface EventParticipant {
  id: ID
  name: string
  company?: string
  phone: string
  email?: string
  clientId?: ID
  status: ParticipantStatus
  registeredAt: string
}

export interface MarketingEvent {
  id: ID
  title: string
  type: EventType
  /** Public visé : clients, artisans peintres, revendeurs, équipe interne… */
  audience: "clients" | "artisans" | "revendeurs" | "interne" | "grand_public"
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  location: string
  /** Animateur interne (employé) ou intervenant externe */
  trainerId?: ID
  externalSpeaker?: string
  capacity: number
  budget: number
  cost: number
  /** Frais d'inscription par participant (0 = gratuit) */
  fee: number
  status: EventStatus
  description: string
  program?: string
  participants: EventParticipant[]
  ownerId: ID
}

export interface Promotion {
  id: ID
  code: string
  name: string
  type: "pourcentage" | "montant"
  value: number
  minAmount: number
  categoryId: ID | null
  startDate: string
  endDate: string
  usageCount: number
  usageLimit: number
  active: boolean
}

/* ---------- Ressources humaines ---------- */

export type Department =
  | "direction"
  | "commercial"
  | "logistique"
  | "comptabilite"
  | "rh"
  | "marketing"
  | "boutique"
  | "technique"

export type ContractType = "cdi" | "cdd" | "stage" | "interim"
export type EmployeeStatus = "actif" | "conge" | "suspendu" | "sorti"

/** Fichier joint (le contenu est stocké dans IndexedDB, voir lib/files.ts) */
export interface StoredFile {
  id: ID
  name: string
  type: string
  size: number
  uploadedAt: string
}

export type EmployeeDocumentKind = "photo" | "cni" | "cv" | "plan" | "diplome"

export interface EmergencyContact {
  name: string
  relation: string
  phone: string
}

export interface Employee {
  id: ID
  matricule: string
  firstName: string
  lastName: string
  gender: "H" | "F"
  email: string
  phone: string
  /** Facultative */
  birthDate?: string
  hireDate: string
  department: Department
  position: string
  contractType: ContractType
  baseSalary: number
  locationId: ID
  status: EmployeeStatus
  cnpsNumber: string
  /** Facultatif */
  bankAccount?: string
  address: string
  maritalStatus: "celibataire" | "marie" | "divorce" | "veuf"
  /** Enfants à charge (facultatif) */
  children?: number
  /** Photo, CNI, CV, plan de localisation, dernier diplôme */
  documents?: Partial<Record<EmployeeDocumentKind, StoredFile>>
  emergencyContact?: EmergencyContact
  /** Rôle applicatif : détermine les modules et données accessibles */
  role: Role
}

export type AttendanceStatus = "present" | "retard" | "absent" | "conge" | "mission"

export interface Attendance {
  id: ID
  employeeId: ID
  date: string
  checkIn: string | null
  checkOut: string | null
  breakMinutes: number
  status: AttendanceStatus
  note?: string
}

export type LeaveType = "annuel" | "maladie" | "maternite" | "sans_solde" | "exceptionnel" | "recuperation"
export type LeaveStatus = "en_attente" | "approuve" | "refuse" | "annule"

export interface Leave {
  id: ID
  employeeId: ID
  type: LeaveType
  startDate: string
  endDate: string
  days: number
  reason: string
  status: LeaveStatus
  requestedAt: string
  approverId?: ID
  comment?: string
}

export type PayslipStatus = "brouillon" | "valide" | "paye"

export interface Payslip {
  id: ID
  employeeId: ID
  /** "yyyy-MM" */
  period: string
  baseSalary: number
  overtime: number
  bonuses: number
  transportAllowance: number
  housingAllowance: number
  otherDeductions: number
  status: PayslipStatus
  paidAt?: string
}

/* ---------- Finance ---------- */

export type ExpenseCategory =
  | "loyer"
  | "transport"
  | "fournitures"
  | "marketing"
  | "maintenance"
  | "energie"
  | "telecom"
  | "impots"
  | "achats"
  | "autres"

export type ExpenseStatus = "en_attente" | "approuvee" | "rejetee" | "payee"

export interface Expense {
  id: ID
  number: string
  date: string
  category: ExpenseCategory
  description: string
  supplier: string
  amount: number
  paymentMethod: PaymentMethod
  locationId: ID
  status: ExpenseStatus
  submittedBy: ID
  approvedBy?: ID
  hasReceipt: boolean
}

export type JournalCode = "VE" | "AC" | "BQ" | "CA" | "OD" | "PA"

export interface Account {
  code: string
  name: string
  class: number
}

export interface JournalLine {
  account: string
  label: string
  debit: number
  credit: number
}

export interface JournalEntry {
  id: ID
  number: string
  date: string
  journal: JournalCode
  label: string
  reference: string
  lines: JournalLine[]
  status: "brouillon" | "valide"
}

/* ---------- Compte ---------- */

export interface ActivityLog {
  id: ID
  userId: ID
  date: string
  action: string
  module: string
  details: string
}

export interface AppNotification {
  id: ID
  date: string
  title: string
  description: string
  module: string
  href: string
  read: boolean
  tone: "info" | "success" | "warning" | "danger"
}
