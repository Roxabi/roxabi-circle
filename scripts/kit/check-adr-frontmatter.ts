#!/usr/bin/env bun
/**
 * ADR frontmatter gate. `bun run doc:check` runs it after check-doc-hygiene.ts. The package
 * launcher disables Bun auto-install, so this invocation makes no network request.
 *
 * This comment states the gate's stages, rules and order. RULES groups the rule ids by rule, and
 * every violation ends with its id, as ` [id]`. The non-claims are in docs/kit/testing.md
 * (CP-DOC-HYGIENE), which owns them.
 *
 * AGENTS.md ranks "accepted ADRs with `normative: true`" second in authority, and
 * docs/kit/architecture/index.md makes the frontmatter the sole home of status, normativity and
 * the axial marker. The gate runs these stages in order, and a stage that fails stops every later
 * one:
 *   a. Bun.YAML.parse exists, else one violation naming the packageManager Bun.
 *   b. git resolves the scan root as the work tree of its own repository (rule 4), else one
 *      violation.
 *   c. docs/kit/architecture/adr/ is a real directory at its canonical path. Every entry that is
 *      not a regular `NNNN-slug.md` file is a violation, since it would escape every rule, and a
 *      name that is not UTF-8 is shown with U+FFFD. An entry that cannot be read stops the scan;
 *      when no ADR file is left, one more violation says so and the scan stops.
 *   d. Each ADR, in name order, is held to rules 1, 2 and 4, then the set to rule 3 and the index
 *      to rule 5.
 * The `yaml` package and the scan root are resolved when the module loads. A missing `yaml`
 * prints one `run bun install` diagnostic and exits; an error resolving the root is thrown.
 * During the scan, a path the gate looks for and does not find is reported as missing; any other
 * filesystem error is reported with its reason, never thrown. Violations print sorted by file,
 * then line, not in the order the stages find them. The rules:
 *   1. Every ADR is valid UTF-8 and declares `status` (one of STATUS_WORDS) and `normative` and
 *      `axial` as a literal `true` or `false`; a violation shows a value by its first source line,
 *      marked `…` when more follow. The frontmatter is held to a plain subset: no UNPRINTABLE
 *      character (LF is the only break), one bare document (no directive or marker), top-level keys
 *      named KEY_NAME (no `<<` merge), string mapping keys at any depth, no anchor, alias or tag,
 *      and no key twice however it is spelled (`key:`, `"key":`, `key :`, `? key`) or nested. Two
 *      readers must then load it to the same value: the `yaml` package resolved from `@kit/flows`
 *      as check-stack-contract.ts does, whose AST the rules read, and Bun.YAML of the Bun running
 *      this gate.
 *   2. `normative: true` only with `status: accepted`.
 *   3. Exactly one ADR has `axial: true`.
 *   4. `related` is a list of strings. An entry names a repository path when its first token,
 *      without its `#fragment` or `:line` suffix, has a `/` or a file extension, unless the token
 *      starts with `@`, is a URL (a lowercase `scheme://`) or matches `owner/repo#N` with both
 *      names in GH_NAME, GitHub's owner grammar, and an owner that names no entry of the checkout's
 *      root, a symlink included, compared byte for byte. Each path is checked in this order, and its
 *      first failure is its one violation:
 *      - it is relative, with no `.` or `..` segment;
 *      - then, one component at a time from the root, the component is an entry of its directory,
 *        compared byte for byte (a case-only match fails as a spelling mismatch, no match or a
 *        parent that is a regular file as `does not exist`, and an entry name that is not UTF-8
 *        matches nothing), and it is neither a symlink on disk nor a symlink entry of the index,
 *        so no link is ever followed;
 *      - the index delivers it: it is an entry of mode 100644 or 100755, or a directory holding an
 *        entry of any mode, whatever the worktree holds at that path;
 *      - a path that ends in `/` is such a directory.
 *      The index is read with `git ls-files -s`, so a staged or intent-to-add path passes here and
 *      CI's fresh checkout judges the commit. An index name that is not UTF-8 delivers nothing,
 *      though the directories above it do. The index is the scanned tree's own: GIT_DIR,
 *      GIT_WORK_TREE, GIT_COMMON_DIR and GIT_INDEX_FILE are ignored, and git must resolve ROOT as
 *      its work tree, with ROOT/.git a real directory or, through a ROOT/.git gitfile (never a
 *      symlink), a linked worktree: a git dir directly under the common dir's `worktrees/` whose
 *      back-pointer names ROOT/.git. Any other layout fails stage b, such as a .git symlink, a
 *      gitfile to another repository, a copied or moved linked worktree, an enclosing repository,
 *      a core.worktree elsewhere, a submodule or a --separate-git-dir checkout. A git error reports
 *      the first line of git's stderr, or the command and its exit status when stderr is empty.
 *   5. The index is at its canonical path, and the rows checked are the rows a reader sees,
 *      because it is also rendered with Bun.markdown, the pinned Bun's reader. The rendered
 *      decision-records table must equal a standalone render of its source lines, raw HTML is
 *      refused, an ADR file link or reference definition may appear only inside that table, and
 *      no other rendered table may name an ADR. The index is decoded strictly and held to the
 *      same UNPRINTABLE character set as the frontmatter, so the gate and CommonMark split lines
 *      the same way. It lists every ADR in exactly one row, whose prefix matches ROW and whose
 *      padded decision is normalized by decisionCell and checked as DECISION text. The status
 *      the row shows equals the frontmatter: a trailing
 *      `(<status word>)`, in any case, shows that status, and no marker shows `accepted`.
 */
import { spawnSync } from 'node:child_process'
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, resolve } from 'node:path'

