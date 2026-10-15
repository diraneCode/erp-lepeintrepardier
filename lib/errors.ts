/**
 * Traduction des erreurs en messages lisibles par l'utilisateur.
 *
 * Règle : aucun détail technique (nom de table, contrainte, code SQL, trace,
 * message anglais de la base ou du réseau) n'est jamais affiché. Seuls les
 * messages métier rédigés en français dans les fonctions SQL (codes P0001,
 * P0002, 42501) sont repris, après vérification. Tout le reste est remplacé
 * par un message générique adapté. Le détail reste disponible dans la console.
 */

export const GENERIC_ERROR = "Une erreur est survenue. Réessayez ; si le problème persiste, contactez l'administrateur."
export const NETWORK_ERROR = "Connexion au serveur impossible. Vérifiez votre connexion internet puis réessayez."

type ErrorLike = { code?: string; message?: string; status?: number; name?: string; error_code?: string } | null | undefined

/** Messages connus par code (Postgres, PostgREST, Supabase Auth, HTTP). */
const BY_CODE: Record<string, string> = {
  // Postgres
  "23505": "Cette valeur existe déjà (code, numéro ou adresse e-mail en double).",
  "23503": "Cet élément est lié à d'autres données : l'opération est impossible.",
  "23502": "Une information obligatoire est manquante.",
  "23514": "Une valeur saisie n'est pas acceptée.",
  "22001": "Un texte saisi est trop long.",
  "22003": "Un nombre saisi est trop grand.",
  "22007": "Une date saisie est invalide.",
  "22008": "Une date saisie est invalide.",
  "22P02": "Une valeur saisie n'a pas le bon format.",
  "40001": "L'opération est entrée en conflit avec une autre modification. Réessayez.",
  "40P01": "L'opération est entrée en conflit avec une autre modification. Réessayez.",
  "57014": "Le serveur a mis trop de temps à répondre. Réessayez.",
  "53300": "Le serveur est momentanément surchargé. Réessayez dans un instant.",
  // PostgREST
  PGRST116: "Élément introuvable ou inaccessible.",
  PGRST301: "Votre session a expiré. Reconnectez-vous.",
  PGRST303: "Votre session a expiré. Reconnectez-vous.",
  // Supabase Auth
  invalid_credentials: "Adresse e-mail ou mot de passe incorrect.",
  email_not_confirmed: "Adresse e-mail non confirmée. Contactez l'administrateur.",
  user_banned: "Ce compte est désactivé. Contactez les ressources humaines.",
  user_not_found: "Compte introuvable.",
  same_password: "Le nouveau mot de passe doit être différent de l'actuel.",
  weak_password: "Mot de passe trop faible : choisissez-en un plus robuste.",
  over_request_rate_limit: "Trop de tentatives. Patientez quelques minutes avant de réessayer.",
  over_email_send_rate_limit: "Trop de tentatives. Patientez quelques minutes avant de réessayer.",
  session_expired: "Votre session a expiré. Reconnectez-vous.",
  session_not_found: "Votre session a expiré. Reconnectez-vous.",
  refresh_token_not_found: "Votre session a expiré. Reconnectez-vous.",
  email_exists: "Un compte existe déjà avec cette adresse e-mail.",
  user_already_exists: "Un compte existe déjà avec cette adresse e-mail.",
}

const BY_STATUS: Record<number, string> = {
  401: "Votre session a expiré. Reconnectez-vous.",
  403: "Action non autorisée pour votre profil.",
  404: "Élément introuvable ou inaccessible.",
  408: "Le serveur a mis trop de temps à répondre. Réessayez.",
  413: "Le fichier ou les données envoyés sont trop volumineux.",
  429: "Trop de tentatives. Patientez quelques minutes avant de réessayer.",
}

/** Indices d'un message technique (base de données, réseau, code, anglais). */
const TECHNICAL =
  /relation|column|constraint|violates|syntax|function|schema|null value|duplicate key|permission denied|row-level security|jwt|pgrst|postgres|sql|uuid|invalid input|operator|undefined|exception|stack|errno|econn|fetch|json|token|status code|\bat \w+ \(|https?:\/\/|\b(the|is|not|of|for|with|failed|error|cannot|could)\b/i

/** Message métier rédigé par nos fonctions SQL (français, sans jargon). */
function isBusinessMessage(message: string) {
  return message.length > 0 && message.length <= 200 && !TECHNICAL.test(message)
}

/** Met en forme une phrase : espaces normalisés, majuscule initiale, ponctuation finale. */
export function formatMessage(text: string) {
  const t = text.replace(/\s+/g, " ").trim()
  if (!t) return GENERIC_ERROR
  const capitalized = t.charAt(0).toLocaleUpperCase("fr-FR") + t.slice(1)
  return /[.!?…]$/.test(capitalized) ? capitalized : `${capitalized}.`
}

function isNetworkError(e: ErrorLike) {
  const msg = e?.message ?? ""
  return e?.name === "AuthRetryableFetchError" || /failed to fetch|networkerror|network request failed|load failed|fetch failed|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(msg)
}

/**
 * Message à afficher pour une erreur quelconque. `fallback` remplace le
 * message générique lorsqu'aucune explication précise n'est disponible.
 */
export function toUserMessage(error: unknown, fallback = GENERIC_ERROR): string {
  const e = (typeof error === "object" ? error : { message: String(error ?? "") }) as ErrorLike
  if (typeof navigator !== "undefined" && navigator.onLine === false) return NETWORK_ERROR
  if (isNetworkError(e)) return NETWORK_ERROR

  const code = e?.code ?? e?.error_code
  const message = (e?.message ?? "").trim()

  // Messages métier de nos fonctions SQL
  if ((code === "P0001" || code === "P0002") && isBusinessMessage(message)) return formatMessage(message)
  if (code === "42501") return isBusinessMessage(message) ? formatMessage(message) : "Action non autorisée pour votre profil."

  if (code && BY_CODE[code]) return BY_CODE[code]
  if (/invalid login credentials/i.test(message)) return BY_CODE.invalid_credentials
  if (/email not confirmed/i.test(message)) return BY_CODE.email_not_confirmed
  if (/already (been )?registered|already exists/i.test(message)) return BY_CODE.email_exists
  if (/rate limit/i.test(message)) return BY_CODE.over_request_rate_limit
  if (/jwt expired|session.*(expired|missing)/i.test(message)) return BY_CODE.session_expired

  const status = e?.status
  if (status && BY_STATUS[status]) return BY_STATUS[status]
  if (status && status >= 500) return "Le service est momentanément indisponible. Réessayez dans un instant."

  // Message déjà rédigé pour l'utilisateur (ex. renvoyé par notre API)
  if (!code && isBusinessMessage(message) && /[éèàùçêâîô]|^(le|la|les|un|une|ce|cet|cette|vous|votre|impossible|action|aucun)\b/i.test(message)) {
    return formatMessage(message)
  }
  return formatMessage(fallback)
}

/** Titre court du message d'erreur (affiché en gras au-dessus de l'explication). */
export function errorTitle(error: unknown): string {
  const message = toUserMessage(error)
  if (message === NETWORK_ERROR) return "Connexion impossible"
  if (/session a expiré/.test(message)) return "Session expirée"
  if (/non autorisée|Accès refusé|Seul un administrateur/.test(message)) return "Action non autorisée"
  if (/Trop de tentatives/.test(message)) return "Trop de tentatives"
  if (/indisponible|surchargé|trop de temps/.test(message)) return "Service indisponible"
  return "Opération impossible"
}
