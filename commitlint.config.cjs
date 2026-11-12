const { findBareRefs } = require('./scripts/kit/lib/bare-issue-ref.cjs')

// Two repositories number their issues independently, so a bare `#N` is ambiguous. Header, body and
// footer must reference issues as `owner/repo#N` (trailer `Refs: Roxabi/roxabi-boilerplate-cf#240`
// or `Closes Roxabi/roxabi-boilerplate-cf#240`), never in the scope. Same detector as `doc:check`.
const noBareIssueRef = (parsed) => {
  const hits = [parsed.header, parsed.body, parsed.footer]
    .filter((part) => typeof part === 'string')
    .flatMap((part) => findBareRefs(part, { markdown: true }))
    .map((hit) => hit.ref)
  return [
    hits.length === 0,
    `bare issue reference ${hits.join(', ')}: write owner/repo#N (e.g. Roxabi/roxabi-boilerplate-cf#240), never a bare number, in the scope or anywhere else`,
  ]
}

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [{ rules: { 'no-bare-issue-ref': noBareIssueRef } }],
  rules: { 'no-bare-issue-ref': [2, 'always'] },
}
