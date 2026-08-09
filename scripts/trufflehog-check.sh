#!/usr/bin/env bash
# Primary secret gate (before GitHub): lefthook pre-commit + pre-push.
# CI re-runs as secondary filet (.github/workflows/secret-scan.yml).
#
# Scope (not full history):
#   1) Commits after origin base (origin/staging|main|master)
#   2) Staged files (about to be committed)
#
# Exclude SSoT: scripts/trufflehog-exclude-paths.txt
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

EXCLUDE_SRC="${ROOT}/scripts/trufflehog-exclude-paths.txt"
DETECTORS_SRC="${ROOT}/scripts/trufflehog-detectors.yaml"
excl=$(mktemp)
staged_list=$(mktemp)
trap 'rm -f "$excl" "$staged_list"' EXIT

if [ -f "$EXCLUDE_SRC" ]; then
  grep -vE '^\s*(#|$)' "$EXCLUDE_SRC" > "$excl" || true
else
  printf '%s\n' 'node_modules' '\.venv' > "$excl"
  echo >&2 "WARN: ${EXCLUDE_SRC} missing — minimal excludes only"
fi

# Kit-issued secrets (`sk_`) have no third-party API to verify against, so they are always
# *unverified* findings and `--only-verified` drops them silently. They therefore need their
# own pass, without that flag, scoped to our detectors. Measured to report 0 on a clean tree.
# Rationale + numbers: scripts/trufflehog-detectors.yaml
custom_detectors=1
if [ ! -f "$DETECTORS_SRC" ]; then
  custom_detectors=0
  echo >&2 "WARN: ${DETECTORS_SRC} missing — kit-issued sk_ keys are NOT scanned"
fi

if ! command -v trufflehog >/dev/null 2>&1; then
  echo >&2 "ERROR: trufflehog not installed"
  echo >&2 "  brew install trufflehog  |  https://github.com/trufflesecurity/trufflehog/releases"
  exit 1
fi

detect_base_ref() {
  local c
  for c in origin/staging origin/main origin/master staging main master; do
    if git rev-parse --verify --quiet "$c" >/dev/null 2>&1; then
      printf '%s\n' "$c"
      return 0
    fi
  done
  return 1
}

failed=0
scanned=0

if base_ref="$(detect_base_ref)"; then
  base_sha="$(git rev-parse "$base_ref")"
  head_sha="$(git rev-parse HEAD)"
  if [ "$base_sha" != "$head_sha" ]; then
    since_sha="$(git merge-base HEAD "$base_ref" 2>/dev/null || printf '%s' "$base_sha")"
    ahead="$(git rev-list --count "${since_sha}..HEAD" 2>/dev/null || echo 0)"
    if [ "${ahead:-0}" -gt 0 ]; then
      echo "trufflehog: scanning ${ahead} commit(s) after ${base_ref} (${since_sha:0:7}..HEAD)"
      scanned=1
      if ! trufflehog git "file://${ROOT}" \
        --since-commit="$since_sha" \
        --only-verified \
        --fail \
        --exclude-paths="$excl"; then
        failed=1
      fi
      if [ "$custom_detectors" -eq 1 ] && ! trufflehog git "file://${ROOT}" \
        --since-commit="$since_sha" \
        --config="$DETECTORS_SRC" \
        --fail \
        --exclude-paths="$excl"; then
        failed=1
      fi
    fi
  fi
else
  echo >&2 "trufflehog: no base ref (origin/main|staging|…) — skip commit-range scan"
fi

git diff --cached --name-only --diff-filter=ACMR -z 2>/dev/null \
  | tr '\0' '\n' \
  | while IFS= read -r f; do
      [ -n "$f" ] && [ -f "$f" ] && printf '%s\n' "$f"
    done > "$staged_list" || true

if [ -s "$staged_list" ]; then
  mapfile -t staged_files < "$staged_list"
  echo "trufflehog: scanning ${#staged_files[@]} staged file(s)"
  scanned=1
  if ! trufflehog filesystem \
    --only-verified \
    --fail \
    --exclude-paths="$excl" \
    "${staged_files[@]}"; then
    failed=1
  fi
  if [ "$custom_detectors" -eq 1 ] && ! trufflehog filesystem \
    --config="$DETECTORS_SRC" \
    --fail \
    --exclude-paths="$excl" \
    "${staged_files[@]}"; then
    failed=1
  fi
fi

if [ "$scanned" -eq 0 ]; then
  echo "trufflehog: nothing in range (on base, no staged files) — ok"
  exit 0
fi

if [ "$failed" -ne 0 ]; then
  echo >&2 "trufflehog: secret(s) found — fix before commit/push (CI is too late)"
  exit 183
fi

exit 0
