'use strict'
// Bare issue/PR reference detector shared by check-qualified-refs.ts (files) and
// commitlint.config.cjs (commit messages). One definition, so the two gates cannot drift.
//
// Two repositories number their issues and PRs independently, so a bare `#N` is ambiguous.
// A reference is qualified when written `owner/repo#N` or as a full URL. Bare means a `#`
// followed by 1-5 digits that is not glued to a word (`repo#N`, hex colors, `&#123;`, `${#1}`)
// and not inside a URL or a Markdown link target (`](#anchor)`).
//
// A `DEBT:<slug> #N` pin is the grammar of scripts/kit/check-debt.ts, not a reference.

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/g
const LINK_TARGET_RE = /\]\([^)\s]*/g
const DEBT_PIN_RE = /DEBT:[a-z0-9]+(?:-[a-z0-9]+)*\s+#\d+/g
const REF_RE = /(?<![\w&${])#(\d{1,5})(?!\w)/g

function mask(text, re) {
  return text.replace(re, (m) => ' '.repeat(m.length))
}

/**
 * @param {string} text
 * @param {{ markdown?: boolean }} [options] markdown: a `[#N]` bracket is a reference,
 *   not a CSS class such as `bg-[#333]`; outside Markdown it is only one when a link follows.
 * @returns {{ index: number, ref: string }[]}
 */
function findBareRefs(text, options = {}) {
  const markdown = options.markdown === true
  const masked = mask(mask(mask(text, URL_RE), LINK_TARGET_RE), DEBT_PIN_RE)
  const found = []
  for (const match of masked.matchAll(REF_RE)) {
    const before = masked[match.index - 1]
    if (before === '[' && !markdown && !masked.startsWith('](', match.index + match[0].length)) {
      continue
    }
    found.push({ index: match.index, ref: match[0] })
  }
  return found
}

module.exports = { findBareRefs }
