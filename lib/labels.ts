import type {
  AppointmentStatus,
  AppointmentType,
  AttendanceStatus,
  EventStatus,
  EventType,
  FollowupChannel,
  FollowupStatus,
  FollowupTarget,
  LeadSource,
  ParticipantStatus,
  ProspectStatus,
  CampaignChannel,
  CampaignStatus,
  ClientSegment,
  ClientStatus,
  ContractType,
  Department,
  EmployeeStatus,
  ExpenseCategory,
  ExpenseStatus,
  InvoiceStatus,
  JournalCode,
  LeaveStatus,
  LeaveType,
  OpportunityStage,
  PaymentMethod,
  PayslipStatus,
  ProductUnit,
  QuoteStatus,
  SaleChannel,
  SaleStatus,
  StockMovementType,
} from "@/lib/types"

export type Tone = "success" | "warning" | "info" | "destructive" | "violet" | "neutral"

export interface LabelDef {
  label: string
  tone: Tone
}

type LabelMap<K extends string> = Record<K, LabelDef>

export function toOptions<K extends string>(map: Record<K, LabelDef | string>) {
  return (Object.keys(map) as K[]).map((value) => {
    const def = map[value]
    return { value, label: typeof def === "string" ? def : def.label }
  })
}

export const clientStatus: LabelMap<ClientStatus> = {
  actif: { label: "Actif", tone: "success" },
  inactif: { label: "Inactif", tone: "neutral" },
}

export const clientSegment: Record<ClientSegment, string> = {
  btp: "BTP & entreprises",
  particulier: "Particulier",
  revendeur: "Revendeur",
  administration: "Administration",
  hotellerie: "Hôtellerie",
}

export const opportunityStage: LabelMap<OpportunityStage> = {
  prospection: { label: "Prospection", tone: "neutral" },
  qualification: { label: "Qualification", tone: "info" },
  proposition: { label: "Proposition", tone: "violet" },
  negociation: { label: "Négociation", tone: "warning" },
  gagnee: { label: "Gagnée", tone: "success" },
  perdue: { label: "Perdue", tone: "destructive" },
}

export const opportunitySource: Record<string, string> = {
  recommandation: "Recommandation",
  site_web: "Site web",
  salon: "Salon / foire",
  appel_entrant: "Appel entrant",
  terrain: "Prospection terrain",
  reseaux_sociaux: "Réseaux sociaux",
}

export const quoteStatus: LabelMap<QuoteStatus> = {
  brouillon: { label: "Brouillon", tone: "neutral" },
  envoye: { label: "Envoyé", tone: "info" },
  accepte: { label: "Accepté", tone: "success" },
  refuse: { label: "Refusé", tone: "destructive" },
  expire: { label: "Expiré", tone: "warning" },
}

export const saleStatus: LabelMap<SaleStatus> = {
  brouillon: { label: "Brouillon", tone: "neutral" },
  confirmee: { label: "Confirmée", tone: "info" },
  livree: { label: "Livrée", tone: "success" },
  annulee: { label: "Annulée", tone: "destructive" },
}

export const saleChannel: Record<SaleChannel, string> = {
  boutique: "Boutique",
  telephone: "Téléphone",
  chantier: "Chantier",
  en_ligne: "En ligne",
}

export const invoiceStatus: LabelMap<InvoiceStatus> = {
  brouillon: { label: "Brouillon", tone: "neutral" },
  emise: { label: "Émise", tone: "info" },
  partielle: { label: "Partielle", tone: "violet" },
  payee: { label: "Payée", tone: "success" },
  en_retard: { label: "En retard", tone: "destructive" },
  annulee: { label: "Annulée", tone: "neutral" },
}

export const paymentMethod: Record<PaymentMethod, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  carte: "Carte bancaire",
  virement: "Virement",
  cheque: "Chèque",
  credit: "À crédit",
}

export const productUnit: Record<ProductUnit, string> = {
  pot_1l: "Pot 1 L",
  pot_4l: "Pot 4 L",
  seau_20l: "Seau 20 L",
  sac_25kg: "Sac 25 kg",
  piece: "Pièce",
  rouleau: "Rouleau",
  kg: "Kg",
  litre: "Litre",
  m2: "m²",
}

