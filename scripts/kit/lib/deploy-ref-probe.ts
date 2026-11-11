/**
 * Classifies one `git rev-parse --verify` probe of a deploy ref (Roxabi/roxabi-boilerplate-cf#331).
 * Exit 1 with empty output is absence. A signal or a null status is not absence.
 */
export type DeployRefProbe = {
  status: number | null
  signal: string | null
  stdout: string
  stderr: string
  error?: string
}

export function classifyDeployRefProbe(
  ref: string,
  probe: DeployRefProbe,
): { sha: string | null } | { refusal: string } {
  if (probe.error) return { refusal: `cannot read ${ref}: ${probe.error}` }
  if (probe.signal !== null || probe.status === null) {
    return { refusal: `cannot read ${ref}: git terminated by signal ${probe.signal ?? 'unknown'}` }
  }
  const out = probe.stdout.trim()
  const err = probe.stderr.trim()
  if (probe.status === 0) return { sha: out }
  if (probe.status === 1 && err === '' && out === '') return { sha: null }
  return { refusal: `cannot read ${ref}: ${err || out || `exit ${probe.status}`}` }
}
