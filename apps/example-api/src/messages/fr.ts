export const fr = {
  taskAssigned: 'Tâche assignée',
  approvalRequested: 'Approbation demandée',
  approvalBody: 'Un workflow nécessite votre approbation.',
  emailBrand: 'Kit Kit',
  manageNotificationRules: 'Mes règles de notification',
} as const

export type Messages = { [K in keyof typeof fr]: string }
