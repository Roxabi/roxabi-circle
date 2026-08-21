#!/usr/bin/env bash
# product-validate.example.sh — COPY into the product repo (never run as-is from kit CI).
#
# Preferred copy targets (zero-edit allowed):
#   scripts/product/validate.sh
#   apps/<product>-api/scripts/kit/product-validate.sh
#
# Then replace <product> placeholders with your package names and adjust filters.
# Kit `validate:full` / `scripts/kit/test-coverage.sh` stay kit-only — do not dual-edit them
# to add product packages.
#
# See: docs/kit/product-consumer-contract.md · docs/kit/playbooks/start-product.md §8
set -euo pipefail

# Resolve monorepo root from this script location.
# If you copy to scripts/product/validate.sh → two levels up.
# If you copy to apps/<product>-api/scripts/kit/product-validate.sh → three levels up.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/../../package.json" ]]; then
  ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
elif [[ -f "${SCRIPT_DIR}/../../../package.json" ]]; then
  ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
else
  echo "product-validate: cannot find monorepo root from ${SCRIPT_DIR}" >&2
  exit 1
fi
cd "$ROOT"

echo "→ product-validate (ROOT=$ROOT)"

# Product mode: kit zones clean vs upstream (or ZERO_EDIT_BASE_REF / kit-baseline in CI).
bun run zero-edit

# --- replace <product> with your app package names ---
bun run --filter "@kit/<product>-api" typecheck
bun run --filter "@kit/<product>-api" test
bun run --filter "@kit/<product>-web" typecheck
bun run --filter "@kit/<product>-web" test
# Optional: wrangler dry-run / turbo build for the product API
# bun run --filter "@kit/<product>-api" build

echo "✓ product-validate OK"
