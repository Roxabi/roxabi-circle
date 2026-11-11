import { describe, expect, it } from 'vitest'
import type { TaskStage } from './schema'
import {
  checkBoardStages,
  findDefaultStage,
  isStageOnBoard,
  isTerminalStage,
  stagesForBoard,
  suggestedDoneForStage,
} from './stages'

const stages: TaskStage[] = [
  {
    id: 's1',
    orgId: 'o1',
    boardKey: 'main',
    label: 'Todo',
    position: 0,
    isDefault: true,
    isTerminal: false,
  },
  {
    id: 's2',
    orgId: 'o1',
    boardKey: 'main',
    label: 'Done',
    position: 1,
    isDefault: false,
    isTerminal: true,
  },
  {
    id: 's3',
    orgId: 'o1',
    boardKey: 'other',
    label: 'X',
    position: 0,
    isDefault: true,
    isTerminal: false,
  },
  {
    id: 's4',
    orgId: 'o2',
    boardKey: 'main',
    label: 'Other org',
    position: 0,
    isDefault: true,
    isTerminal: false,
  },
]

describe('stagesForBoard', () => {
  it('filters without changing input order and sorts position ties by ID', () => {
    const unsorted: readonly TaskStage[] = Object.freeze([
      {
        id: 's-b',
        orgId: 'o1',
        boardKey: 'main',
        label: 'B',
        position: 1,
        isDefault: false,
        isTerminal: false,
      },
      {
        id: 'other-org',
        orgId: 'o2',
        boardKey: 'main',
        label: 'Other org',
        position: 0,
        isDefault: false,
        isTerminal: false,
      },
      {
        id: 's-a',
        orgId: 'o1',
        boardKey: 'main',
        label: 'A',
        position: 1,
        isDefault: false,
        isTerminal: false,
      },
      {
        id: 's-0',
        orgId: 'o1',
        boardKey: 'main',
        label: 'First',
        position: 0,
        isDefault: true,
        isTerminal: false,
      },
      {
        id: 'other-board',
        orgId: 'o1',
        boardKey: 'other',
        label: 'Other board',
        position: 0,
        isDefault: true,
        isTerminal: false,
      },
    ])
    const originalIds = unsorted.map((s) => s.id)

    expect(stagesForBoard(unsorted, 'o1', 'main').map((s) => s.id)).toEqual(['s-0', 's-a', 's-b'])
    expect(unsorted.map((s) => s.id)).toEqual(originalIds)
  })
})

describe('findDefaultStage', () => {
  it('returns default', () => {
    expect(findDefaultStage(stages, 'o1', 'main')?.id).toBe('s1')
  })
})

describe('checkBoardStages', () => {
  it('ok board', () => {
    expect(checkBoardStages(stages, 'o1', 'main')).toEqual([])
  })

  it('empty board', () => {
    expect(checkBoardStages(stages, 'o1', 'missing')[0]?.code).toBe('EMPTY_BOARD')
  })

  it('multiple defaults', () => {
    const bad = [
      ...stages,
      {
        id: 's9',
        orgId: 'o1',
        boardKey: 'main',
        label: 'Also default',
        position: 2,
        isDefault: true,
        isTerminal: false,
      },
    ]
    expect(checkBoardStages(bad, 'o1', 'main').some((i) => i.code === 'MULTIPLE_DEFAULTS')).toBe(
      true,
    )
  })
})

describe('isStageOnBoard / terminal / done', () => {
  it('membership', () => {
    expect(isStageOnBoard(stages, 'o1', 'main', 's2')).toBe(true)
    expect(isStageOnBoard(stages, 'o1', 'main', 's3')).toBe(false)
    expect(isStageOnBoard(stages, 'o2', 'main', 's2')).toBe(false)
  })
  it('terminal suggests done', () => {
    expect(isTerminalStage(stages, 's2')).toBe(true)
    expect(suggestedDoneForStage(stages, 's2')).toBe(true)
    expect(suggestedDoneForStage(stages, 's1')).toBe(false)
  })
})
