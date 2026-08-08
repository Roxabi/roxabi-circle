#!/usr/bin/env bash
# Fail if kit manifests pin typescript outside exclusive ^7.x, or if bun.lock has
# non-allowlisted typescript@5./@6. package keys, or if the lock lacks a positive
# typescript@7. resolution. Kit compiler must be 7.x.
# Allowlist: empty by default. Dual-install (API 6 + native tsc 7) may add exact keys later.
set -euo pipefail

# Override for self-tests (never set in prod/CI to a path outside the monorepo).
ROOT="${TS_MAJOR_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

# package.json files that must declare typescript ^7 (root + all workspaces that pin it)
PIN_FILES=(
  package.json
  packages/api-client/package.json
  packages/auth/package.json
  packages/core/package.json
  packages/db/package.json
  packages/email/package.json
  packages/flows/package.json
  packages/i18n/package.json
  packages/mcp/package.json
  packages/storage/package.json
  packages/types/package.json
  packages/ui/package.json
  apps/example-api/package.json
  apps/example-web/package.json
  apps/mcp-example/package.json
)

# Exclusive ^7 pin: caret + major 7 only — reject || dual-ranges, spaces, npm: aliases, 5/6.
# Accepts: ^7 | ^7.0 | ^7.0.2
PIN_RE='^\^7(\.[0-9]+){0,2}$'

fail=0
pin_count=0

for f in "${PIN_FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "check-typescript-major: missing $f" >&2
    fail=1
    continue
  fi
  line="$(grep -E '"typescript"' "$f" || true)"
  if [[ -z "$line" ]]; then
    echo "check-typescript-major: $f has no typescript pin (expected ^7.x)" >&2
    fail=1
    continue
  fi
  # Extract first double-quoted value after "typescript"
  val=""
  if [[ "$line" =~ \"typescript\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
    val="${BASH_REMATCH[1]}"
  fi
  if [[ -z "$val" ]]; then
    echo "check-typescript-major: $f could not parse typescript pin: $line" >&2
    fail=1
    continue
  fi
  if [[ ! "$val" =~ $PIN_RE ]]; then
    echo "check-typescript-major: $f pin must match exclusive ^7.x (got: $val)" >&2
    fail=1
    continue
  fi
  pin_count=$((pin_count + 1))
done

if [[ ! -f bun.lock ]]; then
  echo "check-typescript-major: bun.lock missing" >&2
  exit 1
fi

# Positive identity: resolved compiler package must be typescript@7.x
if ! grep -qE '\[\"typescript@7\.' bun.lock; then
  echo "check-typescript-major: bun.lock missing positive typescript@7. resolution" >&2
  fail=1
fi

# Residual typescript@5. / @6. lock package keys must be exact-allowlisted.
# bun.lock lines look like:     "typescript": ["typescript@5.9.3", …]
# or nested: "some-tool/typescript": ["typescript@6.0.2", …]
# Platform optional deps @typescript/typescript-linux-x64@7… are fine (7.x).
ALLOWLIST=(
  # dual-install API exception: set key from an actual bun.lock residual line, e.g. "typescript"
)

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  key=""
  if [[ "$line" =~ \"([^\"]+)\":[[:space:]]*\[\"typescript@[56]\. ]]; then
    key="${BASH_REMATCH[1]}"
  fi
  allowed=0
  if [[ -n "$key" ]]; then
    for a in "${ALLOWLIST[@]}"; do
      if [[ "$key" == "$a" ]]; then
        allowed=1
        break
      fi
    done
  fi
  if [[ "$allowed" -eq 0 ]]; then
    echo "check-typescript-major: non-allowlisted typescript@5/6 in bun.lock:" >&2
    echo "  $line" >&2
    fail=1
  fi
done < <(grep -E 'typescript@[56]\.' bun.lock || true)

# Optional runtime probe when local tsc is available (CI after bun install)
if [[ -x ./node_modules/.bin/tsc ]]; then
  ver="$(./node_modules/.bin/tsc --version 2>/dev/null || true)"
  if [[ ! "$ver" =~ ^Version[[:space:]]+7\. ]]; then
    echo "check-typescript-major: local tsc is not 7.x (got: ${ver:-missing})" >&2
    fail=1
  fi
fi

if [[ "$fail" -ne 0 ]]; then
  echo "check-typescript-major: FAILED" >&2
  exit 1
fi

echo "check-typescript-major: OK (${pin_count} pins exclusive ^7; typescript@7. in lock; no non-allowlisted @5/@6)"
