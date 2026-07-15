export type Messages = {
  appTitle: string
  appSubtitle: string
  login: string
  loginTitle: string
  loginDesc: string
  welcomeTitle: string
  forgotPassword: string
  forgotTitle: string
  forgotDesc: string
  forgotSubmit: string
  forgotEmailHint: string
  forgotEmailRequired: string
  forgotSentTitle: string
  forgotSentDesc: string
  backToLogin: string
  loginLegal: string
  email: string
  password: string
  submit: string
  logout: string
  notes: string
  notesDesc: string
  createNote: string
  title: string
  body: string
  delete: string
  keys: string
  keysDesc: string
  mintKey: string
  mintKeyDesc: string
  copyKey: string
  keyOnce: string
  settings: string
  settingsDesc: string
  appearance: string
  themeLight: string
  themeDark: string
  themeSystem: string
  language: string
  me: string
  sendEmail: string
  emailSent: string
  mailpit: string
  health: string
  empty: string
  error: string
  loadFailed: string
  retry: string
  dashboard: string
  session: string
  authMethod: string
  loading: string
  save: string
  cancel: string
  confirmDelete: string
  noteCreated: string
  noteDeleted: string
  keyMinted: string
  keyRevoked: string
  keysList: string
  emptyKeys: string
  revokeKey: string
  confirmRevoke: string
  bearerTitle: string
  bearerDesc: string
  bearerHelp: string
  bearerSessionNote: string
  copied: string
  navDashboard: string
  navNotes: string
  navKeys: string
  navSettings: string
  navDesignSystem: string
  navPlatform: string
  navSecondary: string
  online: string
  offline: string
  account: string
  designSystem: string
  designSystemDesc: string
  designSystemFooter: string
  dsFoundations: string
  dsFoundationsDesc: string
  dsForms: string
  dsFeedback: string
  dsOverlays: string
  dsData: string
  dsTemplates: string
  dsTemplatesDesc: string
  dsOnThisPage: string
  forbidden: string
  forbiddenDesc: string
  /** Stable ErrorCode → UI copy (API codes stay English; FE translates). */
  errUnauthorized: string
  errForbidden: string
  errNotFound: string
  errValidation: string
  errConflict: string
  errInternal: string
  errRateLimited: string
  errEmailInvalid: string
  errPasswordRequired: string
  errTitleRequired: string
  errSupportCta: string
  errPageTitle: string
  feedbackTrigger: string
  feedbackTitle: string
  feedbackSuccess: string
  feedbackSuccessSub: string
  feedbackHint: string
  feedbackTypeBug: string
  feedbackTypeFeature: string
  feedbackPriorityUrgent: string
  feedbackPriorityNormal: string
  feedbackPriorityLater: string
  feedbackTitlePlaceholderBug: string
  feedbackTitlePlaceholderFeature: string
  feedbackBodyPlaceholder: string
  feedbackAddCapture: string
  feedbackRemoveImage: string
  feedbackClose: string
  feedbackSend: string
  feedbackSending: string
  feedbackTitleRequired: string
  feedbackSendFailed: string
}