type YamlNode = { range?: [number, number, number] | null }
type YamlScalar = YamlNode & { value: unknown }
type YamlPair = { key: unknown; value: unknown }
type YamlCollection<T> = YamlNode & { items: T[] }
type YamlError = { code: string; message: string; linePos?: [{ line: number; col: number }] }
type LineCounter = { linePos: (offset: number) => { line: number; col: number } }
type YamlDocument = { contents: unknown; errors: YamlError[]; toJS: () => unknown }
type Yaml = {
  LineCounter: new () => LineCounter
  parseDocument: (
    text: string,
    options: { uniqueKeys: boolean; lineCounter: LineCounter },
  ) => YamlDocument
  isAlias: (node: unknown) => boolean
  isMap: (node: unknown) => node is YamlCollection<YamlPair>
  isPair: (node: unknown) => node is YamlPair
  isScalar: (node: unknown) => node is YamlScalar
  isSeq: (node: unknown) => node is YamlCollection<unknown>
  visit: ((root: unknown, visitor: (key: unknown, node: unknown) => symbol | undefined) => void) & {
    BREAK: symbol
  }
}

const requireYaml = createRequire(join(import.meta.dirname, '../../packages/flows/package.json'))

function loadYaml(): Yaml {
  let yamlPath: string
  try {
    yamlPath = requireYaml.resolve('yaml')
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'MODULE_NOT_FOUND'
    ) {
      console.error('check-adr-frontmatter: yaml is not installed; run bun install')
      process.exit(1)
    }
    throw error
  }
  return requireYaml(yamlPath) as Yaml
}

const yaml = loadYaml()

const ROOT = realpathSync(
  resolve(process.env.ADR_FRONTMATTER_ROOT ?? join(import.meta.dirname, '../..')),
)
const ADR_DIR = 'docs/kit/architecture/adr'
const INDEX = 'docs/kit/architecture/index.md'
const INDEX_SECTION = '## Decision records'
const ADR_NAME = /^\d{4}-[a-z0-9-]+\.md$/
const STATUS_WORDS = ['accepted', 'deprecated', 'proposed', 'rejected', 'superseded']
const KEY_NAME = /^[a-z][a-z0-9_]*$/
/**
 * A control other than TAB and LF (CR, NEL and C1 included), a format character (BOM, zero-width,
 * bidi), a line or paragraph separator, or a noncharacter. A fatal decode leaves no surrogate.
 */
const UNPRINTABLE = /(?![\t\n])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Noncharacter_Code_Point}]/u
/** A YAML directive or document marker line: the frontmatter is one bare document. */
const DOCUMENT_MARKER = /^(?:%|(?:---|\.\.\.)(?:[ \t]|$))/m
const ROW = /^\|[ \t]+\[ADR-(\d{4})\]\(\.\/adr\/(\d{4}-[a-z0-9-]+\.md)\)[ \t]+\|(.+)$/
const INDEX_HEADER = /^\|[ \t]+ADR[ \t]+\|[ \t]+Decision[ \t]+\|$/
const TABLE_SHAPE =
  'the decision-records table must stand alone: a blank line, then | ADR | Decision |'
/** The rendered heading of INDEX_SECTION, as Bun.markdown.html emits it. */
const RENDERED_SECTION = '<h2>Decision records</h2>'
/** GitHub's Markdown options: autolinks and the tag filter. */
const RENDER: { autolinks: true; tagFilter: true } = { autolinks: true, tagFilter: true }
/** Plain text (no cell break, parenthesis, HTML or entity), then at most one status marker. */
const DECISION = new RegExp(`^[^|(<&]+?(?: \\((${STATUS_WORDS.join('|')})\\))?$`, 'i')
const DECISION_SHAPE =
  'a decision is plain text (no |, (, < or &) ending in at most one (<status>) marker'
