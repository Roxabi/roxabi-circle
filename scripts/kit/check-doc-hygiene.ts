#!/usr/bin/env bun
/** Documentation SSoT and local Markdown-link hygiene. No network access. */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const ROOT = realpathSync(
  resolve(
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: fixture override is intentionally outside Turbo
    process.env.DOC_HYGIENE_ROOT ?? join(import.meta.dirname, '../..'),
  ),
)
const STACK = '.claude/stack.yml'
const INDEX = 'docs/kit/README.md'
const REQUIRED_MARKDOWN = ['AGENTS.md', 'CLAUDE.md', 'README.md']

type Issue = { file: string; line: number; message: string }
type Link = { line: number; raw: string; target: string }
type Target = { line: number; key: string; value: string }
const issues: Issue[] = []

function rel(path: string): string {
  return relative(ROOT, path).split(sep).join('/') || '.'
}

function report(file: string, line: number, message: string): void {
  issues.push({ file: file.split(sep).join('/'), line, message })
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function isInside(path: string): boolean {
  return path === ROOT || path.startsWith(`${ROOT}${sep}`)
}

function stripYamlComment(value: string): string {
  let quote = ''
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (quote) {
      if (char === quote && value[i - 1] !== '\\') quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char === '#') return value.slice(0, i).trim()
  }
  return value.trim()
}

function scalar(value: string): string | null {
  const clean = stripYamlComment(value)
  if (!clean) return null
  if (clean.startsWith('"') && clean.endsWith('"')) {
    try {
      return JSON.parse(clean) as string
    } catch {
      return null
    }
  }
  if (clean.startsWith("'") && clean.endsWith("'")) return clean.slice(1, -1).replaceAll("''", "'")
  if (/^[[{]|[\]}]$/.test(clean)) return null
  return clean
}

function parseStack(): Target[] {
  const path = join(ROOT, STACK)
  if (!existsSync(path)) {
    report(STACK, 1, 'missing stack manifest')
    return []
  }
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  const standards: Target[] = []
  let section = ''
  let docsPath: Target | null = null
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]
    const uncommented = stripYamlComment(raw)
    if (!uncommented) continue
    const indent = raw.match(/^ */)?.[0].length ?? 0
    if (indent === 0) {
      section = uncommented.match(/^([A-Za-z0-9_-]+):\s*$/)?.[1] ?? ''
      continue
    }
    if (section !== 'standards' && section !== 'docs') continue
    if (indent !== 2) {
      if (section === 'standards') {
        report(STACK, index + 1, 'standards must be a flat key: path mapping')
      }
      continue
    }
    const match = uncommented.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) {
      report(STACK, index + 1, `invalid ${section} mapping`)
      continue
    }
    const value = scalar(match[2])
    if (section === 'standards') {
      if (value === null) report(STACK, index + 1, `standard ${match[1]} must have a path`)
      else standards.push({ line: index + 1, key: match[1], value })
    } else if (match[1] === 'path') {
      if (value === null) report(STACK, index + 1, 'docs.path must be a path')
      else docsPath = { line: index + 1, key: 'docs.path', value }
    }
  }
  if (standards.length === 0) report(STACK, 1, 'standards block is missing or empty')
  if (!docsPath) report(STACK, 1, 'docs.path is missing')
  const targets = docsPath ? [...standards, docsPath] : standards
  for (const target of targets) {
    const absolute = resolve(ROOT, target.value)
    if (!isInside(absolute)) {
      report(STACK, target.line, `${target.key} escapes repository: ${target.value}`)
      continue
    }
    if (!existsSync(absolute)) {
      report(STACK, target.line, `${target.key} target does not exist: ${target.value}`)
    } else if (!isInside(realpathSync(absolute))) {
      report(STACK, target.line, `${target.key} resolves outside repository: ${target.value}`)
    }
  }
  return standards
}

function walkMarkdown(dir: string, output: string[]): void {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walkMarkdown(path, output)
    else if (stat.isFile() && name.endsWith('.md')) output.push(path)
  }
}

function markdownLinks(path: string): Link[] {
  const links: Link[] = []
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  let fence = ''
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1] ?? ''
    if (marker) {
      if (!fence) fence = marker
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = ''
      continue
    }
    if (fence) continue
    const found = new Set<string>()
    const add = (raw: string): void => {
      if (found.has(raw)) return
      found.add(raw)
      const target = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw
      links.push({ line: index + 1, raw, target })
    }
    for (const match of line.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+[^)]*)?\)/g)) {
      add(match[1])
    }
    const definition = line.match(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/)
    if (definition) add(definition[1])
  }
  return links
}

