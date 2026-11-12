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

COMMITS_ONLY=0
if [ "${1:-}" = "--commits-only" ]; then
  COMMITS_ONLY=1
  shift
fi

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
  local wf n
  for wf in \
    "${ROOT}/.github/workflows/secret-scan.yml"; do
    [ -f "$wf" ] || {
      echo >&2 "ERROR: missing workflow ${wf}"
      exit 1
    }
    # CI runs this script (introduced-commit patches), not the action's base/head
    # walk (Roxabi/roxabi-boilerplate-cf#284). Zero action pins is required so the broken range cannot return.
    n="$(grep -cE "^[[:space:]]+uses:[[:space:]]*trufflesecurity/trufflehog@" "$wf" || true)"
    if [ "$n" -ne 0 ]; then
      echo >&2 "ERROR: ${wf} must not use trufflesecurity/trufflehog action (got ${n}); use scripts/kit/trufflehog-check.sh --commits-only (Roxabi/roxabi-boilerplate-cf#284)"
      grep -nE 'trufflesecurity/trufflehog@' "$wf" >&2 || true
      exit 1
    fi
    if ! grep -qE "v${THOG_VERSION}" "$wf"; then
      echo >&2 "ERROR: ${wf} must mention pinned v${THOG_VERSION} (from config/kit/trufflehog.version)"
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
commits_list=$(mktemp)
patch_dir=""
tmp=""
trap 'rm -f "$excl" "$staged_list" "$commits_list"; rm -rf "${tmp:-}" "${patch_dir:-}"' EXIT

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
  local target archive want dir url sha bin_want got
  target="$(thog_target)" || exit 1
  want="$(thog_archive_sha256 "$target")" || {
    echo >&2 "ERROR: no checksum pin for ${target}"
    exit 1
  }
  bin_want="$(pin_get "sha256_bin_${target}")"
  dir="${ROOT}/.cache/trufflehog/${THOG_VERSION}/${target}"
  THOG="${dir}/trufflehog"
  if [ -s "$THOG" ]; then
    got="$(file_sha256 "$THOG")"
    if [ "$got" = "$bin_want" ]; then
      return 0
    fi
    echo >&2 "trufflehog: cached binary hash mismatch — re-fetching"
  fi
  archive="trufflehog_${THOG_VERSION}_${target}.tar.gz"
  url="https://github.com/trufflesecurity/trufflehog/releases/download/v${THOG_VERSION}/${archive}"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/thog-pin.XXXXXX")"
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
  got="$(file_sha256 "$THOG")"
  if [ "$got" != "$bin_want" ]; then
    echo >&2 "ERROR: extracted trufflehog hash mismatch (${target})"
    echo >&2 "  want ${bin_want}"
    echo >&2 "  got  ${got}"
    exit 1
  fi
}

ensure_repo_trufflehog

# Every scan goes through here. Without --no-update TruffleHog replaces its own executable
# with the latest release, so the scan runs an unverified version and the next hook sees a
# hash mismatch and re-downloads (Roxabi/roxabi-boilerplate-cf#261). CI's action passes the same flag itself.
thog() {
  "$THOG" --no-update "$@"
}

detect_base_ref() {
  local c rc
  # rc 1 is "this candidate is absent". Any other failure is a git error, not
  # "no base" — swallowing it skips the commit-range scan (Roxabi/roxabi-boilerplate-cf#265).
  for c in origin/staging origin/main origin/master staging main master; do
    rc=0
    git rev-parse --verify --quiet "$c" >/dev/null || rc=$?
    if [ "$rc" -eq 0 ]; then
      printf '%s\n' "$c"
      return 0
    fi
    if [ "$rc" -ne 1 ]; then
      return "$rc"
    fi
  done
  return 1
}

failed=0
scanned=0