/** A GitHub owner or repository name: letters, digits and single hyphens, 1 to 39 characters. */
const GH_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/
const ISSUE_REF = /^([^/]+)\/([^#]+)#\d+$/
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//

/**
 * Every rule id, grouped by the stage or rule of the header it reports, in the order the gate finds
 * them. The self-test fails for an id whose string literal appears more or less than once in the
 * scanner outside this list, and for an id that no passing case asserts.
 */
export const RULES = [
  // Stages a and b
  'bun-yaml',
  'git-failed',
  'git-not-own',
  // Stage c
  'adr-dir-missing',
  'adr-dir-unreadable',
  'adr-dir-unresolved',
  'adr-dir-alias',
  'adr-entry',
  'adr-entry-unreadable',
  'adr-none',
  // Rule 1
  'adr-unreadable',
  'adr-utf8',
  'fm-missing',
  'fm-unclosed',
  'fm-unprintable',
  'fm-marker',
  'fm-not-mapping',
  'fm-key-name',
  'fm-key-twice',
  'fm-yaml',
  'fm-anchor',
  'fm-key-type',
  'fm-bun-yaml-error',
  'fm-readers-differ',
  'status-missing',
  'status-word',
  'boolean-missing',
  'boolean-literal',
  // Rule 2
  'normative-accepted',
  // Rule 4
  'related-list',
  'related-relative',
  'related-unlisted',
  'related-dir-unreadable',
  'related-spelling',
  'related-missing',
  'related-unreadable',
  'related-link',
  'related-index-link',
  'related-undelivered',
  'related-slash',
  // Rule 3
  'axial-none',
  'axial-many',
  // Rule 5
  'index-missing',
  'index-unresolved',
  'index-alias',
  'index-unreadable',
  'index-utf8',
  'index-unprintable',
  'index-table-shape',
  'index-raw-html',
  'index-rendered',
  'index-outside-link',
  'index-outside-ref',
  'index-other-table',
  'index-row-shape',
  'index-decision-shape',
  'index-row-twice',
  'index-row-ghost',
  'index-status',
  'index-no-row',
] as const
type Rule = (typeof RULES)[number]

type Issue = { file: string; line: number; rule: Rule; message: string }
type Entry = { line: number; value: unknown }
type Frontmatter = {
  keys: Map<string, Entry>
  /** The source text of a value node, quotes included and comment excluded. */
  source: (node: unknown) => string
  /** The file line of an offset into the frontmatter text. */
  lineOf: (offset: number) => number
}
type Adr = { status: string | null; axialLine: number | null }

const issues: Issue[] = []
let relatedPaths = 0
/** The index, loaded once by main before any related path is judged (rule 4). */
const index = {
  /** Entries of mode 100644 or 100755: what a fresh checkout writes as a file. */
  files: new Set<string>(),
  /** Entries of mode 120000. */
  links: new Set<string>(),
  /** Every directory above an entry of any mode: what a fresh checkout creates as a directory. */
  dirs: new Set<string>(),
}

function report(file: string, line: number, rule: Rule, message: string): void {
  issues.push({ file, line, rule, message })
}

/** The first line of an error's message, or of a message: the reason a violation reports. */
function reasonOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? ''
}

/** The error code of a filesystem error, such as ENOENT. */
function errorCode(error: unknown): unknown {
  return (error as { code?: unknown } | null)?.code
}

/** Whether a filesystem error says the path is not there, which is a missing path, not an error. */
function absent(error: unknown): boolean {
  const code = errorCode(error)
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/** One violation for an adr/ that cannot be read, with the reason. */
function adrDirUnreadable(error: unknown): null {
  report(ADR_DIR, 1, 'adr-dir-unreadable', `ADR directory cannot be read: ${reasonOf(error)}`)
  return null
}

/** adr/'s path when it is a real directory at its canonical path, or null after a violation. */
function adrDirectory(): string | null {
  const dir = join(ROOT, ADR_DIR)
  let directory = false
  try {
    directory = lstatSync(dir).isDirectory()
  } catch (error) {
    if (!absent(error)) return adrDirUnreadable(error)
  }
  if (!directory) {
    report(ADR_DIR, 1, 'adr-dir-missing', 'ADR directory is missing or not a real directory')
    return null
  }
  let canonical: string
  try {
    canonical = realpathSync(dir)
  } catch (error) {
    report(
      ADR_DIR,
      1,
      'adr-dir-unresolved',
      `ADR directory is not at its canonical path: ${reasonOf(error)}`,
    )
    return null
  }
  if (canonical !== dir) {
    report(ADR_DIR, 1, 'adr-dir-alias', 'ADR directory is not at its canonical path')
    return null
  }
  return dir
}

/**
 * Every entry of adr/, in byte order; anything that is not a regular NNNN-slug.md file is a
 * violation, and an entry that cannot be read stops the scan.
 */
function listAdrs(): string[] | null {
  const dir = adrDirectory()
  if (dir === null) return null
  let entries: Buffer[]
  try {
    entries = readdirSync(dir, { encoding: 'buffer' })
  } catch (error) {
    return adrDirUnreadable(error)
  }
  const files: string[] = []
  let readable = true
  for (const entry of entries.sort(Buffer.compare)) {
    // A name that is not UTF-8 names no ADR, so it is not looked up, and it is shown with U+FFFD.
    const name = entryName(entry)
    const file = `${ADR_DIR}/${name ?? entry.toString()}`
    let regular = false
    try {
      regular = name !== null && lstatSync(join(dir, name)).isFile()
    } catch (error) {
      report(file, 1, 'adr-entry-unreadable', `ADR entry cannot be read: ${reasonOf(error)}`)
      readable = false
      continue
    }
    if (regular && name !== null && ADR_NAME.test(name)) files.push(file)
    else report(file, 1, 'adr-entry', 'not an ADR file: adr/ holds only regular NNNN-slug.md files')
  }
  if (!readable) return null
  if (files.length === 0) {
    report(ADR_DIR, 1, 'adr-none', 'no ADR file')
    return null
  }
  return files
}

/**
 * The file text, or null after a violation: a read error with its reason, or a fatal decode, so
 * invalid UTF-8 cannot hide.
 */
function readText(file: string, unreadable: Rule, invalid: Rule): string | null {
  let bytes: Buffer
  try {
    bytes = readFileSync(join(ROOT, file))
  } catch (error) {
    report(file, 1, unreadable, `file cannot be read: ${reasonOf(error)}`)
    return null
  }
  try {
    return UTF8.decode(bytes)
  } catch {
    report(file, 1, invalid, 'file is not valid UTF-8')
    return null
  }
}

/** The text between line 1 `---` and the next exact `---` line, or null after a violation. */
function frontmatterText(file: string): string | null {
  const text = readText(file, 'adr-unreadable', 'adr-utf8')
  if (text === null) return null
  const lines = text.split('\n')
  if (lines[0] !== '---') {
    report(file, 1, 'fm-missing', 'no YAML frontmatter: line 1 must be ---')
    return null
  }
  const end = lines.indexOf('---', 1)
  if (end === -1) {
    report(file, 1, 'fm-unclosed', 'YAML frontmatter is not closed by ---')
    return null
  }
  return lines.slice(1, end).join('\n')
}

function readFrontmatter(file: string): Frontmatter | null {
  const text = frontmatterText(file)
  if (text === null || reportOutsideSubset(file, text)) return null
  const lineCounter = new yaml.LineCounter()
  const doc = yaml.parseDocument(text, { uniqueKeys: true, lineCounter })
  const lineOf = (offset: number): number => lineCounter.linePos(offset).line + 1
  if (!yaml.isMap(doc.contents)) {
    if (!reportYamlError(file, doc.errors, new Set()))
      report(file, 2, 'fm-not-mapping', 'frontmatter is not a YAML mapping')
    return null
  }
  const duplicateLines = new Set<number>()
  const keys = readKeys(file, doc.contents, lineOf, duplicateLines)
  if (reportYamlError(file, doc.errors, duplicateLines) || keys === null) return null
  if (reportNodeShape(file, doc, lineOf)) return null
  if (reportReaderDisagreement(file, text, doc.toJS(), keys)) return null
  const source = (node: unknown): string => {
    const range = (node as YamlNode | null)?.range
    return range ? text.slice(range[0], range[1]) : ''
  }
  return { keys, source, lineOf }
}

function rangeStart(node: unknown): number {
  return (node as YamlNode | null)?.range?.[0] ?? 0
}

/** The line (1-based) holding an offset into text split on LF. */
function lineAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

/** An UNPRINTABLE character, so a reader and the gate can split the text differently; true after one. */
function reportUnprintable(
  file: string,
  text: string,
  where: string,
  rule: Rule,
  origin = 1,
): boolean {
  const char = UNPRINTABLE.exec(text)
  if (char === null) return false
  const code = (char[0].codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')
  report(
    file,
    lineAt(text, char.index) + origin - 1,
    rule,
    `${where} has a character outside the printable subset (U+${code})`,
  )
  return true
}

/** An UNPRINTABLE character, then a directive or marker line; true after a violation. */
function reportOutsideSubset(file: string, text: string): boolean {
  if (reportUnprintable(file, text, 'frontmatter', 'fm-unprintable', 2)) return true
  const marker = DOCUMENT_MARKER.exec(text)
  if (marker === null) return false
  report(
    file,
    lineAt(text, marker.index) + 1,
    'fm-marker',
    'frontmatter has a YAML directive or document marker',
  )
  return true
}

/** An anchor, alias or tag, or a mapping key that is not a string, at any depth. */
function reportNodeShape(file: string, doc: unknown, lineOf: (offset: number) => number): boolean {
  let found: { node: unknown; rule: Rule; message: string } | null = null
  yaml.visit(doc, (_key, node) => {
    const properties = node as { anchor?: string; tag?: string } | null
    if (yaml.isAlias(node) || properties?.anchor !== undefined || properties?.tag !== undefined)
      found = {
        node,
        rule: 'fm-anchor',
        message: 'frontmatter uses an anchor, alias or tag (&, *, !)',
      }
    else if (yaml.isPair(node) && !isStringScalar(node.key))
      found = {
        node: node.key,
        rule: 'fm-key-type',
        message: 'frontmatter mapping keys must be strings',
      }
    else return
    return yaml.visit.BREAK
  })
  if (found === null) return false
  const { node, rule, message } = found as { node: unknown; rule: Rule; message: string }
  report(file, lineOf(rangeStart(node)), rule, message)
  return true
}

/** Bun.YAML must load the frontmatter to the value the yaml package does; true otherwise. */
function reportReaderDisagreement(
  file: string,
  text: string,
  ours: unknown,
  keys: Map<string, Entry>,
): boolean {
  let theirs: unknown
  try {
    theirs = Bun.YAML.parse(text)
  } catch (error) {
    // Bun.YAML reports no position: the line is the first frontmatter line.
    const message = reasonOf(error)
    report(file, 2, 'fm-bun-yaml-error', `frontmatter does not load with Bun.YAML: ${message}`)
    return true
  }
  if (sameValue(ours, theirs)) return false
  const a = ours as Record<string, unknown>
  const b = isPlainObject(theirs) ? theirs : {}
  const key = [...new Set([...Object.keys(a), ...Object.keys(b)])].find(
    (name) => !sameValue(a[name], b[name]),
  )
  const entry = key === undefined ? undefined : keys.get(key)
  report(
    file,
    entry?.line ?? 2,
    'fm-readers-differ',
    `frontmatter reads differently with Bun.YAML${key === undefined ? '' : ` at key ${key}`}`,
  )
  return true
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Strict structural equality: Object.is leaves, arrays, plain objects with the same key order. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => sameValue(item, b[index]))
    )
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const names = Object.keys(a)
    return sameValue(names, Object.keys(b)) && names.every((name) => sameValue(a[name], b[name]))
  }
  return Object.is(a, b)
}

