import type { FlowRunErrorCode } from '@kit/flows'

/** App-owned copy; stays in the app when the UI extracts. ADR-0005 D6 */
export type FlowsMessages = {
  navFlows: string
  flowsDesc: string
  flowsAuthoring: string
  flowsAuthoringDesc: string
  flowsYamlLabel: string
  flowsYamlPlaceholder: string
  flowsCheck: string
  flowsCheckOk: string
  flowsSavePlan: string
  flowsPlanSaved: string
  flowsPlans: string
  flowsRuns: string
  flowsEmptyPlans: string
  flowsEmptyRuns: string
  flowsNoSteps: string
  flowsRun: string
  flowsRunQueued: string
  flowsTimeline: string
  flowsWaiting: string
  flowsOutcomeOk: string
  flowsOutcomeSkip: string
  flowsOutcomeFail: string
  flowsApproval: string
  flowsApprove: string
  flowsReject: string
  flowsDecisionRecorded: string
  flowsBack: string
  flowsNeedOrg: string
  flowsOpen: string
  flowsStatus: string
  flowsStatusQueued: string
  flowsStatusRunning: string
  flowsStatusSucceeded: string
  flowsStatusFailed: string
  flowsStatusCancelled: string
  flowsUnknown: string
  flowsErrApprovalRejected: string
  flowsErrApprovalTimeout: string
  flowsErrApprovalUnsupported: string
  flowsErrWorkflowCreateFailed: string
  flowsErrInvokeFailed: string
  flowsErrInferFailed: string
  flowsErrTokenCeiling: string
  flowsErrUnknownTool: string
  flowsErrToolNotInExecution: string
  flowsErrBindingUnresolved: string
  flowsErrOrgMismatch: string
  flowsErrReceiptsInvalid: string
  flowsErrDagStuck: string
  flowsErrWaitingNotSupported: string
  flowsErrCycle: string
  flowsErrUnknownTaskEdge: string
  flowsErrRunnerViewInvalid: string
}

const OUTCOME = {
  ok: 'flowsOutcomeOk',
  skip: 'flowsOutcomeSkip',
  fail: 'flowsOutcomeFail',
  waiting: 'flowsWaiting',
} as const

const STATUS = {
  queued: 'flowsStatusQueued',
  running: 'flowsStatusRunning',
  succeeded: 'flowsStatusSucceeded',
  failed: 'flowsStatusFailed',
  cancelled: 'flowsStatusCancelled',
} as const

const ERROR_CODE = {
  APPROVAL_REJECTED: 'flowsErrApprovalRejected',
  APPROVAL_TIMEOUT: 'flowsErrApprovalTimeout',
  APPROVAL_UNSUPPORTED: 'flowsErrApprovalUnsupported',
  WORKFLOW_CREATE_FAILED: 'flowsErrWorkflowCreateFailed',
  INVOKE_FAILED: 'flowsErrInvokeFailed',
  INFER_FAILED: 'flowsErrInferFailed',
  TOKEN_CEILING: 'flowsErrTokenCeiling',
  UNKNOWN_TOOL: 'flowsErrUnknownTool',
  TOOL_NOT_IN_EXECUTION_TOOLS: 'flowsErrToolNotInExecution',
  BINDING_UNRESOLVED: 'flowsErrBindingUnresolved',
  ORG_MISMATCH: 'flowsErrOrgMismatch',
  RECEIPTS_INVALID: 'flowsErrReceiptsInvalid',
  DAG_STUCK: 'flowsErrDagStuck',
  WAITING_NOT_SUPPORTED: 'flowsErrWaitingNotSupported',
  CYCLE: 'flowsErrCycle',
  UNKNOWN_TASK_EDGE: 'flowsErrUnknownTaskEdge',
  RUNNER_VIEW_INVALID: 'flowsErrRunnerViewInvalid',
} as const satisfies Record<FlowRunErrorCode, keyof FlowsMessages>

export function flowOutcomeLabel(outcome: string, m: FlowsMessages): string {
  const key = OUTCOME[outcome as keyof typeof OUTCOME]
  return key ? m[key] : m.flowsUnknown
}

export function flowStatusLabel(status: string, m: FlowsMessages): string {
  const key = STATUS[status as keyof typeof STATUS]
  return key ? m[key] : m.flowsUnknown
}

export function flowErrorLabel(code: string, m: FlowsMessages): string {
  const key = ERROR_CODE[code as keyof typeof ERROR_CODE]
  return key ? m[key] : m.flowsUnknown
}

