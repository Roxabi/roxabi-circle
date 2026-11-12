'use strict'

const PRODUCT_CONFIG = 'config/product/deploy-gate.json'
const INHERITANCE_MARKER = 'config/product/inheritance.json'
const PRODUCT_WORKFLOW_PATH = /^\.github\/workflows\/product-[\w.-]+\.ya?ml$/

/**
 * @typedef {{ finding: string, refusal: string }} DeclarationFinding
 */

/**
 * @typedef {{ product: string[], findings: DeclarationFinding[] }} Declaration
 */

/**
 * @param {string} text
 * @param {string} [finding]
 * @returns {DeclarationFinding}
 */
function refusal(text, finding = text) {
  return { finding, refusal: text }
}

/**
 * @param {boolean} productMode
 * @returns {Declaration}
 */
function missingDeclaration(productMode) {
  if (!productMode) return { product: [], findings: [] }
  return {
    product: [],
    findings: [
      refusal(
        `product mode needs ${PRODUCT_CONFIG} on the deploy branch ({"workflows": [...]}, [] if the product has no CI of its own)`,
      ),
    ],
  }
}

/**
 * @param {string} text
 * @returns {{ config: unknown } | { error: string }}
 */
function parseConfig(text) {
  try {
    return { config: JSON.parse(text) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * @param {unknown} config
 * @returns {unknown}
 */
function declaredWorkflows(config) {
  if (config && typeof config === 'object' && 'workflows' in config) return config.workflows
}

/**
 * @param {unknown} entry
 * @returns {string | undefined}
 */
function displayEntry(entry) {
  if (typeof entry === 'string') return entry
  if (Array.isArray(entry)) return '[array]'
  if (entry !== null && typeof entry === 'object') return '[object]'
  return JSON.stringify(entry)
}

/**
 * @param {unknown[]} workflows
 * @returns {Declaration}
 */
function parseWorkflows(workflows) {
  /** @type {string[]} */
  const product = []
  /** @type {DeclarationFinding[]} */
  const findings = []
  for (const entry of workflows) {
    if (typeof entry === 'string' && PRODUCT_WORKFLOW_PATH.test(entry)) {
      if (!product.includes(entry)) product.push(entry)
      continue
    }
    const shown = displayEntry(entry)
    const bad = `'${shown}' is not a .github/workflows/product-*.yml path`
    findings.push(refusal(`${PRODUCT_CONFIG}: ${bad}`, bad))
  }
  return { product, findings }
}

/**
 * Parses one Product declaration without reading the filesystem.
 * @param {string | null} text
 * @param {boolean} productMode
 * @returns {{ product: string[], findings: Array<{ finding: string, refusal: string }> }}
 */
function parseDeclaration(text, productMode) {
  if (text === null) return missingDeclaration(productMode)

  const parsed = parseConfig(text)
  if ('error' in parsed) {
    return {
      product: [],
      findings: [refusal(`${PRODUCT_CONFIG} is not valid JSON: ${parsed.error}`)],
    }
  }
  const workflows = declaredWorkflows(parsed.config)
  if (!Array.isArray(workflows)) {
    return {
      product: [],
      findings: [refusal(`${PRODUCT_CONFIG} needs "workflows": an array of workflow paths`)],
    }
  }
  return parseWorkflows(workflows)
}

module.exports = { INHERITANCE_MARKER, PRODUCT_CONFIG, parseDeclaration }
