#!/usr/bin/env bash
# leftover pre-commit driver (#148).
# One process: if file-length/trufflehog fail, EXIT still restores the index
# so a staged D is not lost (and leftover-index-tree is not left orphan).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "${here}/../.." && pwd)"
cd "$root"

bash "${here}/lefthook-snapshot-deletes.sh"
# shellcheck disable=SC2064
trap 'bash "${here}/lefthook-restore-deletes.sh"' EXIT

env -u QG_FILE_EXEMPTIONS -u QG_FILE_MAX -u QG_FILE_ROOTS -u QG_FILE_PRODUCT_EXEMPTIONS \
  QG_FILE_MODE=staged bash "${here}/check_file_length.sh"
bash "${here}/trufflehog-check.sh"

trap - EXIT
bash "${here}/lefthook-restore-deletes.sh"
bash "${here}/lefthook-biome-staged.sh"
