/**
 * Git revision reader for a Product deploy-gate declaration (Roxabi/roxabi-boilerplate-cf#397).
 * Shared with the transition check (Roxabi/roxabi-boilerplate-cf#331). Reads blobs only — never
 * checks out or executes the revision. The pure parser stays in product-declaration.cjs.
 *
 * A missing path is null. Any non-zero git exit throws: a read failure is not absence.
 */
import { spawnSync } from 'node:child_process'
import { INHERITANCE_MARKER, PRODUCT_CONFIG, parseDeclaration } from './product-declaration.cjs'

type RevisionFinding = { file: string; finding: string; refusal: string }

export type RevisionDeclaration = { product: string[]; findings: RevisionFinding[] }

function gitAt(root: string, args: string[]): { code: number; out: string; err: string } {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  return { code: r.status ?? 1, out: r.stdout ?? '', err: (r.stderr ?? '').trim() }
}

/** Reject option/spec injection. Not a revision parser — callers pass a SHA or a ref token. */
function assertRevToken(rev: string): void {
  if (rev === '' || rev.startsWith('-') || /[\s:]/.test(rev) || rev.includes('..')) {
    throw new Error(`refusing to read a declaration at '${rev}'`)
  }
}

/** Blob text at `rev`, or null when that path is absent. A git failure or a non-blob throws. */
function fileAt(rev: string, rel: string, root: string): string | null {
  const listed = gitAt(root, ['ls-tree', '--name-only', rev, '--', rel])
  if (listed.code !== 0) {
    throw new Error(`git ls-tree ${rev} -- ${rel} failed: ${listed.err || listed.out.trim()}`)
  }
  if (listed.out.trim() === '') return null
  const kind = gitAt(root, ['cat-file', '-t', `${rev}:${rel}`])
  if (kind.code !== 0 || kind.out.trim() !== 'blob') {
    const why =
      kind.code !== 0 ? kind.err || kind.out.trim() : `${rel} is a ${kind.out.trim()}, not a blob`
    throw new Error(`git show ${rev}:${rel} failed: ${why}`)
  }
  const shown = gitAt(root, ['show', `${rev}:${rel}`])
  if (shown.code !== 0) {
    throw new Error(`git show ${rev}:${rel} failed: ${shown.err || shown.out.trim()}`)
  }
  return shown.out
}

/**
 * Product workflows declared at `rev` inside `root` (default `.`).
 * Product mode is the presence of `inheritance.json` in that tree, same as the working-tree loader.
 * `product` is the declaration only — kit workflows are not duplicated here.
 */
export function readDeclarationAt(rev: string, root = '.'): RevisionDeclaration {
  assertRevToken(rev)
  const marker = fileAt(rev, INHERITANCE_MARKER, root)
  const text = fileAt(rev, PRODUCT_CONFIG, root)
  const parsed = parseDeclaration(text, marker !== null)
  return {
    product: parsed.product,
    findings: parsed.findings.map((finding) => ({ file: PRODUCT_CONFIG, ...finding })),
  }
}
