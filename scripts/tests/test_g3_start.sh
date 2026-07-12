#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
START_SCRIPT="$ROOT_DIR/scripts/g3_start.sh"

real_output="$(YYT1771_G3_RUNTIME_SOURCE=simulated_material "$START_SCRIPT" real --dry-run)"
grep -q '^Runtime source: real_hardware$' <<<"$real_output"
grep -q '^Fast-start mode: real-real$' <<<"$real_output"
grep -q 'realcamera_temp.local.yaml$' <<<"$real_output"

sim_output="$(YYT1771_G3_RUNTIME_SOURCE=real_hardware YYT1771_G3_SIMULATED_DATASET_ID=golden_c_20260529_dev_lab "$START_SCRIPT" sim --dry-run)"
grep -q '^Runtime source: simulated_material$' <<<"$sim_output"
grep -q '^Fast-start mode: sim-sim$' <<<"$sim_output"
grep -q '^Simulated dataset: golden_c_20260529_dev_lab$' <<<"$sim_output"
grep -q 'simcamera_simtemp.local.yaml$' <<<"$sim_output"

if "$START_SCRIPT" invalid --dry-run >/tmp/g3-start-invalid.out 2>&1; then
  echo "invalid source unexpectedly succeeded" >&2
  exit 1
fi
grep -q 'Usage: .*g3_start.sh real|sim' /tmp/g3-start-invalid.out

echo "g3_start.sh tests passed"
