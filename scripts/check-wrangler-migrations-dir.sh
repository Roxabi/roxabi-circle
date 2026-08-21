#!/usr/bin/env bash
# Fail if any wrangler config points D1 migrations_dir at packages/*/migrations.
#
# Applied SSoT is apps/<api>/migrations (ADR-0008). packages/*/migrations are sketches.
# Parse TOML/JSONC with bun (not same-line grep). Unparseable files fail closed.
# Missing packages/ fails (kit CI must see the sketch tree).
# ROOT override: WRANGLER_MIG_ROOT (fixture trees in the self-test).
set -euo pipefail

ROOT="${WRANGLER_MIG_ROOT:-$(cd "$(dirname "$0")/.." && pwd -P)}"

if [[ ! -d "${ROOT}" ]]; then
  echo "check-wrangler-migrations-dir: missing root ${ROOT}" >&2
  exit 1
fi

if [[ ! -d "${ROOT}/packages" ]]; then
  echo "check-wrangler-migrations-dir: missing ${ROOT}/packages" >&2
  exit 1
fi
PACKAGES="$(cd "${ROOT}/packages" && pwd -P)"

if ! command -v bun >/dev/null 2>&1; then
  echo "check-wrangler-migrations-dir: bun is required to parse wrangler configs" >&2
  exit 1
fi

mapfile -t FILES < <(
  find "${ROOT}" \
    \( -name wrangler.toml -o -name wrangler.json -o -name wrangler.jsonc \
       -o -name 'wrangler.*.toml' -o -name 'wrangler.*.json' -o -name 'wrangler.*.jsonc' \) \
    -not -path '*/node_modules/*' \
    -not -path '*/.git/*' \
    -not -path '*/coverage/*' \
    -not -path '*/.turbo/*' \
    | sort
)

# Print each migrations_dir string on its own line. Exit non-zero if unparseable.
extract_dirs() {
  local file="$1"
  local kind
  case "${file}" in
    *.toml) kind=toml ;;
    *.json | *.jsonc) kind=jsonc ;;
    *)
      echo "error: ${file}: unsupported wrangler suffix" >&2
      return 1
      ;;
  esac
  WRANGLER_MIG_FILE="${file}" WRANGLER_MIG_KIND="${kind}" bun -e '
const fs = require("fs");
const p = process.env.WRANGLER_MIG_FILE;
const kind = process.env.WRANGLER_MIG_KIND;
let text;
try {
  text = fs.readFileSync(p, "utf8");
} catch (e) {
  console.error("check-wrangler-migrations-dir: cannot read " + p + ": " + e);
  process.exit(1);
}
let data;
try {
  data = kind === "toml" ? Bun.TOML.parse(text) : Bun.JSONC.parse(text);
} catch (e) {
  const msg = e && e.message ? e.message : String(e);
  console.error("check-wrangler-migrations-dir: unparseable " + p + ": " + msg.split("\n")[0]);
  process.exit(1);
}
function walk(v) {
  if (v == null || typeof v !== "object") return;
  if (Array.isArray(v)) {
    for (const x of v) walk(x);
    return;
  }
  for (const [k, val] of Object.entries(v)) {
    if (k === "migrations_dir") {
      if (typeof val !== "string" || val.trim() === "") {
        console.error("check-wrangler-migrations-dir: non-string migrations_dir in " + p);
        process.exit(1);
      }
      process.stdout.write(val.trim() + "\n");
    } else {
      walk(val);
    }
  }
}
walk(data);
'
}

FAIL=0
CHECKED=0

for file in "${FILES[@]+"${FILES[@]}"}"; do
  [[ -n "${file:-}" ]] || continue
  config_dir="$(cd "$(dirname -- "${file}")" && pwd -P)"
  case "${config_dir}" in
    "${PACKAGES}"|"${PACKAGES}"/*)
      echo "error: ${file}: wrangler config lives under packages/ (sketch SQL apply path)" >&2
      FAIL=1
      continue
      ;;
  esac
  extract_out=""
  extract_ec=0
  set +e
  extract_out="$(extract_dirs "${file}" 2>&1)"
  extract_ec=$?
  set -e
  if [[ "${extract_ec}" -ne 0 ]]; then
    echo "error: ${file}: unparseable wrangler config" >&2
    if [[ -n "${extract_out}" ]]; then
      echo "${extract_out}" >&2
    fi
    FAIL=1
    continue
  fi
  while IFS= read -r raw; do
    [[ -n "${raw}" ]] || continue
    CHECKED=$((CHECKED + 1))
    case "${raw}" in
      /*) resolved="$(cd / && realpath -m -- "${raw}")" ;;
      *) resolved="$(cd "${config_dir}" && realpath -m -- "${raw}")" ;;
    esac
    case "${resolved}" in
      "${PACKAGES}"|"${PACKAGES}"/*)
        echo "error: ${file}: migrations_dir=${raw} resolves to ${resolved}" >&2
        echo "  packages/*/migrations are sketches — applied SSoT is apps/<api>/migrations (ADR-0008)" >&2
        FAIL=1
        ;;
    esac
  done <<< "${extract_out}"
done

if [[ "${FAIL}" -ne 0 ]]; then
  echo "check-wrangler-migrations-dir: FAIL" >&2
  exit 1
fi

echo "check-wrangler-migrations-dir: OK (${#FILES[@]} wrangler files, ${CHECKED} migrations_dir)"
exit 0