function isStringScalar(node: unknown): node is YamlScalar & { value: string } {
  return yaml.isScalar(node) && typeof node.value === 'string'
}

/** Rule 1: the top-level keys, each once however it is spelled, or null after a violation. */
function readKeys(
  file: string,
  map: YamlCollection<YamlPair>,
  lineOf: (offset: number) => number,
  duplicateLines: Set<number>,
): Map<string, Entry> | null {
  const keys = new Map<string, Entry>()
  let valid = true
  for (const { key, value } of map.items) {
    const line = lineOf(rangeStart(key))
    if (!(isStringScalar(key) && KEY_NAME.test(key.value))) {
      report(
        file,
        line,
        'fm-key-name',
        'frontmatter keys must be lowercase names ([a-z][a-z0-9_]*)',
      )
      valid = false
      continue
    }
    const first = keys.get(key.value)
    if (first !== undefined) {
      report(
        file,
        line,
        'fm-key-twice',
        `key ${key.value} is declared twice (first at line ${first.line})`,
      )
      duplicateLines.add(line)
      valid = false
      continue
    }
    keys.set(key.value, { line, value })
  }
  return valid ? keys : null
}

/** The first parse error readKeys has not already reported; true when the parse failed. */
function reportYamlError(file: string, errors: YamlError[], duplicateLines: Set<number>): boolean {
  const lineOf = (error: YamlError): number => (error.linePos?.[0].line ?? 1) + 1
  const error = errors.find(
    (candidate) => !(candidate.code === 'DUPLICATE_KEY' && duplicateLines.has(lineOf(candidate))),
  )
  if (error === undefined) return errors.length > 0
  const message = reasonOf(error.message).replace(/ at line \d+, column \d+:$/, '')
  report(file, lineOf(error), 'fm-yaml', `frontmatter is not valid YAML: ${message}`)
  return true
}