export const flowsEn: FlowsMessages = {
  navFlows: 'Flows',
  flowsDesc: 'Plans and runs for the active organization',
  flowsAuthoring: 'New plan',
  flowsAuthoringDesc: 'Paste YAML, check, then save. Grant stays server-minted.',
  flowsYamlLabel: 'Plan YAML',
  flowsYamlPlaceholder: 'flows: v0\nplan:\n  id: demo\n  ...',
  flowsCheck: 'Check',
  flowsCheckOk: 'Plan checks out',
  flowsSavePlan: 'Save plan',
  flowsPlanSaved: 'Plan saved',
  flowsPlans: 'Plans',
  flowsRuns: 'Runs',
  flowsEmptyPlans: 'No plans',
  flowsEmptyRuns: 'No runs',
  flowsNoSteps: 'No steps yet',
  flowsRun: 'Run',
  flowsRunQueued: 'Run queued',
  flowsTimeline: 'Timeline',
  flowsWaiting: 'Waiting',
  flowsOutcomeOk: 'Succeeded',
  flowsOutcomeSkip: 'Skipped',
  flowsOutcomeFail: 'Failed',
  flowsApproval: '{by} · {at}',
  flowsApprove: 'Approve',
  flowsReject: 'Reject',
  flowsDecisionRecorded: 'Decision recorded',
  flowsBack: 'Back',
  flowsNeedOrg: 'No organization',
  flowsOpen: 'Open',
  flowsStatus: 'Status',
  flowsStatusQueued: 'Queued',
  flowsStatusRunning: 'Running',
  flowsStatusSucceeded: 'Succeeded',
  flowsStatusFailed: 'Failed',
  flowsStatusCancelled: 'Cancelled',
  flowsUnknown: 'Unknown',
  flowsErrApprovalRejected: 'Approval rejected',
  flowsErrApprovalTimeout: 'Approval timed out',
  flowsErrApprovalUnsupported: 'Approval unsupported',
  flowsErrWorkflowCreateFailed: 'Run could not be queued',
  flowsErrInvokeFailed: 'Step failed',
  flowsErrInferFailed: 'Inference failed',
  flowsErrTokenCeiling: 'Token ceiling reached',
  flowsErrUnknownTool: 'Unknown tool',
  flowsErrToolNotInExecution: 'Tool not in the sealed run',
  flowsErrBindingUnresolved: 'Binding could not be resolved',
  flowsErrOrgMismatch: 'Organization mismatch',
  flowsErrReceiptsInvalid: 'Receipts invalid',
  flowsErrDagStuck: 'Run stuck',
  flowsErrWaitingNotSupported: 'Waiting not supported',
  flowsErrCycle: 'Plan has a cycle',
  flowsErrUnknownTaskEdge: 'Unknown step edge',
  flowsErrRunnerViewInvalid: 'Run snapshot invalid',
}

export const flowsFr: FlowsMessages = {
  navFlows: 'Flux',
  flowsDesc: 'Plans et exécutions de l’organisation active',

  flowsAuthoring: 'Nouveau plan',
  flowsAuthoringDesc: 'Collez du YAML, vérifiez, puis enregistrez. Le grant reste côté serveur.',
  flowsYamlLabel: 'YAML du plan',
  flowsYamlPlaceholder: 'flows: v0\nplan:\n  id: demo\n  ...',
  flowsCheck: 'Vérifier',
  flowsCheckOk: 'Plan valide',
  flowsSavePlan: 'Enregistrer',
  flowsPlanSaved: 'Plan enregistré',
  flowsPlans: 'Plans',
  flowsRuns: 'Exécutions',
  flowsEmptyPlans: 'Aucun plan',
  flowsEmptyRuns: 'Aucune exécution',
  flowsNoSteps: 'Aucune étape pour le moment',
  flowsRun: 'Lancer',
  flowsRunQueued: 'Exécution mise en file',
  flowsTimeline: 'Chronologie',
  flowsWaiting: 'En attente',
  flowsOutcomeOk: 'Réussi',
  flowsOutcomeSkip: 'Ignoré',
  flowsOutcomeFail: 'Échec',
  flowsApproval: '{by} · {at}',
  flowsApprove: 'Approuver',
  flowsReject: 'Refuser',
  flowsDecisionRecorded: 'Décision enregistrée',
  flowsBack: 'Retour',
  flowsNeedOrg: 'Aucune organisation',
  flowsOpen: 'Ouvrir',
  flowsStatus: 'Statut',
  flowsStatusQueued: 'En file',
  flowsStatusRunning: 'En cours',
  flowsStatusSucceeded: 'Réussi',
  flowsStatusFailed: 'Échec',
  flowsStatusCancelled: 'Annulé',
  flowsUnknown: 'Inconnu',
  flowsErrApprovalRejected: 'Approbation refusée',
  flowsErrApprovalTimeout: 'Approbation expirée',
  flowsErrApprovalUnsupported: 'Approbation non prise en charge',
  flowsErrWorkflowCreateFailed: 'Exécution non mise en file',
  flowsErrInvokeFailed: 'Étape en échec',
  flowsErrInferFailed: 'Inférence en échec',
  flowsErrTokenCeiling: 'Plafond de jetons atteint',
  flowsErrUnknownTool: 'Outil inconnu',
  flowsErrToolNotInExecution: 'Outil absent de l’exécution scellée',
  flowsErrBindingUnresolved: 'Liaison non résolue',
  flowsErrOrgMismatch: 'Organisation incohérente',
  flowsErrReceiptsInvalid: 'Reçus invalides',
  flowsErrDagStuck: 'Exécution bloquée',
  flowsErrWaitingNotSupported: 'Attente non prise en charge',
  flowsErrCycle: 'Le plan contient un cycle',
  flowsErrUnknownTaskEdge: 'Arête d’étape inconnue',
  flowsErrRunnerViewInvalid: 'Instantané d’exécution invalide',
}
