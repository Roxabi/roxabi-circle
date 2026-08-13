import type { TaskStage } from './schema'

export type StageIssueCode =
  | 'EMPTY_BOARD'
  | 'NO_DEFAULT'
  | 'MULTIPLE_DEFAULTS'
  | 'STAGE_NOT_ON_BOARD'
  | 'ORG_MISMATCH'

export type StageIssue = {
  code: StageIssueCode
  message: string
}

/**
 * Stages for one (orgId, boardKey). Caller filters the catalogue.
 */
export function stagesForBoard(
  stages: readonly TaskStage[],
  orgId: string,
  boardKey: string,
): TaskStage[] {
  return stages
    .filter((s) => s.orgId === orgId && s.boardKey === boardKey)
    .slice()
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

export function findDefaultStage(
  stages: readonly TaskStage[],
  orgId: string,
  boardKey: string,
): TaskStage | undefined {
  const board = stagesForBoard(stages, orgId, boardKey)
  return board.find((s) => s.isDefault)
}

export function isStageOnBoard(
  stages: readonly TaskStage[],
  orgId: string,
  boardKey: string,
  stageId: string,
): boolean {
  return stagesForBoard(stages, orgId, boardKey).some((s) => s.id === stageId)
}

export function isTerminalStage(stages: readonly TaskStage[], stageId: string): boolean {
  return stages.some((s) => s.id === stageId && s.isTerminal)
}

/**
 * Validate board catalogue invariants (at least one stage, exactly one default).
 */
export function checkBoardStages(
  stages: readonly TaskStage[],
  orgId: string,
  boardKey: string,
): StageIssue[] {
  const board = stagesForBoard(stages, orgId, boardKey)
  const issues: StageIssue[] = []
  if (board.length === 0) {
    issues.push({
      code: 'EMPTY_BOARD',
      message: `no stages for board "${boardKey}" in org`,
    })
    return issues
  }
  const defaults = board.filter((s) => s.isDefault)
  if (defaults.length === 0) {
    issues.push({
      code: 'NO_DEFAULT',
      message: `board "${boardKey}" has no default stage`,
    })
  } else if (defaults.length > 1) {
    issues.push({
      code: 'MULTIPLE_DEFAULTS',
      message: `board "${boardKey}" has ${defaults.length} default stages`,
    })
  }
  return issues
}

/**
 * Moving into a terminal stage implies done=true; leaving terminal implies done=false
 * unless product overrides (return suggested done only).
 */
export function suggestedDoneForStage(
  stages: readonly TaskStage[],
  stageId: string,
): boolean | undefined {
  const stage = stages.find((s) => s.id === stageId)
  if (!stage) return undefined
  return stage.isTerminal
}
