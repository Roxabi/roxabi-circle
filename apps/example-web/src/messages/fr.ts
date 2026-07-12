export type Messages = {
  appTitle: string
  appSubtitle: string
  login: string
  loginTitle: string
  loginDesc: string
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
  health: string
  empty: string
  error: string
  loadFailed: string
  retry: string
  demoCreds: string
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
  copied: string
  navDashboard: string
  navNotes: string
  navKeys: string
  navSettings: string
  navDesignSystem: string
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
}

export const fr: Messages = {
  appTitle: 'GOSILEX Kit',
  appSubtitle: 'example-web · starter SaaS',
  login: 'Connexion',
  loginTitle: 'Connexion',
  loginDesc: 'Session cookie HttpOnly · credentials include',
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
  health: 'API',
  empty: 'Aucune note pour l’instant',
  error: 'Erreur',
  loadFailed: 'Chargement impossible',
  retry: 'Réessayer',
  demoCreds: 'Démo : demo@gosilex.local / demo-password-change-me',
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
  copied: 'Copié dans le presse-papiers',
  navDashboard: 'Dashboard',
  navNotes: 'Notes',
  navKeys: 'Clés API',
  navSettings: 'Paramètres',
  navDesignSystem: 'Design system',
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
}