/** A source value as a violation shows it: its first line, so the rule id ends that line. */
function firstLine(text: string): string {
  const end = text.indexOf('\n')
  return end === -1 ? text : `${text.slice(0, end)}…`
}

/** Rule 1 for a boolean key: `true`, `false` or null after a violation. */
function readBoolean(file: string, fm: Frontmatter, key: string): boolean | null {
  const entry = fm.keys.get(key)
  if (entry === undefined) {
    report(file, 1, 'boolean-missing', `missing key: ${key}`)
    return null
  }
  // Tags are refused and Bun.YAML loads the same value, so a plain `true`/`false` is the boolean.
  const text = fm.source(entry.value)
  if (text === 'true' || text === 'false') return text === 'true'
  report(
    file,
    entry.line,
    'boolean-literal',
    `${key} must be true or false, got ${firstLine(text) || '(empty)'}`,
  )
  return null
}

/** Rule 1 for status: one of STATUS_WORDS, or null after a violation. */
function readStatus(file: string, fm: Frontmatter): string | null {
  const entry = fm.keys.get('status')
  if (entry === undefined) {
    report(file, 1, 'status-missing', 'missing key: status')
    return null
  }
  const status = yaml.isScalar(entry.value) ? entry.value.value : null
  if (typeof status === 'string' && STATUS_WORDS.includes(status)) return status
  report(
    file,
    entry.line,
    'status-word',
    `status must be one of ${STATUS_WORDS.join(', ')}, got ${firstLine(fm.source(entry.value)) || '(empty)'}`,
  )
  return null
}

/**
 * Whether name is an entry of ROOT, compared byte for byte as componentProblem compares, so a link
 * counts whatever it targets and is never followed. A root that cannot be listed counts every name:
 * the token is then checked as a path, whose walk reports the listing error with its reason.
 */
function rootEntry(name: string): boolean {
  let entries: Buffer[]
  try {
    entries = readdirSync(ROOT, { encoding: 'buffer' })
  } catch {
    return true
  }
  const exact = Buffer.from(name)
  return entries.some((entry) => entry.equals(exact))
}