export const fr: Messages = {
  appTitle: 'GOSILEX Kit',
  appSubtitle: 'example-web · starter SaaS',
  login: 'Connexion',
  loginTitle: 'Connexion',
  loginDesc: 'Session cookie HttpOnly · credentials include',
  welcomeTitle: 'Bienvenue sur GOSILEX Kit',
  forgotPassword: 'Mot de passe oublié ?',
  forgotTitle: 'Réinitialiser le mot de passe',
  forgotDesc: 'Entrez votre e-mail — nous enverrons un lien de réinitialisation (bientôt).',
  forgotSubmit: 'Envoyer le lien',
  forgotEmailHint: 'UI prête ; l’envoi réel arrive avec Better Auth (M3).',
  forgotEmailRequired: 'E-mail requis',
  forgotSentTitle: 'Demande enregistrée',
  forgotSentDesc: 'Si un compte existe, un e-mail sera envoyé (stub démo pour l’instant).',
  backToLogin: 'Retour à la connexion',
  loginLegal: 'En continuant, vous acceptez les conditions d’utilisation du kit démo.',
  email: 'E-mail',
  password: 'Mot de passe',
  submit: 'Se connecter',
  logout: 'Déconnexion',
  notes: 'Notes',
  notesDesc: 'CRUD démo (D1 + pièces jointes R2 optionnelles)',
  createNote: 'Créer une note',
  title: 'Titre',
  body: 'Corps',
  delete: 'Supprimer',
  keys: 'Clés API',
  keysDesc: 'Mint une clé sk_ pour MCP / machine auth',
  mintKey: 'Générer une clé',
  mintKeyDesc: 'La clé en clair n’est affichée qu’une fois.',
  copyKey: 'Copier',
  keyOnce: 'Copiez-la maintenant — elle ne sera plus visible.',
  settings: 'Paramètres',
  settingsDesc: 'Thème, langue et compte démo',
  appearance: 'Apparence',
  themeLight: 'Clair',
  themeDark: 'Sombre',
  themeSystem: 'Système',
  language: 'Langue',
  me: 'Compte',
  sendEmail: 'Envoyer e-mail démo',
  emailSent: 'E-mail démo envoyé (voir Mailpit :8025)',
  mailpit: 'Mailpit',
  health: 'API',
  empty: 'Aucune note pour l’instant',
  error: 'Erreur',
  loadFailed: 'Chargement impossible',
  retry: 'Réessayer',
  dashboard: 'Tableau de bord',
  session: 'Session',
  authMethod: 'Méthode',
  loading: 'Chargement…',
  save: 'Enregistrer',
  cancel: 'Annuler',
  confirmDelete: 'Supprimer cette note ?',
  noteCreated: 'Note créée',
  noteDeleted: 'Note supprimée',
  keyMinted: 'Clé API générée',
  keyRevoked: 'Clé révoquée',
  keysList: 'Clés actives',
  emptyKeys: 'Aucune clé active',
  revokeKey: 'Révoquer',
  confirmRevoke: 'Révoquer cette clé API ? Elle ne pourra plus être utilisée.',
  bearerTitle: 'Bearer',
  bearerDesc: 'Authorization: Bearer sk_…',
  bearerHelp:
    'Les clients MCP / machine appellent la même API Hono avec une clé sk_ mintée ici (session uniquement).',
  bearerSessionNote: 'Les sessions UI restent en cookies HttpOnly — pas de clé d’équipe partagée.',
  copied: 'Copié dans le presse-papiers',
  navDashboard: 'Dashboard',
  navNotes: 'Notes',
  navKeys: 'Clés API',
  navSettings: 'Paramètres',
  navDesignSystem: 'Design system',
  navPlatform: 'Plateforme',
  navSecondary: 'Plus',
  online: 'API OK',
  offline: 'API hors ligne',
  account: 'Compte',
  designSystem: 'Design system',
  designSystemDesc:
    'Catalogue shadcn Base (base-nova) · réservé admin · templates de page de référence',
  designSystemFooter: '100 % composants @gosilex/ui (registry shadcn + @base-ui/react)',
  dsFoundations: 'Fondations',
  dsFoundationsDesc: 'Tokens couleur, typo, radius (CSS variables shadcn)',
  dsForms: 'Formulaires',
  dsFeedback: 'Feedback',
  dsOverlays: 'Overlays',
  dsData: 'Data display',
  dsTemplates: 'Templates de page',
  dsTemplatesDesc: 'Motifs d’écran SaaS réutilisables (auth, empty, settings, KPI, liste)',
  dsOnThisPage: 'Sur cette page',
  forbidden: 'Accès refusé',
  forbiddenDesc: 'Cette page est réservée aux administrateurs.',
  errUnauthorized: 'Session expirée ou non authentifié',
  errForbidden: 'Action non autorisée',
  errNotFound: 'Ressource introuvable',
  errValidation: 'Données invalides',
  errConflict: 'Conflit — ressource déjà existante',
  errInternal: 'Erreur interne — réessayez plus tard',
  errRateLimited: 'Trop de requêtes — patientez un moment',
  errEmailInvalid: 'Adresse e-mail invalide',
  errPasswordRequired: 'Mot de passe requis',
  errTitleRequired: 'Titre requis',
  errSupportCta: 'Contacter le support',
  errPageTitle: 'Une erreur est survenue',
  feedbackTrigger: 'Signaler',
  feedbackTitle: 'Signaler un bug ou une idée',
  feedbackSuccess: 'Merci ! Signalement envoyé.',
  feedbackSuccessSub: "L'équipe le retrouve dans le Pilotage Spark.",
  feedbackHint: 'Envoyé avec la page en cours.',
  feedbackTypeBug: 'Bug',
  feedbackTypeFeature: 'Amélioration',
  feedbackPriorityUrgent: 'Urgent',
  feedbackPriorityNormal: 'Normal',
  feedbackPriorityLater: 'Plus tard',
  feedbackTitlePlaceholderBug: "Que s'est-il passé ?",
  feedbackTitlePlaceholderFeature: 'Quelle amélioration ?',
  feedbackBodyPlaceholder: 'Détaille un peu (étapes, ce que tu attendais…)',
  feedbackAddCapture: 'Ajouter une capture',
  feedbackRemoveImage: "Retirer l'image",
  feedbackClose: 'Fermer',
  feedbackSend: 'Envoyer',
  feedbackSending: 'Envoi…',
  feedbackTitleRequired: 'Donne un titre court.',
  feedbackSendFailed: "Échec de l'envoi.",
}