function ignoredLink(link: Link): boolean {
  const target = link.target.trim()
  if (
    !target ||
    /^(?:https?:|mailto:)/i.test(target) ||
    target.startsWith('#') ||
    target.startsWith('~')
  ) {
    return true
  }
  if (/\.\.\.|…|<[^>]+>|\{[^}]*\}|\$[A-Za-z_{]|\[[^\]]+\]|[*]/.test(target)) return true
  return link.raw.startsWith('<') && !/[/.]/.test(target)
}

function resolveLink(source: string, link: Link, diagnose: boolean): string | null {
  if (ignoredLink(link)) return null
  const pathPart = link.target.split('#', 1)[0].split('?', 1)[0]
  let decoded: string
  try {
    decoded = decodeURIComponent(pathPart)
  } catch {
    if (diagnose) report(rel(source), link.line, `invalid URL encoding in link: ${link.target}`)
    return null
  }
  const absolute = resolve(dirname(source), decoded)
  if (!isInside(absolute)) {
    if (diagnose) report(rel(source), link.line, `link escapes repository: ${link.target}`)
    return null
  }
  if (!existsSync(absolute)) {
    if (diagnose) report(rel(source), link.line, `broken internal link: ${link.target}`)
    return absolute
  }
  const actual = realpathSync(absolute)
  if (!isInside(actual)) {
    if (diagnose) report(rel(source), link.line, `link resolves outside repository: ${link.target}`)
    return null
  }
  return actual
}

function checkClaudeImports(): void {
  const path = join(ROOT, 'CLAUDE.md')
  if (!existsSync(path)) return
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  if (lines[0]?.trim() !== '@.claude/stack.yml') {
    report('CLAUDE.md', 1, 'first line must import @.claude/stack.yml')
  }
  const agentsLine = lines.findIndex((line) => line.trim() === '@AGENTS.md')
  if (agentsLine < 0) {
    report('CLAUDE.md', 1, 'missing import @AGENTS.md')
    return
  }
  let comment = false
  for (let index = 1; index < agentsLine; index += 1) {
    const line = lines[index].trim()
    if (line.includes('<!--')) comment = true
    const normative = line && !comment
    if (line.includes('-->')) comment = false
    if (normative) {
      report('CLAUDE.md', index + 1, 'content must follow the @AGENTS.md import')
    }
  }
}

function main(): void {
  const standards = parseStack()
  checkClaudeImports()
  const markdown: string[] = []
  for (const file of REQUIRED_MARKDOWN) {
    const path = join(ROOT, file)
    if (!existsSync(path)) report(file, 1, 'required Markdown file is missing')
    else markdown.push(path)
  }
  walkMarkdown(join(ROOT, 'docs/kit'), markdown)
  markdown.sort((a, b) => compareText(rel(a), rel(b)))
  const linksByFile = new Map<string, Link[]>()
  let checkedLinks = 0
  for (const file of markdown) {
    const links = markdownLinks(file)
    linksByFile.set(file, links)
    for (const link of links) {
      if (!ignoredLink(link)) checkedLinks += 1
      resolveLink(file, link, true)
    }
  }
  const indexPath = join(ROOT, INDEX)
  if (!existsSync(indexPath)) report(INDEX, 1, 'central documentation index is missing')
  else {
    const indexed = new Set(
      (linksByFile.get(indexPath) ?? markdownLinks(indexPath))
        .map((link) => resolveLink(indexPath, link, false))
        .filter((path): path is string => path !== null),
    )
    for (const file of markdown) {
      if (
        rel(file).startsWith('docs/kit/') &&
        rel(file) !== INDEX &&
        !indexed.has(realpathSync(file))
      ) {
        report(rel(file), 1, `document is not referenced by ${INDEX}`)
      }
    }
  }
  issues.sort(
    (a, b) => compareText(a.file, b.file) || a.line - b.line || compareText(a.message, b.message),
  )
  if (issues.length > 0) {
    for (const issue of issues) console.error(`${issue.file}:${issue.line}: ${issue.message}`)
    console.error(`check-doc-hygiene: FAIL (${issues.length} violation(s))`)
    process.exitCode = 1
    return
  }
  console.log(
    `check-doc-hygiene: OK (${standards.length} standards, ${markdown.length} Markdown files, ${checkedLinks} internal links)`,
  )
}

main()
