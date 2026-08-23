#!/usr/bin/env bash
# Primary secret gate (before GitHub): lefthook pre-commit + pre-push.
# CI re-runs as secondary filet (.github/workflows/secret-scan.yml).
#
# Scope (not full history):
#   1) Commits after origin base (origin/staging|main|master)
#   2) Staged files (about to be committed)
#
# Binary: repo-pinned under .cache/trufflehog/<ver>/ — never PATH.
# Pin SSoT: config/kit/trufflehog.version (version + sha256 + action_sha).
# Exclude SSoT: scripts/kit/trufflehog-exclude-paths.txt
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PIN="${ROOT}/config/kit/trufflehog.version"

pin_get() {
  local key="$1" line
  [ -f "$PIN" ] || {
    echo >&2 "ERROR: missing pin ${PIN}"
    exit 1
  }
  line="$(grep -E "^${key}=" "$PIN" | tail -1 || true)"
  [ -n "$line" ] || {
    echo >&2 "ERROR: pin ${PIN} missing ${key}"
    exit 1
  }
  printf '%s\n' "${line#*=}"
}

THOG_VERSION="$(pin_get version)"
THOG_ACTION_SHA="$(pin_get action_sha)"

assert_action_pin() {
  local wf want uses
  want="trufflesecurity/trufflehog@${THOG_ACTION_SHA} # v${THOG_VERSION}"
  for wf in \
    "${ROOT}/.github/workflows/secret-scan.yml" \
    "${ROOT}/.github/workflows/secret-scan-history.yml"; do
    [ -f "$wf" ] || {
      echo >&2 "ERROR: missing workflow ${wf}"
      exit 1
    }
    uses="$(grep -E 'uses:[[:space:]]*trufflesecurity/trufflehog@' "$wf" || true)"
    [ -n "$uses" ] || {
      echo >&2 "ERROR: ${wf} has no trufflehog action pin"
      exit 1
    }
    if printf '%s\n' "$uses" | grep -vF "uses: ${want}" | grep -q .; then
      echo >&2 "ERROR: ${wf} trufflehog pin drifted from ${PIN}"
      echo >&2 "  want uses: ${want}"
      echo >&2 "$uses"
      exit 1
    fi
  done
}

if [ "${1:-}" = "--assert-pin" ]; then
  assert_action_pin
  echo "trufflehog pin ok: v${THOG_VERSION} @ ${THOG_ACTION_SHA}"
  exit 0
fi

EXCLUDE_SRC="${ROOT}/scripts/kit/trufflehog-exclude-paths.txt"
DETECTORS_SRC="${ROOT}/scripts/kit/trufflehog-detectors.yaml"
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
# Rationale + numbers: scripts/kit/trufflehog-detectors.yaml
custom_detectors=1
if [ ! -f "$DETECTORS_SRC" ]; then
  custom_detectors=0
  echo >&2 "WARN: ${DETECTORS_SRC} missing — kit-issued sk_ keys are NOT scanned"
fi

assert_action_pin

thog_archive_sha256() {
  pin_get "sha256_$1"
}

thog_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "${os}:${arch}" in
    Linux:x86_64) printf '%s\n' linux_amd64 ;;
    Linux:aarch64 | Linux:arm64) printf '%s\n' linux_arm64 ;;
    Darwin:x86_64) printf '%s\n' darwin_amd64 ;;
    Darwin:arm64) printf '%s\n' darwin_arm64 ;;
    *)
      echo >&2 "ERROR: no trufflehog pin for ${os}/${arch}"
      return 1
      ;;
  esac
}

file_sha256() {
  local f="$1" out
  if command -v sha256sum >/dev/null 2>&1; then
    out="$(sha256sum -- "$f")" || return 1
  elif command -v shasum >/dev/null 2>&1; then
    out="$(shasum -a 256 -- "$f")" || return 1
  else
    echo >&2 "ERROR: need sha256sum or shasum -a 256"
    return 1
  fi
  printf '%s' "${out%% *}" | tr 'A-F' 'a-f'
}

ensure_repo_trufflehog() {
  local target archive want tmp dir url sha
  target="$(thog_target)" || exit 1
  want="$(thog_archive_sha256 "$target")" || {
    echo >&2 "ERROR: no checksum pin for ${target}"
    exit 1
  }
  dir="${ROOT}/.cache/trufflehog/${THOG_VERSION}/${target}"
  THOG="${dir}/trufflehog"
  if [ -s "$THOG" ]; then
    thog_ver="$("$THOG" --version 2>&1 || true)"
    if printf '%s' "$thog_ver" | grep -qF "$THOG_VERSION"; then
      return 0
    fi
  fi
  archive="trufflehog_${THOG_VERSION}_${target}.tar.gz"
  url="https://github.com/trufflesecurity/trufflehog/releases/download/v${THOG_VERSION}/${archive}"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/thog-pin.XXXXXX")"
  # shellcheck disable=SC2064
  trap 'rm -rf "$tmp"' RETURN
  echo "trufflehog: fetching pinned v${THOG_VERSION} (${target})"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 -o "${tmp}/${archive}" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "${tmp}/${archive}" "$url"
  else
    echo >&2 "ERROR: need curl or wget to fetch pinned trufflehog"
    exit 1
  fi
  sha="$(file_sha256 "${tmp}/${archive}")"
  if [ "$sha" != "$want" ]; then
    echo >&2 "ERROR: trufflehog archive checksum mismatch (${target})"
    echo >&2 "  want ${want}"
    echo >&2 "  got  ${sha}"
    exit 1
  fi
  tar -xzf "${tmp}/${archive}" -C "$tmp" trufflehog
  mkdir -p "$dir"
  mv -f "${tmp}/trufflehog" "$THOG"
  chmod +x "$THOG"
  thog_ver="$("$THOG" --version 2>&1 || true)"
  if [ ! -s "$THOG" ] || ! printf '%s' "$thog_ver" | grep -qF "$THOG_VERSION"; then
    echo >&2 "ERROR: pinned trufflehog is not runnable (${THOG}: ${thog_ver:-empty})"
    exit 1
  fi
}

ensure_repo_trufflehog

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
      if ! "$THOG" git "file://${ROOT}" \
        --since-commit="$since_sha" \
        --only-verified \
        --fail \
        --exclude-paths="$excl"; then
        failed=1
      fi
      if [ "$custom_detectors" -eq 1 ] && ! "$THOG" git "file://${ROOT}" \
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
  if ! "$THOG" filesystem \
    --only-verified \
    --fail \
    --exclude-paths="$excl" \
    "${staged_files[@]}"; then
    failed=1
  fi
  if [ "$custom_detectors" -eq 1 ] && ! "$THOG" filesystem \
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
