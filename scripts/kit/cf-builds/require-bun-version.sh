#!/usr/bin/env bash
# Sourced by install-monorepo.sh, api-deploy.sh and web-build.sh (Roxabi/roxabi-boilerplate-cf#316). package.json#packageManager
# is the only Bun version declaration (CP-BUN-VERSION), but Workers Builds and Pages run the image's
# own Bun — and the image's own `bun install` before the build command — unless the BUN_VERSION
# build variable names another one (Bun has no version file the image reads). Any other Bun refuses
# before install, migrate, deploy or build.
# Usage: package_bun_version <ROOT>   prints the packageManager version, or refuses
#        require_bun_version <ROOT>   refuses unless `bun --version` is that version
# Run, not sourced, it checks the repository it lives in: a product project's build command is
# `bash scripts/kit/cf-builds/require-bun-version.sh`, followed by `&& <product build>` when there is
# one (an empty Workers build command runs no check). Products never run the showcase entrypoints.
# The grammar is check-bun-version.ts's: bun@<x.y.z> with one optional -prerelease or +metadata
# suffix (a Corepack pin is bun@<x.y.z>+sha512.<digest>). `bun --version`, BUN_VERSION and the
# installer tag never carry +metadata, so it is dropped; any other spec refuses.
package_bun_version() {
  local root="$1" spec grammar='^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$'
  spec="$(sed -n 's/^[[:space:]]*"packageManager"[[:space:]]*:[[:space:]]*"bun@\([^"]*\)".*/\1/p' "${root}/package.json")"
  if [[ ! "${spec}" =~ ${grammar} ]]; then
    echo "error: package.json#packageManager names no bun@<version> (bun@<x.y.z>, optional -pre or +metadata; got '${spec}') — refusing to guess the Bun version." >&2
    exit 1
  fi
  printf '%s\n' "${spec%%+*}"
}

require_bun_version() {
  local root="$1" want have
  want="$(package_bun_version "${root}")"
  have="$(bun --version)"
  echo "cf-builds: bun ${have} (package.json#packageManager bun@${want})"
  if [[ "${have}" != "${want}" ]]; then
    echo "error: refusing — bun ${have} is not package.json#packageManager bun@${want}." >&2
    echo "  Set the build variable BUN_VERSION=${want} on this Workers Builds / Pages project: the image's" >&2
    echo "  own pre-install ran with it too. docs/kit/deploy-cloudflare.md § Bun and Node versions." >&2
    exit 1
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set -euo pipefail
  require_bun_version "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
fi