# Introduced-commit set is owned by this gate — never --since-commit (Roxabi/roxabi-boilerplate-cf#284).
# TruffleHog's since marker is a date-ordered stop, so a merge of an updated base
# can hide older branch commits. We materialize each introduced commit's --cc
# patch and scan them with the filesystem collector.
scan_introduced_patches() {
  local ahead="$1" label="$2"
  local tip="${THOG_RANGE_HEAD:-HEAD}"
  local sha patch_files=()
  : >"$commits_list"
  if [ -n "${3:-}" ]; then
    git rev-list --reverse "${3}..${tip}" >"$commits_list"
  else
    git rev-list --reverse "$tip" >"$commits_list"
  fi
  ahead="$(grep -c . "$commits_list" || true)"
  if [ "$ahead" -eq 0 ]; then
    return 0
  fi
  echo "trufflehog: scanning ${ahead} introduced commit(s) ${label}"
  patch_dir="$(mktemp -d "${TMPDIR:-/tmp}/thog-patches.XXXXXX")"
  while IFS= read -r sha || [ -n "${sha:-}" ]; do
    [ -n "$sha" ] || continue
    # --cc: merge resolutions included (combined diff).
    git show --cc --format=medium "$sha" >"${patch_dir}/${sha}.patch"
    patch_files+=("${patch_dir}/${sha}.patch")
  done <"$commits_list"
  if [ "${#patch_files[@]}" -eq 0 ]; then
    return 0
  fi
  scanned=1
  if ! thog filesystem \
    --only-verified \
    --fail \
    --exclude-paths="$excl" \
    -- "${patch_files[@]}"; then
    failed=1
  fi
  if [ "$custom_detectors" -eq 1 ] && ! thog filesystem \
    --config="$DETECTORS_SRC" \
    --fail \
    --exclude-paths="$excl" \
    -- "${patch_files[@]}"; then
    failed=1
  fi
}

# CI / explicit range: THOG_RANGE_BASE (empty = full) + THOG_RANGE_HEAD (default HEAD).
# Shared with .github/workflows/secret-scan.yml — do not reimplement (Roxabi/roxabi-boilerplate-cf#284).
# Ordinary local unborn HEAD (no THOG_RANGE_*, not --commits-only): no commit object yet, so
# rev-parse HEAD exits 128 before the index scan. Skip history only when `git show-ref --exists`
# says the branch ref is missing (exit 2). Exit 0, 1, or anything else refuses before the index.
# A Git without --exists fails closed on this path only. Explicit range, --commits-only, corrupt
# or detached missing HEAD, and any other git error stay fail-closed (Roxabi/roxabi-boilerplate-cf#510).
base_rc=0
base_ref=""
base_sha=""
ordinary_unborn=0
if [ "$COMMITS_ONLY" -eq 0 ] && [ "${THOG_RANGE_BASE+x}" != x ] && [ "${THOG_RANGE_HEAD+x}" != x ]; then
  head_rc=0
  head_sha="$(git rev-parse --verify --quiet HEAD)" || head_rc=$?
  if [ "$head_rc" -eq 0 ]; then
    :
  elif [ "$head_rc" -eq 1 ] && branch_ref="$(git symbolic-ref -q HEAD)"; then
    # --exists does not resolve the object. Only exit 2 (missing) is unborn.
    # 0 = ref present (including a non-OID), 1 = lookup error, other = refuse.
    ref_rc=0
    ref_err="$(git show-ref --exists "$branch_ref" 2>&1)" || ref_rc=$?
    if [ "$ref_rc" -eq 2 ]; then
      ordinary_unborn=1
      head_sha=""
    elif [ "$ref_rc" -eq 0 ]; then
      echo >&2 "trufflehog: refusing unresolved HEAD (${branch_ref}): branch ref exists"
      exit 128
    else
      echo >&2 "trufflehog: refusing unresolved HEAD (${branch_ref}): git show-ref --exists exited ${ref_rc}; not treating it as unborn"
      if [ -n "$ref_err" ]; then
        printf '%s\n' "$ref_err" >&2
      fi
      exit "$ref_rc"
    fi
  else
    git rev-parse --verify HEAD >/dev/null || exit "$head_rc"
    exit "$head_rc"
  fi
else
  head_sha="$(git rev-parse "${THOG_RANGE_HEAD:-HEAD}")"
