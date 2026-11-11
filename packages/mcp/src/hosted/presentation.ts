import type { ConsentPresentation } from './env'

/** Copy caller-owned data once, so later mutations cannot change a consent page. */
export function snapshotPresentation(value?: ConsentPresentation): ConsentPresentation | undefined {
  if (!value) return undefined
  return {
    ...(value.locale !== undefined ? { locale: value.locale } : {}),
    ...(value.serviceName !== undefined ? { serviceName: value.serviceName } : {}),
    ...(value.disclosures !== undefined
      ? { disclosures: value.disclosures.map(({ label, text }) => ({ label, text })) }
      : {}),
  }
}

type ConsentLabels = {
  title: string
  signedInAs: string
  noEmail: string
  client: string
  clientId: string
  destination: string
  customSchemeBefore: string
  customSchemeAfter: string
  loopbackWarning: string
  warningAdvice: string
  allow: string
  deny: string
}

export const CONSENT_LABELS: Record<'en' | 'fr', ConsentLabels> = {
  en: {
    title: 'Authorize MCP client',
    signedInAs: 'Signed in as',
    noEmail: '(no email)',
    client: 'Client',
    clientId: 'Client ID',
    destination: 'Sends you back to',
    customSchemeBefore: 'The code goes to an app on this device (',
    customSchemeAfter: '), not a website.',
    loopbackWarning: 'The code goes to a program on your own computer, not a website.',
    warningAdvice: 'Allow only if you started this client yourself.',
    allow: 'Allow',
    deny: 'Deny',
  },
  fr: {
    title: 'Autoriser le client MCP',
    signedInAs: 'Connecté en tant que',
    noEmail: '(aucune adresse e-mail)',
    client: 'Client',
    clientId: 'Identifiant du client',
    destination: 'Vous redirige vers',
    customSchemeBefore: 'Le code est envoyé à une application sur cet appareil (',
    customSchemeAfter: '), et non à un site web.',
    loopbackWarning:
      'Le code est envoyé à un programme sur votre ordinateur, et non à un site web.',
    warningAdvice: 'Autorisez uniquement si vous avez démarré ce client vous-même.',
    allow: 'Autoriser',
    deny: 'Refuser',
  },
}
