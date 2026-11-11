#!/usr/bin/env bash
# Pinned actionlint for promote-deploy --check (Roxabi/roxabi-boilerplate-cf#325).
# Binary: repo-pinned under .cache/actionlint/<ver>/ — never PATH, never latest.
# Pin SSoT: config/kit/actionlint.version. Config SSoT: config/kit/actionlint.yaml.
# A product .github/actionlint.yaml is not read: -config-file replaces it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PIN="${ROOT}/config/kit/actionlint.version"
CONFIG="${ROOT}/config/kit/actionlint.yaml"

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

[ -f "$CONFIG" ] || {
  echo >&2 "ERROR: missing kit actionlint config ${CONFIG}"
  exit 1
}

AL_VERSION="$(pin_get version)"

al_target() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "${os}:${arch}" in
    Linux:x86_64) printf '%s\n' linux_amd64 ;;
    Linux:aarch64 | Linux:arm64) printf '%s\n' linux_arm64 ;;
    Darwin:x86_64) printf '%s\n' darwin_amd64 ;;
    Darwin:arm64) printf '%s\n' darwin_arm64 ;;
    *)
      echo >&2 "ERROR: no actionlint pin for ${os}/${arch}"
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

ensure_repo_actionlint() {
  local target archive want dir url sha bin_want got
  target="$(al_target)" || exit 1
  want="$(pin_get "sha256_${target}")" || {
    echo >&2 "ERROR: no checksum pin for ${target}"
    exit 1
  }
  bin_want="$(pin_get "sha256_bin_${target}")"
  dir="${ROOT}/.cache/actionlint/${AL_VERSION}/${target}"
  AL_BIN="${dir}/actionlint"
  if [ -s "$AL_BIN" ]; then
    got="$(file_sha256 "$AL_BIN")"
    if [ "$got" = "$bin_want" ]; then
      return 0
    fi
    echo >&2 "actionlint: cached binary hash mismatch — re-fetching"
  fi
  archive="actionlint_${AL_VERSION}_${target}.tar.gz"
  url="https://github.com/rhysd/actionlint/releases/download/v${AL_VERSION}/${archive}"
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/actionlint-pin.XXXXXX")"
  echo >&2 "actionlint: fetching pinned v${AL_VERSION} (${target})"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 -o "${tmp}/${archive}" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "${tmp}/${archive}" "$url"
  else
    echo >&2 "ERROR: need curl or wget to fetch pinned actionlint"
    exit 1
  fi
  sha="$(file_sha256 "${tmp}/${archive}")"
  if [ "$sha" != "$want" ]; then
    echo >&2 "ERROR: actionlint archive checksum mismatch (${target})"
    echo >&2 "  want ${want}"
    echo >&2 "  got  ${sha}"
    exit 1
  fi
  tar -xzf "${tmp}/${archive}" -C "$tmp" actionlint
  got="$(file_sha256 "${tmp}/actionlint")"
  if [ "$got" != "$bin_want" ]; then
    echo >&2 "ERROR: extracted actionlint hash mismatch (${target})"
    echo >&2 "  want ${bin_want}"
    echo >&2 "  got  ${got}"
    exit 1
  fi
  mkdir -p "$dir"
  mv -f "${tmp}/actionlint" "$AL_BIN"
  chmod +x "$AL_BIN"
  rm -rf "$tmp"
}

if [ "$#" -eq 0 ]; then
  echo >&2 "ERROR: actionlint-check.sh needs workflow files; it does not scan the tree"
  exit 1
fi

ensure_repo_actionlint
ver="$("$AL_BIN" -version)"
ver="${ver%%$'\n'*}"
if [ "$ver" != "$AL_VERSION" ]; then
  echo >&2 "ERROR: actionlint -version is '${ver}', pin is ${AL_VERSION}"
  exit 1
fi
# -config-file replaces .github/actionlint.yaml. Empty -shellcheck/-pyflakes disable
# those integrations (Roxabi/roxabi-boilerplate-cf#325 baseline). No -ignore.
exec "$AL_BIN" \
  -config-file "$CONFIG" \
  -shellcheck= \
  -pyflakes= \
  -no-color \
  -oneline \
  "$@"
