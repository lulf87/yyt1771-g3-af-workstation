#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${1:-}"
DRY_RUN="${2:-}"

usage() {
  echo "Usage: $0 real|sim [--dry-run]" >&2
}

case "$SOURCE" in
  real)
    export YYT1771_G3_RUNTIME_SOURCE="real_hardware"
    export YYT1771_G3_HARDWARE_CONFIG="${YYT1771_G3_HARDWARE_CONFIG:-$ROOT_DIR/configs/local/realcamera_temp.local.yaml}"
    FAST_START_MODE="real-real"
    ;;
  sim)
    export YYT1771_G3_RUNTIME_SOURCE="simulated_material"
    export YYT1771_G3_SIMULATED_DATASET_ID="${YYT1771_G3_SIMULATED_DATASET_ID:-golden_a_20260522_dev_lab}"
    export YYT1771_G3_HARDWARE_CONFIG="${YYT1771_G3_HARDWARE_CONFIG:-$ROOT_DIR/configs/local/simcamera_simtemp.local.yaml}"
    FAST_START_MODE="sim-sim"
    ;;
  *)
    usage
    exit 2
    ;;
esac

if [[ -n "$DRY_RUN" && "$DRY_RUN" != "--dry-run" ]]; then
  usage
  exit 2
fi

echo "Runtime source: $YYT1771_G3_RUNTIME_SOURCE"
echo "Product mode: ${YYT1771_G3_PRODUCT_MODE:-development}"
echo "Simulation allowed: $([[ "${YYT1771_G3_PRODUCT_MODE:-development}" == "production" ]] && echo false || echo true)"
echo "Hardware config: $YYT1771_G3_HARDWARE_CONFIG"
echo "Fast-start mode: $FAST_START_MODE"
if [[ "$SOURCE" == "sim" ]]; then
  echo "Simulated dataset: $YYT1771_G3_SIMULATED_DATASET_ID"
fi

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  exit 0
fi

exec "$ROOT_DIR/scripts/g3_fast_start.sh" "$FAST_START_MODE"
