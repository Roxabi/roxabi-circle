#!/usr/bin/env bash
# Sourced by extract-dry-run.sh, check-banned-strings.sh and kit-schema-sync.sh (Roxabi/roxabi-boilerplate-cf#318).
# The kit apps are the apps/<name>/ entries of zero-edit-zones.json protected_prefixes, the list
# zero-edit and check-migrations-contract read too; zero-edit refuses every other apps entry shape.
# Usage: kit_app_names <zones-file>   prints one app name per line, or fails naming none
kit_app_names() {
  node -e '
    const zones = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))
    const names = (zones.protected_prefixes ?? []).map((p) => /^apps\/([^/]+)\/$/.exec(p)?.[1]).filter(Boolean)
    if (names.length === 0) throw new Error("protected_prefixes names no apps/<name>/")
    console.log(names.join("\n"))
  ' "$1"
}
