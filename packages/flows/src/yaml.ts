import { parse as parseYaml } from 'yaml'
import { MAX_PLAN_YAML_BYTES } from './constants'
import { type PlanDocument, parsePlanDocument } from './schema'

export type YamlLoadErrorCode =
  | 'YAML_TOO_LARGE'
  | 'YAML_EMPTY'
  | 'YAML_NOT_STRING'
  | 'YAML_PARSE_ERROR'
  | 'YAML_NOT_OBJECT'
  | 'PLAN_SCHEMA_ERROR'

export class PlanYamlError extends Error {
  readonly code: YamlLoadErrorCode
  readonly details?: unknown

  constructor(code: YamlLoadErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'PlanYamlError'
    this.code = code
    this.details = details
  }
}

/**
 * Load a flows plan from YAML (MVP authoring).
 * Fail-closed parse options (YAML 1.2 core, no merge keys, no known tags).
 */
export function loadPlanFromYaml(source: string): PlanDocument {
  if (typeof source !== 'string') {
    throw new PlanYamlError('YAML_NOT_STRING', 'YAML source must be a string')
  }
  const bytes = new TextEncoder().encode(source).byteLength
  if (bytes === 0) {
    throw new PlanYamlError('YAML_EMPTY', 'YAML source is empty')
  }
  if (bytes > MAX_PLAN_YAML_BYTES) {
    throw new PlanYamlError(
      'YAML_TOO_LARGE',
      `YAML exceeds max ${MAX_PLAN_YAML_BYTES} bytes (got ${bytes})`,
    )
  }

  let raw: unknown
  try {
    raw = parseYaml(source, {
      maxAliasCount: 50,
      uniqueKeys: true,
      // Fail-closed: pin 1.2 core, no merge, no !!binary etc.
      version: '1.2',
      schema: 'core',
      merge: false,
      resolveKnownTags: false,
    })
  } catch (err) {
    throw new PlanYamlError(
      'YAML_PARSE_ERROR',
      err instanceof Error ? err.message : 'YAML parse failed',
      err,
    )
  }

  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PlanYamlError('YAML_NOT_OBJECT', 'YAML root must be a mapping object')
  }

  try {
    return parsePlanDocument(raw)
  } catch (err) {
    throw new PlanYamlError(
      'PLAN_SCHEMA_ERROR',
      err instanceof Error ? err.message : 'Plan schema validation failed',
      err,
    )
  }
}
