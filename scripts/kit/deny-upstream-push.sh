#!/usr/bin/env bash
# Block product repos from pushing to kit / intermediate parents.
#
# Shipped **in the kit** so product forks need NOT edit lefthook.yml.
#
# Kit clone heuristic (brand-agnostic, ADR-0009):
#   no config/product/inheritance.json → kit → allow
# Product clone:
#   has inheritance marker (or transitional kit-baseline) → deny remote name `upstream`
#   + optional URL substrings
#
# Product multi-hop extend (zero-edit free — do not patch this file):
#   - env DENY_UPSTREAM_URL_SUBSTRINGS=comma,separated,slugs
#   - docs/product/deny-upstream.json → { "urlSubstrings": ["…"] }
#   - optional kit config/kit/deny-upstream-remotes.json (kit-generic only)
#
# Lefthook pre-push: bash scripts/kit/deny-upstream-push.sh {1} {2}
# {1} = remote name · {2} = remote URL
#
# Client-side UX only — LEFTHOOK=0 / --no-verify still bypass; real integrity = GH write ACLs.
set -euo pipefail

remote_name="${1:-}"
remote_url="${2:-}"

# Resolve monorepo root (lefthook / harness may run with different $PWD).
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${REPO_ROOT}" ]]; then
  REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
fi

deny() {
  echo "deny-upstream-push: blocked push to denied parent/kit remote" >&2
  echo "  remote=${remote_name:-?} url=${remote_url:-?}" >&2
  echo "  Shared kit changes → land on a kit clone (push origin / contribute flow)." >&2
  echo "  Product repo → only: git push origin …" >&2
  echo "  Multi-hop: DENY_UPSTREAM_URL_SUBSTRINGS or docs/product/deny-upstream.json" >&2
  exit 1
}

# Collect urlSubstrings from a JSON file via Bun (missing/invalid → empty, warn once).
# Prints one substring per line (trimmed, non-empty).
read_json_substrings() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    return 0
  fi
  if ! command -v bun >/dev/null 2>&1; then
    echo "deny-upstream-push: warn: bun not found; ignoring ${file}" >&2
    return 0
  fi
  # shellcheck disable=SC2016
  if ! bun -e '
    const fs = require("fs");
    const path = process.argv[1];
    let raw;
    try { raw = fs.readFileSync(path, "utf8"); } catch { process.exit(0); }
    let data;
    try { data = JSON.parse(raw); } catch {
      console.error("deny-upstream-push: warn: invalid JSON, ignoring " + path);
      process.exit(0);
    }
    const arr = data && Array.isArray(data.urlSubstrings) ? data.urlSubstrings : [];
    for (const s of arr) {
      if (typeof s === "string") {
        const t = s.trim();
        if (t) console.log(t);
      }
    }
  ' "${file}" 2>/dev/null; then
    return 0
  fi
}

# --- kit tree: no product inheritance marker → maintainer no-op ---
if [[ ! -f "${REPO_ROOT}/config/product/inheritance.json" ]]; then
  exit 0
fi

# --- build substring denylist (union) — no brand builtins ---
declare -a SUBSTRINGS=()

while IFS= read -r line; do
  [[ -n "${line}" ]] && SUBSTRINGS+=("${line}")
done < <(read_json_substrings "${REPO_ROOT}/config/kit/deny-upstream-remotes.json")

while IFS= read -r line; do
  [[ -n "${line}" ]] && SUBSTRINGS+=("${line}")
done < <(read_json_substrings "${REPO_ROOT}/docs/product/deny-upstream.json")

if [[ -n "${DENY_UPSTREAM_URL_SUBSTRINGS:-}" ]]; then
  IFS=',' read -ra ENV_PARTS <<< "${DENY_UPSTREAM_URL_SUBSTRINGS}"
  for part in "${ENV_PARTS[@]}"; do
    trimmed="$(echo "${part}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    [[ -n "${trimmed}" ]] && SUBSTRINGS+=("${trimmed}")
  done
fi

# Product: never push to a remote named upstream (immediate parent convention)
if [[ "${remote_name}" == "upstream" ]]; then
  deny
fi

# Product: never push to URL matching any deny substring (case-sensitive)
for s in "${SUBSTRINGS[@]}"; do
  if [[ -n "${s}" && "${remote_url}" == *"${s}"* ]]; then
    deny
  fi
done

exit 0
