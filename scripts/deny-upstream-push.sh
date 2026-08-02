#!/usr/bin/env bash
# Block product repos from pushing to kit / intermediate bounce parents.
#
# Shipped **in the kit** so product forks need NOT edit lefthook.yml.
# Safe on the kit itself: when origin is silex-boilerplate, all pushes allowed.
#
# Defaults (kit):
#   - remote name `upstream`
#   - URL substring `silex-boilerplate`
#
# Product multi-hop extend (zero-edit free — do not patch this file):
#   - env DENY_UPSTREAM_URL_SUBSTRINGS=comma,separated,slugs
#   - docs/product/deny-upstream.json → { "urlSubstrings": ["…"] }
#   - optional kit config/deny-upstream-remotes.json (kit-generic only)
#
# Lefthook pre-push: bash scripts/deny-upstream-push.sh {1} {2}
# {1} = remote name · {2} = remote URL
#
# Client-side UX only — LEFTHOOK=0 / --no-verify still bypass; real integrity = GH write ACLs.
set -euo pipefail

remote_name="${1:-}"
remote_url="${2:-}"

# Resolve monorepo root (lefthook / harness may run with different $PWD).
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${REPO_ROOT}" ]]; then
  REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fi

deny() {
  echo "deny-upstream-push: blocked push to denied parent/kit remote" >&2
  echo "  remote=${remote_name:-?} url=${remote_url:-?}" >&2
  echo "  Kit changes → push from go-silex/silex-boilerplate (origin there)." >&2
  echo "  Product repo → only: git push origin …" >&2
  echo "  Multi-hop chassis: set DENY_UPSTREAM_URL_SUBSTRINGS or docs/product/deny-upstream.json" >&2
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
    # bun failed after warn path already printed to stderr in script; swallow
    return 0
  fi
}

# --- kit origin: no-op (maintainers may push any remote) ---
origin_url="$(git -C "${REPO_ROOT}" remote get-url origin 2>/dev/null || true)"
if [[ "${origin_url}" == *silex-boilerplate* ]]; then
  exit 0
fi

# --- build substring denylist (union) ---
# Builtin kit identity
declare -a SUBSTRINGS=("silex-boilerplate")

# Optional kit config (generic only — do not put product chassis names here)
while IFS= read -r line; do
  [[ -n "${line}" ]] && SUBSTRINGS+=("${line}")
done < <(read_json_substrings "${REPO_ROOT}/config/deny-upstream-remotes.json")

# Product-owned extend (zero-edit free path)
while IFS= read -r line; do
  [[ -n "${line}" ]] && SUBSTRINGS+=("${line}")
done < <(read_json_substrings "${REPO_ROOT}/docs/product/deny-upstream.json")

# Env: DENY_UPSTREAM_URL_SUBSTRINGS=comma,separated (trim, drop empty)
if [[ -n "${DENY_UPSTREAM_URL_SUBSTRINGS:-}" ]]; then
  IFS=',' read -ra ENV_PARTS <<< "${DENY_UPSTREAM_URL_SUBSTRINGS}"
  for part in "${ENV_PARTS[@]}"; do
    # trim whitespace
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
