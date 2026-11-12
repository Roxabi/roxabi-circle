'use strict'

/**
 * Highest-id run of one workflow path; the first of equal ids wins and a missing id ranks as 0.
 * Callers keep their own event, branch, SHA, status, and job policy.
 * @template {{ id?: number, path?: string }} R
 * @param {readonly R[]} runs
 * @param {string} path
 * @returns {R | undefined}
 */
function selectLatestRun(runs, path) {
  /** @type {R | undefined} */
  let latest
  for (const run of runs) {
    if (run.path === path && (latest === undefined || (run.id ?? 0) > (latest.id ?? 0)))
      latest = run
  }
  return latest
}

module.exports = { selectLatestRun }
