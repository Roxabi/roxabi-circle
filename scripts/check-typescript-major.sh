#!/usr/bin/env bash
# Fail if kit manifests pin typescript outside ^7, or if bun.lock has non-allowlisted
# typescript@5. / typescript@6. package keys (kit compiler must be 7.x).
# Allowlist: empty by default. Dual-install (API 6 + native tsc 7) may add exact keys later.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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

fail=0

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
  if echo "$line" | grep -qE '"typescript":\s*"\^?5'; then
    echo "check-typescript-major: $f still pins typescript 5.x: $line" >&2
    fail=1
  fi
  if echo "$line" | grep -qE '"typescript":\s*"\^?6'; then
    echo "check-typescript-major: $f pins typescript 6.x (end state must be ^7): $line" >&2
    fail=1
  fi
  if ! echo "$line" | grep -qE '"typescript":\s*"\^7'; then
    echo "check-typescript-major: $f typescript pin is not ^7.x: $line" >&2
    fail=1
  fi
done

if [[ ! -f bun.lock ]]; then
  echo "check-typescript-major: bun.lock missing" >&2
  exit 1
fi

# Residual typescript@5. / @6. lock package keys must be exact-allowlisted.
# bun.lock lines look like:     "typescript": ["typescript@5.9.3", …]
# or nested: "some-tool/typescript": ["typescript@6.0.2", …]
# Platform optional deps @typescript/typescript-linux-x64@7… are fine (7.x).
ALLOWLIST=(
  # dual-install API exception keys go here if ever required, e.g.:
  # 'npm:@typescript/typescript6'
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

if [[ "$fail" -ne 0 ]]; then
  echo "check-typescript-major: FAILED" >&2
  exit 1
fi

echo "check-typescript-major: OK (15 pins ^7; no non-allowlisted typescript@5/6 in lock)"
