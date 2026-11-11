#!/usr/bin/env bash
# Sourced by api-deploy.sh and web-build.sh (Roxabi/roxabi-boilerplate-cf#256). The showcase ships only from deploy/main, which
# the Deploy gate fast-forwards after CI is green on that exact commit. Anything else — main itself,
# deploy/staging, an empty or unset branch — refuses before migrate, deploy or build.
# Usage: require_deploy_branch <ROOT> <verb>
require_deploy_branch() {
  local root="$1" verb="$2" raw branch
  # CF Workers Builds sets WORKERS_CI_BRANCH, Pages sets CF_PAGES_BRANCH; a laptop falls back to git.
  raw="${WORKERS_CI_BRANCH:-${CF_PAGES_BRANCH:-}}"
  if [[ -z "${raw}" ]]; then
    raw="$(git -C "${root}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  fi
  branch="${raw#refs/heads/}"
  echo "cf-builds: branch '${raw:-unknown}'"
  if [[ "${branch}" != "deploy/main" ]]; then
    echo "error: refusing ${verb} — branch is '${raw:-unknown}', only deploy/main (CI-gated) is allowed." >&2
    echo "  Break-glass: docs/kit/deploy-cloudflare.md § Break-glass." >&2
    exit 1
  fi
}