/** The first token of an entry and the repository path it names, or null when rule 4 reads no path. */
function relatedPath(entry: string): { token: string; path: string } | null {
  const token = entry.trim().split(/\s+/)[0] ?? ''
  const issue = ISSUE_REF.exec(token)
  const owner = issue?.[1] ?? ''
  // owner/repo#N, but not when the owner is an entry of the root: that is a path the reader follows.
  if (
    token.startsWith('@') ||
    URL_SCHEME.test(token) ||
    (issue !== null && GH_NAME.test(owner) && GH_NAME.test(issue[2] ?? '') && !rootEntry(owner))
  )
    return null
  const path = token.replace(/#.*$/, '').replace(/:\d+(-\d+)?$/, '')
  if (!(path.includes('/') || /\.\w+$/.test(path))) return null
  return { token, path }
}

/** Why a related path breaks rule 4, and the rule id that reports it. */
type Problem = { rule: Rule; problem: string }

/** A directory entry's name, or null when it is not UTF-8 and so can match no related path. */
function entryName(entry: Buffer): string | null {
  try {
    return UTF8.decode(entry)
  } catch {
    return null
  }
}

/**
 * Why one component of a related path breaks rule 4, or null. prefix is the path up to and with the
 * component, which lies in parent. The directory is read as bytes, so an entry matches only its
 * exact name, and the component is checked as a link before the caller reads the next directory.
 */
function componentProblem(parent: string, component: string, prefix: string): Problem | null {
  let entries: Buffer[]
  try {
    entries = readdirSync(parent, { encoding: 'buffer' })
  } catch (error) {
    // A component under a regular file names nothing; any other error is reported with its reason.
    if (errorCode(error) === 'ENOTDIR')
      return { rule: 'related-unlisted', problem: 'does not exist' }
    return { rule: 'related-dir-unreadable', problem: `cannot be listed: ${reasonOf(error)}` }
  }
  const exact = Buffer.from(component)
  if (!entries.some((entry) => entry.equals(exact))) {
    const folded = component.toLowerCase()
    if (entries.some((entry) => entryName(entry)?.toLowerCase() === folded))
      return { rule: 'related-spelling', problem: 'does not match the spelling in its directory' }
    return { rule: 'related-missing', problem: 'does not exist' }
  }
  let link: boolean
  try {
    link = lstatSync(join(ROOT, prefix)).isSymbolicLink()
  } catch (error) {
    return { rule: 'related-unreadable', problem: `cannot be read: ${reasonOf(error)}` }
  }
  if (link) return { rule: 'related-link', problem: 'goes through a symlink' }
  if (index.links.has(prefix))
    return { rule: 'related-index-link', problem: 'goes through a symlink of the index' }
  return null
}

/**
 * Why a related path breaks rule 4, or null. A trailing slash is not a component, but it promises a
 * directory. The components are checked on disk from the root, so a wrong-case component reports
 * itself on a case-sensitive host too; delivery is then the index's answer alone.
 */
function relatedProblem(path: string): Problem | null {
  const segments = path.split('/')
  if (isAbsolute(path) || segments.includes('.') || segments.includes('..'))
    return {
      rule: 'related-relative',
      problem: 'must be repository-relative, without . or .. segments',
    }
  const wantsDirectory = segments.at(-1) === ''
  if (wantsDirectory) segments.pop()
  let parent = ROOT
  for (const [at, component] of segments.entries()) {
    const problem = componentProblem(parent, component, segments.slice(0, at + 1).join('/'))
    if (problem !== null) return problem
    parent = join(parent, component)
  }
  const rel = segments.join('/')
  if (!(index.files.has(rel) || index.dirs.has(rel)))
    return { rule: 'related-undelivered', problem: 'is not delivered by a tracked entry' }
  if (wantsDirectory && !index.dirs.has(rel))
    return { rule: 'related-slash', problem: 'ends with / but is not a directory' }
  return null
}

function checkRelated(file: string, fm: Frontmatter): void {
  const entry = fm.keys.get('related')
  if (entry === undefined) return
  const items = yaml.isSeq(entry.value) ? entry.value.items : null
  const entries = items?.filter(isStringScalar) ?? []
  if (items === null || entries.length !== items.length) {
    report(file, entry.line, 'related-list', 'related must be a list of strings')
    return
  }
  for (const item of entries) {
    const related = relatedPath(item.value)
    if (related === null) continue
    const { token, path } = related
    relatedPaths += 1
    const line = fm.lineOf(rangeStart(item))
    const found = relatedProblem(path)
    if (found !== null) report(file, line, found.rule, `related path ${found.problem}: ${token}`)
  }
}

function checkAdr(file: string, axial: string[]): Adr {
  const fm = readFrontmatter(file)
  if (fm === null) return { status: null, axialLine: null }
  const status = readStatus(file, fm)
  const normative = readBoolean(file, fm, 'normative')
  const isAxial = readBoolean(file, fm, 'axial')
  if (normative === true && status !== null && status !== 'accepted') {
    report(
      file,
      fm.keys.get('normative')?.line ?? 1,
      'normative-accepted',
      `normative: true requires status: accepted, got ${status}`,
    )
  }
  if (isAxial === true) axial.push(file)
  checkRelated(file, fm)
  return { status, axialLine: isAxial === true ? (fm.keys.get('axial')?.line ?? 1) : null }
}

function checkAxial(adrs: Map<string, Adr>, axial: string[]): void {
  if (axial.length === 0)
    report(ADR_DIR, 1, 'axial-none', 'no ADR declares axial: true; exactly one must')
  if (axial.length < 2) return
  for (const file of axial) {
    const others = axial.filter((other) => other !== file).join(', ')
    report(
      file,
      adrs.get(file)?.axialLine ?? 1,
      'axial-many',
      `axial: true is also declared by ${others}; exactly one ADR is axial`,
    )
  }
}

function tableRows(
  lines: string[],
  start: number,
): { top: number; rows: { line: number; text: string }[] } | null {
  const top = lines.findIndex((text, i) => i > start && text.startsWith('|'))
  if (top === -1) return { top: -1, rows: [] }
  let end = top
  while (lines[end]?.startsWith('|')) end += 1
  if (lines[top - 1] !== '' || !INDEX_HEADER.test(lines[top] ?? '')) {
    report(INDEX, top + 1, 'index-table-shape', TABLE_SHAPE)
    return null
  }
  return { top, rows: lines.slice(top + 2, end).map((text, i) => ({ line: top + 3 + i, text })) }
}

/** Rule 5 for one row: its marker, or accepted without one, is the ADR's status. */
function checkShownStatus(
  line: number,
  name: string,
  marker: string | undefined,
  status: string,
): void {
  const shown = marker ?? 'accepted'
  if (shown === status) return
  const how = marker === undefined ? 'no status marker' : `marker (${shown})`
  report(
    INDEX,
    line,
    'index-status',
    `row shows ${shown} (${how}) but ${name} has status: ${status}`,
  )
}

function isPadding(c: string | undefined): boolean {
  return c === ' ' || c === '\t'
}

/** Remove ASCII cell padding in linear time; keep the existing whitespace-only decision behavior. */
function decisionCell(cell: string | undefined): string | undefined {
  if (!cell || cell.length < 4 || !cell.endsWith('|')) return undefined
  if (!(isPadding(cell[0]) && isPadding(cell[cell.length - 2]))) return undefined
  const value = cell.slice(1, -2)
  let start = 0
  let end = value.length
  while (start < end && isPadding(value[start])) start += 1
  while (end > start && isPadding(value[end - 1])) end -= 1
  return start === end ? value : value.slice(start, end)
}

/** Rule 5 for one row: well-formed, an existing ADR listed once, showing that ADR's status. */
function checkRow(
  line: number,
  text: string,
  adrs: Map<string, Adr>,
  listed: Map<string, number>,
): void {
  const [, number, name, cell] = ROW.exec(text) ?? []
  const decision = decisionCell(cell)
  if (name === undefined || decision === undefined || !name.startsWith(`${number}-`)) {
    report(
      INDEX,
      line,
      'index-row-shape',
      'ADR row must read | [ADR-NNNN](./adr/NNNN-slug.md) | decision |',
    )
    return
  }
  const shown = DECISION.exec(decision)
  if (shown === null) report(INDEX, line, 'index-decision-shape', DECISION_SHAPE)
  const file = `${ADR_DIR}/${name}`
  const first = listed.get(file)
  const adr = adrs.get(file)
  if (first !== undefined)
    report(INDEX, line, 'index-row-twice', `${name} is already listed at line ${first}`)
  else if (adr === undefined) report(INDEX, line, 'index-row-ghost', `no ADR file ${name}`)
  else {
    listed.set(file, line)
    if (adr.status !== null && shown !== null)
      checkShownStatus(line, name, shown[1]?.toLowerCase(), adr.status)
  }
}

/** The first line containing needle outside the decision-records rows. */
function lineOf(lines: string[], needle: string, rows: Set<number>): number {
  const at = lines.findIndex((text, i) => !rows.has(i + 1) && text.includes(needle))
  return at === -1 ? 1 : at + 1
}

/** A link target that names a file under adr/, however the source spelled it. */
function linksAdr(href: string): boolean {
  let target: URL
  try {
    target = new URL(href, 'https://index.invalid/docs/kit/architecture/index.md')
  } catch {
    return false
  }
  return decodeURIComponent(target.pathname.replace(/%(?![0-9A-Fa-f]{2})/g, '%25'))
    .split('/')
    .includes('adr')
}

/** Raw HTML, which can hide or forge what renders; true after a violation. */
function reportRawHtml(lines: string[]): boolean {
  const raw = (markdown: string): boolean =>
    Bun.markdown.html(markdown, RENDER) !==
    Bun.markdown.html(markdown, { ...RENDER, noHtmlBlocks: true, noHtmlSpans: true })
  if (!raw(lines.join('\n'))) return false
  const line = lines.findIndex((text) => text.includes('<') && raw(text))
  report(
    INDEX,
    line === -1 ? 1 : line + 1,
    'index-raw-html',
    'the index holds raw HTML: it can hide or forge what a reader sees',
  )
  return true
}

/** The rendered decision-records table must be exactly what its source lines render as. */
function reportRenderedTable(lines: string[], top: number, end: number): boolean {
  const rendered = Bun.markdown.html(lines.join('\n'), RENDER)
  const region = /<table>\n(?:.*\n)*?<\/table>\n/
  const shown = region.exec(rendered.slice(rendered.indexOf(RENDERED_SECTION)))?.[0]
  if (shown === Bun.markdown.html(lines.slice(top, end).join('\n'), RENDER)) return false
  report(
    INDEX,
    top + 1,
    'index-rendered',
    'the decision-records table a reader sees is not the table its source lines render',
  )
  return true
}

function reportOutsideLink(lines: string[], html: string, rows: Set<number>): void {
  const hrefs = (fragment: string): string[] =>
    [...fragment.matchAll(/<a href="([^"]*)"/g)].map((match) => match[1] ?? '')
  const table = /<table>\n(?:.*\n)*?<\/table>\n/.exec(html.slice(html.indexOf(RENDERED_SECTION)))
  const fromHtml = hrefs(table === null ? html : html.replace(table[0], '')).find(linksAdr)
  if (fromHtml !== undefined) {
    const file = decodeURIComponent(fromHtml).split('/').pop() ?? fromHtml
    report(
      INDEX,
      lineOf(lines, file, rows),
      'index-outside-link',
      'an ADR file is linked outside the decision-records table',
    )
    return
  }
  const fromRef = lines.findIndex(
    (text, i) =>
      !rows.has(i + 1) &&
      linksAdr((/^\[[^\]]+\]:\s*<?([^>\s]+)/.exec(text)?.[1] ?? '').replace(/>$/, '')),
  )
  if (fromRef === -1) return
  report(
    INDEX,
    fromRef + 1,
    'index-outside-ref',
    'an ADR file is linked outside the decision-records table',
  )
}

