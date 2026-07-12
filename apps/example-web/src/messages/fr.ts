export type Messages = {
  appTitle: string
  login: string
  email: string
  password: string
  submit: string
  notes: string
  createNote: string
  title: string
  body: string
  logoutHint: string
  lang: string
  me: string
  sendEmail: string
  health: string
  empty: string
  error: string
  demoCreds: string
}

export const fr: Messages = {
  appTitle: 'GOSILEX Kit — example-web',
  login: 'Connexion',
  email: 'E-mail',
  password: 'Mot de passe',
  submit: 'Se connecter',
  notes: 'Notes démo',
  createNote: 'Créer une note',
  title: 'Titre',
  body: 'Corps',
  logoutHint: 'Session cookie HttpOnly · credentials: include',
  lang: 'Langue',
  me: 'Qui suis-je',
  sendEmail: 'Envoyer e-mail démo',
  health: 'Santé API',
  empty: 'Aucune note',
  error: 'Erreur',
  demoCreds: 'Démo : demo@gosilex.local / demo-password-change-me',
}
