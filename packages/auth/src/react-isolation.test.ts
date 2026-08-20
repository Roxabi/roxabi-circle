import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)))

function walkTs(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) {
      if (name === 'react') continue
      walkTs(abs, out)
    } else if (/\.(ts|tsx)$/.test(name) && !name.includes('.test.')) {
      out.push(abs)
    }
  }
}

describe('Worker auth graph stays React-free', () => {
  it('non-react src must not import react, @kit/ui, or ./react', () => {
    const files: string[] = []
    walkTs(srcRoot, files)
    const banned = /from\s+['"](react|react-dom|@kit\/ui|\.\/react|@kit\/auth\/react)/
    const hits: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      if (banned.test(text)) hits.push(file)
    }
    expect(hits).toEqual([])
  })
})