export const movementType: LabelMap<StockMovementType> = {
  entree: { label: "Entrée", tone: "success" },
  sortie: { label: "Sortie", tone: "destructive" },
  transfert: { label: "Transfert", tone: "info" },
  ajustement: { label: "Ajustement", tone: "warning" },
}

export const campaignChannel: Record<CampaignChannel, string> = {
  sms: "SMS",
  email: "E-mail",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  radio: "Radio",
  affichage: "Affichage",
}

export const campaignStatus: LabelMap<CampaignStatus> = {
  brouillon: { label: "Brouillon", tone: "neutral" },
  planifiee: { label: "Planifiée", tone: "info" },
  en_cours: { label: "En cours", tone: "violet" },
  suspendue: { label: "Suspendue", tone: "warning" },
  terminee: { label: "Terminée", tone: "success" },
}

export const department: Record<Department, string> = {
  direction: "Direction",
  commercial: "Commercial",
  logistique: "Logistique",
  comptabilite: "Comptabilité",
  rh: "Ressources humaines",
  marketing: "Marketing",
  boutique: "Boutiques",
  technique: "Technique / chantiers",
}

export const contractType: Record<ContractType, string> = {
  cdi: "CDI",
  cdd: "CDD",
  stage: "Stage",
  interim: "Intérim",
}

export const employeeStatus: LabelMap<EmployeeStatus> = {
  actif: { label: "Actif", tone: "success" },
  conge: { label: "En congé", tone: "info" },
  suspendu: { label: "Suspendu", tone: "warning" },
  sorti: { label: "Sorti", tone: "neutral" },
}

export const attendanceStatus: LabelMap<AttendanceStatus> = {
  present: { label: "Présent", tone: "success" },
  retard: { label: "Retard", tone: "warning" },
  absent: { label: "Absent", tone: "destructive" },
  conge: { label: "Congé", tone: "info" },
  mission: { label: "Mission", tone: "violet" },
}

export const leaveType: Record<LeaveType, string> = {
  annuel: "Congé annuel",
  maladie: "Maladie",
  maternite: "Maternité / paternité",
  sans_solde: "Sans solde",
  exceptionnel: "Exceptionnel",
  recuperation: "Récupération",
}

export const leaveStatus: LabelMap<LeaveStatus> = {
  en_attente: { label: "En attente", tone: "warning" },
  approuve: { label: "Approuvé", tone: "success" },
  refuse: { label: "Refusé", tone: "destructive" },
  annule: { label: "Annulé", tone: "neutral" },
}

export const payslipStatus: LabelMap<PayslipStatus> = {
  brouillon: { label: "Brouillon", tone: "neutral" },
  valide: { label: "Validé", tone: "info" },
  paye: { label: "Payé", tone: "success" },
}

export const expenseCategory: Record<ExpenseCategory, string> = {
  loyer: "Loyer",
  transport: "Transport & carburant",
  fournitures: "Fournitures",
  marketing: "Marketing",
  maintenance: "Maintenance",
  energie: "Électricité & eau",
  telecom: "Télécom & internet",
  impots: "Impôts & taxes",
  achats: "Achats marchandises",
  autres: "Autres",
}

export const expenseStatus: LabelMap<ExpenseStatus> = {
  en_attente: { label: "En attente", tone: "warning" },
  approuvee: { label: "Approuvée", tone: "info" },
  rejetee: { label: "Rejetée", tone: "destructive" },
  payee: { label: "Payée", tone: "success" },
}

export const journalCode: Record<JournalCode, string> = {
  VE: "Ventes",
  AC: "Achats",
  BQ: "Banque",
  CA: "Caisse",
  OD: "Opérations diverses",
  PA: "Paie",
}

export const maritalStatus: Record<string, string> = {
  celibataire: "Célibataire",
  marie: "Marié(e)",
  divorce: "Divorcé(e)",
  veuf: "Veuf / veuve",
}

export const CITIES = ["Douala", "Yaoundé", "Bafoussam", "Garoua", "Kribi", "Limbé", "Buea", "Bamenda", "Bertoua", "Ebolowa", "Maroua", "Ngaoundéré"]
export const cityOptions = CITIES.map((c) => ({ value: c, label: c }))

