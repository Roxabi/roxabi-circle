#!/usr/bin/env bash
# Fail if the root (global) typescript pin is not exclusive ^7.x, if a leftover
# workspace pin is not ^7.x, if bun.lock has non-allowlisted typescript@5./@6.
# keys, or if the lock lacks a positive typescript@7. resolution.
# Workspaces inherit the root pin — no census list.
# Allowlist: empty by default. Dual-install (API 6 + native tsc 7) may add exact keys later.
set -euo pipefail

# Override for self-tests (never set in prod/CI to a path outside the monorepo).
ROOT="${TS_MAJOR_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

# Exclusive ^7 pin: caret + major 7 only — reject || dual-ranges, spaces, npm: aliases, 5/6.
# Accepts: ^7 | ^7.0 | ^7.0.2
PIN_RE='^\^7(\.[0-9]+){0,2}$'

fail=0
stray_ok=0

# Print every typescript range in dependencies / devDependencies / optionalDependencies.
# rc 1 = none; rc 2 = present but not a string (unparseable).
pin_values() {
  local file="$1"
  python3 - "$file" <<'PY'
import json, sys
path = sys.argv[1]
try:
    data = json.load(open(path))
except (OSError, json.JSONDecodeError):
    sys.exit(2)
found = []
for key in ("dependencies", "devDependencies", "optionalDependencies"):
    block = data.get(key)
    if not isinstance(block, dict) or "typescript" not in block:
        continue
    val = block["typescript"]
    if not isinstance(val, str) or val == "":
        sys.exit(2)
    found.append(val)
if not found:
    sys.exit(1)
print("\n".join(found))
PY
}

if [[ ! -f package.json ]]; then
  echo "check-typescript-major: missing package.json" >&2
  exit 1
fi

root_pins=""
root_rc=0
root_pins="$(pin_values package.json)" || root_rc=$?
if [[ "$root_rc" -eq 1 ]]; then
  echo "check-typescript-major: package.json has no typescript pin (expected exclusive ^7.x)" >&2
  fail=1
elif [[ "$root_rc" -eq 2 ]]; then
  echo "check-typescript-major: package.json could not parse typescript pin" >&2
  fail=1
else
  while IFS= read -r root_pin; do
    [[ -z "$root_pin" ]] && continue
    if [[ ! "$root_pin" =~ $PIN_RE ]]; then
      echo "check-typescript-major: package.json pin must match exclusive ^7.x (got: $root_pin)" >&2
      fail=1
    fi
  done <<<"$root_pins"
fi

# Leftover workspace pins (inherit is the default). If present, every dep pin must match ^7.
shopt -s nullglob
for f in packages/*/package.json apps/*/package.json; do
  vals=""
  rc=0
  vals="$(pin_values "$f")" || rc=$?
  if [[ "$rc" -eq 1 ]]; then
    continue
  fi
  if [[ "$rc" -eq 2 ]]; then
    echo "check-typescript-major: $f could not parse typescript pin" >&2
    fail=1
    continue
  fi
  leftover_ok=1
  while IFS= read -r val; do
    [[ -z "$val" ]] && continue
    if [[ ! "$val" =~ $PIN_RE ]]; then
      echo "check-typescript-major: $f leftover pin must match exclusive ^7.x (got: $val)" >&2
      leftover_ok=0
      fail=1
    fi
  done <<<"$vals"
  if [[ "$leftover_ok" -eq 1 ]]; then
    stray_ok=$((stray_ok + 1))
  fi
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

echo "check-typescript-major: OK (root exclusive ^7; ${stray_ok} leftover workspace pin(s) match; typescript@7. in lock; no non-allowlisted @5/@6)"
