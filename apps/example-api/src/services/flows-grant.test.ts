import { AppError } from '@kit/core'
import { describe, expect, it } from 'vitest'
import {
  allowedModelsForPlan,
  FlowAllowedModelsInvalid,
  parseFlowAllowedModels,
} from './flows-grant'

const thirtyThree = Array.from({ length: 33 }, (_, i) => `m${i}`).join(',')
const invokeOnly = { tasks: { t1: { invoke: { tool: 'echo' } } } }
const inferPlan = { tasks: { t1: { infer: { prompt: 'hi' } } } }

describe('parseFlowAllowedModels', () => {
  it.each([
    ['undefined', undefined, []],
    ['blank', '', []],
    ['whitespace', '   ', []],
    ['commas only', ',,,', []],
    ['padded id', ' kit-infer ', ['kit-infer']],
    ['trimmed pair', 'a, b', ['a', 'b']],
    ['joined ids', 'kit-infer,evil-model', ['kit-infer', 'evil-model']],
    ['trailing comma', 'kit-infer,', ['kit-infer']],
    [
      'duplicates under the cap',
      Array.from({ length: 33 }, () => 'kit-infer').join(','),
      ['kit-infer'],
    ],
  ] as const)('parses %s', (_label, raw, expected) => {
    expect(parseFlowAllowedModels(raw)).toEqual(expected)
  })

  it('rejects 33 unique ids', () => {
    expect(() => parseFlowAllowedModels(thirtyThree)).toThrow(FlowAllowedModelsInvalid)
  })

  it('rejects a 257-char id', () => {
    expect(() => parseFlowAllowedModels('x'.repeat(257))).toThrow(FlowAllowedModelsInvalid)
  })

  it('rejects a non-string the same way', () => {
    expect(() => parseFlowAllowedModels(['kit-infer'])).toThrow(FlowAllowedModelsInvalid)
  })

  it('ignores a malformed list when the plan does not infer', () => {
    expect(allowedModelsForPlan(thirtyThree, invokeOnly)).toEqual([])
  })

  it('is a server error when an infer plan meets a malformed list', () => {
    expect(() => allowedModelsForPlan(thirtyThree, inferPlan)).toThrow(AppError)
    try {
      allowedModelsForPlan(thirtyThree, inferPlan)
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      if (!(err instanceof AppError)) return
      expect(err.status).toBe(500)
      expect(err.message).not.toContain('FLOW_ALLOWED_MODELS')
    }
  })
})