/** Another rendered table naming an ADR, so a reader sees a second status. */
function reportOtherTable(lines: string[], html: string, rows: Set<number>): void {
  const region = /<table>\n(?:.*\n)*?<\/table>\n/
  const decision = region.exec(html.slice(html.indexOf(RENDERED_SECTION)))
  const rest = decision === null ? html : html.replace(decision[0], '')
  const named = [...rest.matchAll(new RegExp(region.source, 'g'))]
    .map((table) => /ADR-\d{4}/.exec(table[0])?.[0])
    .find((name) => name !== undefined)
  if (named === undefined) return
  report(
    INDEX,
    lineOf(lines, named, rows),
    'index-other-table',
    'a table outside the decision-records table names an ADR',
  )
}

/** Rule 5: the rendered index shows exactly the source rows, each showing the ADR's status. */
function checkIndex(adrs: Map<string, Adr>): void {
  const indexPath = join(ROOT, INDEX)
  let indexCanonical: string
  try {
    indexCanonical = realpathSync(indexPath)
  } catch (error) {
    if (absent(error)) report(INDEX, 1, 'index-missing', 'ADR index is missing')
    else
      report(
        INDEX,
        1,
        'index-unresolved',
        `ADR index is not at its canonical path: ${reasonOf(error)}`,
      )
    return
  }
  if (indexCanonical !== indexPath) {
    report(INDEX, 1, 'index-alias', 'ADR index is not at its canonical path')
    return
  }
  const text = readText(INDEX, 'index-unreadable', 'index-utf8')
  if (text === null || reportUnprintable(INDEX, text, 'index', 'index-unprintable')) return
  const lines = text.split('\n')
  const start = lines.indexOf(INDEX_SECTION)
  const found = tableRows(lines, start)
  if (reportRawHtml(lines) || found === null) return
  const { top, rows } = found
  if (top !== -1 && reportRenderedTable(lines, top, top + 2 + rows.length)) return
  const rendered = Bun.markdown.html(lines.join('\n'), RENDER)
  const rowLines = new Set(rows.map(({ line }) => line))
  reportOutsideLink(lines, rendered, rowLines)
  reportOtherTable(lines, rendered, rowLines)
  const listed = new Map<string, number>()
  for (const { line, text: row } of rows) checkRow(line, row, adrs, listed)
  for (const file of adrs.keys()) {
    if (!listed.has(file))
      report(INDEX, start + 1, 'index-no-row', `${file.slice(ADR_DIR.length + 1)} has no row`)
  }
}

