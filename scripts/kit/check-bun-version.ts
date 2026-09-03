#!/usr/bin/env bun
/** Enforce package.json as the only Bun-version SSoT. No network access. */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const ROOT = realpathSync(
  resolve(
    // biome-ignore lint/suspicious/noUndeclaredEnvVars: fixture override is intentionally outside Turbo
    process.env.BUN_VERSION_ROOT ?? join(import.meta.dirname, '../..'),
  ),
)
type Issue = { file: string; line: number; message: string }
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

function lineOf(source: string, pattern: RegExp): number {
  const index = source.search(pattern)
  return index < 0 ? 1 : source.slice(0, index).split(/\r?\n/).length
}

function stripYamlComment(line: string): string {
  let quote = ''
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quote) {
      if (char === quote && line[index - 1] !== '\\') quote = ''
    } else if (char === '"' || char === "'") quote = char
    else if (char === '#') return line.slice(0, index)
  }
  return line
}

function packageVersion(): string | null {
  const file = 'package.json'
  const path = join(ROOT, file)
  if (!existsSync(path)) {
    report(file, 1, 'missing package.json')
    return null
  }
  const source = readFileSync(path, 'utf8')
  let packageJson: { packageManager?: unknown }
  try {
    packageJson = JSON.parse(source) as { packageManager?: unknown }
  } catch {
    report(file, 1, 'invalid JSON')
    return null
  }
  const value = packageJson.packageManager
  const line = lineOf(source, /"packageManager"\s*:/)
  if (typeof value !== 'string' || !/^bun@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)) {
    report(file, line, 'packageManager must be an exact bun@<version> (for example bun@1.3.14)')
    return null
  }
  return value.slice('bun@'.length)
}

function checkStack(): void {
  const file = '.claude/stack.yml'
  const path = join(ROOT, file)
  if (!existsSync(path)) {
    report(file, 1, 'missing stack manifest')
    return
  }
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*bun_version\s*:/.test(stripYamlComment(lines[index]))) {
      report(file, index + 1, 'bun_version is forbidden; package.json packageManager is the SSoT')
    }
  }
}

function walkYaml(dir: string, output: string[]): void {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walkYaml(path, output)
    else if (stat.isFile() && /\.ya?ml$/i.test(name)) output.push(path)
  }
}

function indentation(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0
}

function stepBounds(lines: string[], useIndex: number): [number, number] {
  const useIndent = indentation(lines[useIndex])
  let start = useIndex
  for (let index = useIndex; index >= 0; index -= 1) {
    const clean = stripYamlComment(lines[index])
    if (/^\s*-\s+/.test(clean) && indentation(lines[index]) <= useIndent) {
      start = index
      break
    }
  }
  const stepIndent = indentation(lines[start])
  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    const clean = stripYamlComment(lines[index])
    if (/^\s*-\s+/.test(clean) && indentation(lines[index]) <= stepIndent) {
      end = index
      break
    }
  }
  return [start, end]
}

function yamlValue(line: string, key: string): string | null {
  const match = stripYamlComment(line).match(new RegExp(`^\\s*${key}\\s*:\\s*(.*?)\\s*$`))
  if (!match) return null
  const value = match[1]
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function checkSetupBun(path: string): number {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  let uses = 0
  for (let index = 0; index < lines.length; index += 1) {
    const clean = stripYamlComment(lines[index])
    if (!/^\s*(?:-\s*)?uses\s*:\s*["']?oven-sh\/setup-bun@/i.test(clean)) continue
    uses += 1
    const [start, end] = stepBounds(lines, index)
    let versionFileLine = -1
    let validVersionFile = false
    for (let cursor = start; cursor < end; cursor += 1) {
      const versionFile = yamlValue(lines[cursor], 'bun-version-file')
      if (versionFile !== null) {
        versionFileLine = cursor
        if (versionFile === 'package.json') validVersionFile = true
      }
      const version = yamlValue(lines[cursor], 'bun-version')
      if (version !== null && /^\d/.test(version)) {
        report(rel(path), cursor + 1, `numeric bun-version pin is forbidden: ${version}`)
      }
    }
    if (!validVersionFile) {
      const line = versionFileLine >= 0 ? versionFileLine + 1 : index + 1
      report(rel(path), line, 'setup-bun step must set bun-version-file: package.json')
    }
  }
  return uses
}

function main(): void {
  const version = packageVersion()
  checkStack()
  const yaml: string[] = []
  walkYaml(join(ROOT, '.github/workflows'), yaml)
  walkYaml(join(ROOT, 'docs/kit/templates'), yaml)
  yaml.sort((a, b) => compareText(rel(a), rel(b)))
  let setupCount = 0
  for (const path of yaml) setupCount += checkSetupBun(path)
  issues.sort(
    (a, b) => compareText(a.file, b.file) || a.line - b.line || compareText(a.message, b.message),
  )
  if (issues.length > 0) {
    for (const issue of issues) console.error(`${issue.file}:${issue.line}: ${issue.message}`)
    console.error(`check-bun-version: FAIL (${issues.length} violation(s))`)
    process.exitCode = 1
    return
  }
  console.log(
    `check-bun-version: OK (bun@${version}, ${setupCount} setup-bun step(s), ${yaml.length} YAML file(s))`,
  )
}

main()
