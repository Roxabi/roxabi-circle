#!/usr/bin/env bash
# Compiled regression for the zod 4.6.7 worker-bundle init drop.
#
# esbuild, inside the wrangler locked by @kit/example-api, drops v4 and
# v4/classic init when those package.json files say "sideEffects": false and
# one graph both statically imports `custom` from `zod/v4` and dynamically
# imports the zod root. `custom` then cannot accept a positive number and
# reject 0 / a non-number. The patch sets those two fields to true.
#
# This is the wrangler ESM, not a workerd boot, not OAuth, not the UI.
# Launch: bash scripts/kit/test-zod-entry-init.sh
# Root name: test:zod-entry-init, already on validate:full.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
GATE_BUNFIG="${ROOT}/config/kit/bunfig.gates.toml"
WRANGLER="${ROOT}/apps/example-api/node_modules/.bin/wrangler"
ZOD="${ROOT}/apps/example-api/node_modules/zod"

[[ -f "$GATE_BUNFIG" ]] || {
  echo "test-zod-entry-init: missing ${GATE_BUNFIG}" >&2
  exit 1
}
[[ -e "$WRANGLER" ]] || {
  echo "test-zod-entry-init: locked wrangler missing at ${WRANGLER} (do not bunx)" >&2
  exit 1
}
[[ -d "$ZOD" ]] || {
  echo "test-zod-entry-init: zod is not installed at ${ZOD}" >&2
  exit 1
}
command -v bun >/dev/null 2>&1 || {
  echo "test-zod-entry-init: bun is required" >&2
  exit 1
}

# /tmp, not $TMPDIR. A temp dir inside the repo would let a later bun import
# walk up to the worktree and load an unbundled zod.
TMP="$(mktemp -d /tmp/zod-entry-init.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
case "$TMP" in
  "$ROOT" | "$ROOT"/*)
    echo "test-zod-entry-init: fixture ${TMP} is inside the repo" >&2
    exit 1
    ;;
esac

# compatibility_date matches apps/example-api and stays before wrangler
# 4.152.0's nodejs_compat default-on (2026-08-04). The flag itself is omitted:
# its unenv inject emits cloudflare: modules, which bun cannot import. The
# sideEffects drop is esbuild package.json handling and does not need that flag.
# No bindings, no vars: nothing for .dev.vars / .env to fill.
cat >"$TMP/wrangler.toml" <<'EOF'
name = "zod-entry-init"
main = "probe.js"
compatibility_date = "2026-07-01"
workers_dev = false
send_metrics = false
upload_source_maps = false
EOF
: >"$TMP/empty.env"

# Eager zod/v4 custom, then a dynamic root import. The predicate must see the
# value: an always-true check would not reject 0.
cat >"$TMP/probe.js" <<'EOF'
import { custom } from "zod/v4";

function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export const eager = custom(isPositiveNumber);

export async function loadRoot() {
  const root = await import("zod");
  if (typeof root.z?.custom !== "function") {
    throw new Error("zod root dynamic import did not expose z.custom");
  }
  return root.z.custom(isPositiveNumber);
}

export default {
  fetch() {
    return new Response(null, { status: 204 });
  },
};
EOF

mkdir "$TMP/node_modules"
ln -s "$ZOD" "$TMP/node_modules/zod"

set +e
wrangler_out="$(
  cd "$TMP" &&
    env \
      -u CLOUDFLARE_API_TOKEN \
      -u CLOUDFLARE_API_KEY \
      -u CLOUDFLARE_ACCOUNT_ID \
      -u CLOUDFLARE_EMAIL \
      WRANGLER_SEND_METRICS=false \
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false \
      "$WRANGLER" deploy --dry-run \
        --outdir "$TMP/out" \
        --config "$TMP/wrangler.toml" \
        --env-file "$TMP/empty.env" \
      2>&1
)"
wrangler_ec=$?
set -e
if [[ "$wrangler_ec" -ne 0 ]]; then
  echo "test-zod-entry-init: wrangler deploy --dry-run failed" >&2
  printf '%s\n' "$wrangler_out" >&2
  exit 1
fi

BUNDLE="$TMP/out/probe.js"
if [[ ! -f "$BUNDLE" ]]; then
  echo "test-zod-entry-init: wrangler did not emit ${BUNDLE}" >&2
  printf '%s\n' "$wrangler_out" >&2
  exit 1
fi

# Drop only the zod link before import. An external `zod` would then fail;
# only the emitted ESM may satisfy the schema checks.
rm "$TMP/node_modules/zod"
rmdir "$TMP/node_modules"

eval_js="$(cat <<'JS'
const { pathToFileURL } = await import("node:url");
const bundle = process.env.ZOD_ENTRY_BUNDLE;
if (!bundle) {
  console.error("test-zod-entry-init: missing ZOD_ENTRY_BUNDLE");
  process.exit(1);
}
const mod = await import(pathToFileURL(bundle).href);

function assertSchema(label, schema) {
  if (!schema || typeof schema.parse !== "function" || typeof schema.safeParse !== "function") {
    console.error(`test-zod-entry-init: ${label} is not a schema`);
    process.exit(1);
  }
  const accepted = schema.parse(1);
  if (accepted !== 1) {
    console.error(`test-zod-entry-init: ${label} accepted ${JSON.stringify(accepted)}, expected 1`);
    process.exit(1);
  }
  const rejectedNumber = schema.safeParse(0);
  if (rejectedNumber.success !== false) {
    console.error(`test-zod-entry-init: ${label} accepted rejected input 0`);
    process.exit(1);
  }
  const rejectedType = schema.safeParse("1");
  if (rejectedType.success !== false) {
    console.error(`test-zod-entry-init: ${label} accepted non-number "1"`);
    process.exit(1);
  }
}

assertSchema("zod/v4 custom", mod.eager);
if (typeof mod.loadRoot !== "function") {
  console.error("test-zod-entry-init: bundle did not export loadRoot");
  process.exit(1);
}
const rootSchema = await mod.loadRoot();
if (rootSchema === mod.eager) {
  console.error("test-zod-entry-init: root schema is the static schema");
  process.exit(1);
}
assertSchema("zod root custom", rootSchema);
console.log("test-zod-entry-init: OK");
JS
)"

set +e
bun_out="$(
  cd "$TMP" &&
    env -u NODE_PATH ZOD_ENTRY_BUNDLE="$BUNDLE" \
      bun --no-env-file --no-install --config="$GATE_BUNFIG" --eval "$eval_js" \
      2>&1
)"
bun_ec=$?
set -e
if [[ "$bun_ec" -ne 0 || "$bun_out" != *"test-zod-entry-init: OK"* ]]; then
  echo "test-zod-entry-init: bundled schema check failed" >&2
  printf '%s\n' "$bun_out" >&2
  exit 1
fi

printf '%s\n' "$bun_out"