/** One toolchain error when Bun.YAML is missing, naming the packageManager Bun. */
function bunYamlReady(): boolean {
  if (typeof Bun.YAML?.parse === 'function') return true
  let expected = 'unreadable'
  try {
    const pkg = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8'),
    ) as { packageManager?: unknown }
    if (typeof pkg.packageManager === 'string') expected = pkg.packageManager
  } catch (error) {
    // The diagnostic names the failure with its reason; it is not a second error.
    expected = `unreadable: ${reasonOf(error)}`
  }
  report(
    '.',
    1,
    'bun-yaml',
    `Bun.YAML.parse is unavailable; this gate needs the packageManager Bun (${expected})`,
  )
  return false
}

/** The variables that point git at another repository, work tree or index. Git hooks export GIT_DIR, so they are ignored, not refused. */
const GIT_REDIRECTS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']

/** Runs git at ROOT without the redirecting variables: stdout's bytes, or a throw carrying git's stderr. */
function git(...args: string[]): Buffer {
  const env = { ...process.env }
  for (const key of GIT_REDIRECTS) delete env[key]
  const result = spawnSync('git', args, { cwd: ROOT, env, maxBuffer: 64 * 1024 * 1024 })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(result.stderr.toString().trim() || `git ${args[0]} exited ${result.status}`)
  return result.stdout
}

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** The bytes of `/`, which no multibyte UTF-8 sequence holds. */
const SLASH = 0x2f

/**
 * Fills index from `git ls-files -s -z` records, `<mode> <object> <stage>\t<name>\0`. A name that
 * is not UTF-8 is not entered, so no decoded string stands for it, but every directory above its
 * first component that is not UTF-8 is.
 */
function loadIndex(out: Buffer): void {
  let start = 0
  for (let end = out.indexOf(0); end !== -1; end = out.indexOf(0, start)) {
    const record = out.subarray(start, end)
    start = end + 1
    const tab = record.indexOf(0x09)
    const mode = record.subarray(0, record.indexOf(0x20)).toString()
    const name = record.subarray(tab + 1)
    const components: string[] = []
    let from = 0
    for (let slash = name.indexOf(SLASH); slash !== -1; slash = name.indexOf(SLASH, from)) {
      const component = entryName(name.subarray(from, slash))
      if (component === null) break
      components.push(component)
      index.dirs.add(components.join('/'))
      from = slash + 1
    }
    // After a break, the rest of the name still holds the component that is not UTF-8.
    const last = entryName(name.subarray(from))
    if (last === null) continue
    const path = [...components, last].join('/')
    if (mode === '100644' || mode === '100755') index.files.add(path)
    else if (mode === '120000') index.links.add(path)
  }
}

/**
 * Whether gitDir is the scanned tree's own: ROOT/.git as a real directory, or a linked worktree,
 * i.e. a git dir directly under commonDir/worktrees whose back-pointer names ROOT/.git. A gitdir
 * file elsewhere (another repository's own git dir) is not a registration. ROOT/.git stays
 * unresolved: a canonical path never ends on a symlink, so a .git symlink can never equal it. A
 * missing .git or back-pointer target is not ours; any other filesystem error is thrown to
 * loadTracked, which reports it with its reason.
 */
function ownGitDir(gitDir: string, commonDir: string): boolean {
  const dotGit = join(ROOT, '.git')
  let stat: ReturnType<typeof lstatSync>
  try {
    stat = lstatSync(dotGit)
  } catch (error) {
    if (absent(error)) return false
    throw error
  }
  if (stat.isDirectory()) return gitDir === dotGit
  if (dirname(gitDir) !== join(commonDir, 'worktrees')) return false
  try {
    const back = readFileSync(join(gitDir, 'gitdir'), 'utf8').trim()
    return realpathSync(resolve(gitDir, back)) === dotGit
  } catch (error) {
    if (absent(error)) return false
    throw error
  }
}

/** Loads the index once, from the scanned tree's own repository. */
function loadTracked(): boolean {
  let out: Buffer
  try {
    const [top = '', dir = '', common = ''] = git(
      'rev-parse',
      '--show-toplevel',
      '--absolute-git-dir',
      '--git-common-dir',
    )
      .toString()
      .replace(/\n$/, '')
      .split('\n')
    const toplevel = realpathSync(top)
    const gitDir = realpathSync(dir)
    if (toplevel !== ROOT || !ownGitDir(gitDir, realpathSync(resolve(ROOT, common)))) {
      report(
        '.',
        1,
        'git-not-own',
        `git is required to verify related paths: the scan root is not the work tree of its own repository (git resolves ${toplevel} with ${gitDir}; a moved linked worktree needs git worktree repair)`,
      )
      return false
    }
    out = git('ls-files', '-s', '-z')
  } catch (error) {
    const reason = reasonOf(error)
    report('.', 1, 'git-failed', `git is required to verify related paths: ${reason}`)
    return false
  }
  loadIndex(out)
  return true
}

function main(): void {
  const ready = bunYamlReady() && loadTracked()
  const files = ready ? listAdrs() : null
  if (files !== null) {
    const axial: string[] = []
    const adrs = new Map(files.map((file) => [file, checkAdr(file, axial)] as const))
    checkAxial(adrs, axial)
    checkIndex(adrs)
  }
  issues.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line))
  if (issues.length > 0) {
    for (const issue of issues)
      console.error(`${issue.file}:${issue.line}: ${issue.message} [${issue.rule}]`)
    console.error(`check-adr-frontmatter: FAIL (${issues.length} violation(s))`)
    process.exitCode = 1
    return
  }
  console.log(`check-adr-frontmatter: OK (${files?.length} ADRs, ${relatedPaths} related paths)`)
}

if (import.meta.main) main()