/* ---------- Prospects & relances ---------- */

export const prospectStatus: LabelMap<ProspectStatus> = {
  nouveau: { label: "Nouveau", tone: "info" },
  contacte: { label: "Contacté", tone: "violet" },
  qualifie: { label: "Qualifié", tone: "warning" },
  converti: { label: "Converti en client", tone: "success" },
  perdu: { label: "Perdu", tone: "neutral" },
}

export const leadSource: Record<LeadSource, string> = {
  recommandation: "Recommandation",
  site_web: "Site web",
  salon: "Salon / foire",
  appel_entrant: "Appel entrant",
  terrain: "Prospection terrain",
  reseaux_sociaux: "Réseaux sociaux",
  evenement: "Séminaire / atelier",
  campagne: "Campagne marketing",
}

export const followupTarget: Record<FollowupTarget, string> = {
  prospect: "Prospect",
  client: "Client",
  devis: "Devis",
  facture: "Facture impayée",
}

export const followupChannel: Record<FollowupChannel, string> = {
  appel: "Appel",
  email: "E-mail",
  sms: "SMS",
  whatsapp: "WhatsApp",
  visite: "Visite",
}

export const followupStatus: LabelMap<FollowupStatus> = {
  a_faire: { label: "À faire", tone: "warning" },
  fait: { label: "Effectuée", tone: "success" },
  reporte: { label: "Reportée", tone: "info" },
  annule: { label: "Annulée", tone: "neutral" },
}

export const priorityLabel: LabelMap<"haute" | "normale" | "basse"> = {
  haute: { label: "Haute", tone: "destructive" },
  normale: { label: "Normale", tone: "neutral" },
  basse: { label: "Basse", tone: "info" },
}

/* ---------- Rendez-vous & événements ---------- */

export const appointmentType: Record<AppointmentType, string> = {
  visite_showroom: "Visite showroom",
  visite_chantier: "Visite de chantier",
  conseil_couleur: "Conseil couleur",
  demonstration: "Démonstration produit",
  rendez_vous_commercial: "Rendez-vous commercial",
  appel_video: "Appel vidéo",
}

export const appointmentStatus: LabelMap<AppointmentStatus> = {
  planifie: { label: "Planifié", tone: "info" },
  confirme: { label: "Confirmé", tone: "violet" },
  realise: { label: "Réalisé", tone: "success" },
  reporte: { label: "Reporté", tone: "warning" },
  annule: { label: "Annulé", tone: "neutral" },
  absent: { label: "Absent", tone: "destructive" },
}

export const eventType: Record<EventType, string> = {
  formation: "Formation",
  seminaire: "Séminaire",
  atelier: "Atelier pratique",
  demonstration: "Démonstration",
  salon: "Salon / foire",
}

export const eventAudience: Record<string, string> = {
  clients: "Clients",
  artisans: "Artisans peintres",
  revendeurs: "Revendeurs",
  interne: "Équipe interne",
  grand_public: "Grand public",
}

export const eventStatus: LabelMap<EventStatus> = {
  planifie: { label: "Planifié", tone: "neutral" },
  inscriptions: { label: "Inscriptions ouvertes", tone: "info" },
  complet: { label: "Complet", tone: "warning" },
  termine: { label: "Terminé", tone: "success" },
  annule: { label: "Annulé", tone: "destructive" },
}

export const participantStatus: LabelMap<ParticipantStatus> = {
  inscrit: { label: "Inscrit", tone: "info" },
  confirme: { label: "Confirmé", tone: "violet" },
  present: { label: "Présent", tone: "success" },
  absent: { label: "Absent", tone: "destructive" },
  annule: { label: "Désisté", tone: "neutral" },
}

/* ---------- Postes ---------- */

/** Postes disponibles : le poste détermine directement le rôle d'accès et le service. */
export const POSITIONS: { label: string; department: import("@/lib/types").Department; role: import("@/lib/access").Role }[] = [
  { label: "Caissière", department: "boutique", role: "caissiere" },
  { label: "Gestionnaire de stock", department: "logistique", role: "gestionnaire_stock" },
  { label: "Commercial(e)", department: "commercial", role: "commercial" },
  { label: "Magasinier", department: "logistique", role: "magasinier" },
]