fi
if [ "$ordinary_unborn" -eq 0 ]; then
  if [ "${THOG_RANGE_BASE+x}" = x ]; then
    base_sha="${THOG_RANGE_BASE}"
    base_ref="THOG_RANGE_BASE"
    if [ -z "$base_sha" ]; then
      # Empty base → full history of head (force-push / orphan).
      ahead="$(git rev-list --count "$head_sha")"
      if [ "$ahead" -gt 0 ]; then
        scan_introduced_patches "$ahead" "(THOG_RANGE empty base → full)"
      fi
      base_rc=2
    else
      base_rc=0
    fi
  else
    base_ref="$(detect_base_ref)" || base_rc=$?
  fi
  if [ "$base_rc" -eq 0 ]; then
    if [ -z "$base_sha" ]; then
      base_sha="$(git rev-parse "$base_ref")"
    fi
    if [ "$base_sha" != "$head_sha" ]; then
      # Always merge-base on resolved SHAs — never the label string. CI sets
      # base_ref=THOG_RANGE_BASE while base_sha is the real object (Roxabi/roxabi-boilerplate-cf#284 review).
      # rc 1: no common ancestor (or a shallow cut) — scan the whole tip history,
      # same as CI with an empty base. Anything else is a git failure; do not
      # substitute the base tip and do not hide stderr (Roxabi/roxabi-boilerplate-cf#265).
      mb_rc=0
      since_sha="$(git merge-base "$head_sha" "$base_sha")" || mb_rc=$?
      if [ "$mb_rc" -eq 1 ]; then
        ahead="$(git rev-list --count "$head_sha")"
        if [ "$ahead" -gt 0 ]; then
          scan_introduced_patches "$ahead" "after ${base_ref} (full history, no merge-base)"
        fi
      elif [ "$mb_rc" -ne 0 ]; then
        exit "$mb_rc"
      else
        ahead="$(git rev-list --count "${since_sha}..${head_sha}")"
        if [ "$ahead" -gt 0 ]; then
          scan_introduced_patches "$ahead" "after ${base_ref} (${since_sha:0:7}..${head_sha:0:7})" "$since_sha"
        fi
      fi
    fi
  elif [ "$base_rc" -eq 1 ]; then
    # No origin base: still scan every local commit (fail closed for introduced
    # history). Never report "on base" / skip (Roxabi/roxabi-boilerplate-cf#284).
    ahead="$(git rev-list --count "$head_sha")"
    if [ "$ahead" -gt 0 ]; then
      scan_introduced_patches "$ahead" "(no origin base — full local history)"
    fi
  elif [ "$base_rc" -eq 2 ]; then
    : # empty THOG_RANGE_BASE already scanned above
  else
    exit "$base_rc"
  fi
fi

# NUL-delimited on purpose (Roxabi/roxabi-boilerplate-cf#265). Translating the stream to newlines splits a
# name that itself contains a newline; both halves fail `[ -f ]` and the file
# is never scanned. stderr stays attached: a git failure is a hard error, not
# an empty list. (A process substitution would not propagate that status under
# set -e, so the NUL bytes land in a file whose write is a bare command.)
# --diff-filter=d is everything except deletions: a type-change or rename is
# content about to be committed.
if [ "$COMMITS_ONLY" -eq 0 ]; then
  git diff --cached --name-only --diff-filter=d -z >"$staged_list"
else
  : >"$staged_list"
fi
staged_files=()
while IFS= read -r -d '' f || [ -n "${f:-}" ]; do
  [ -n "$f" ] && [ -f "$f" ] && staged_files+=("$f")
done <"$staged_list"

if [ "${#staged_files[@]}" -gt 0 ]; then
  echo "trufflehog: scanning ${#staged_files[@]} staged file(s)"
  scanned=1
  if ! thog filesystem \
    --only-verified \
    --fail \
    --exclude-paths="$excl" \
    -- "${staged_files[@]}"; then
    failed=1
  fi
  if [ "$custom_detectors" -eq 1 ] && ! thog filesystem \
    --config="$DETECTORS_SRC" \
    --fail \
    --exclude-paths="$excl" \
    -- "${staged_files[@]}"; then
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
