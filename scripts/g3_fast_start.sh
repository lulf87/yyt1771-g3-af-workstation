#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${G3_HOST:-127.0.0.1}"
BACKEND_PORT="${G3_BACKEND_PORT:-8022}"
FRONTEND_PORT="${G3_FRONTEND_PORT:-5176}"
BACKEND_PYTHON="${G3_BACKEND_PYTHON:-/Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3}"
MODE="${G3_START_MODE:-real-real}"
OPEN_BROWSER=1
FORCE_RESTART=0

usage() {
  cat <<'EOF'
Usage: scripts/g3_fast_start.sh [mode] [--restart] [--no-open]

Modes:
  real-real       Real Hik camera + real LU92XX temperature controller
  real-simtemp    Real Hik camera + built-in simulated temperature controller
  sim-sim         Built-in simulated camera + built-in simulated temperature controller

Aliases:
  rr, real, real-temp
  rs, real-sim
  ss, sim, simulated

Environment overrides:
  G3_BACKEND_PORT=8022
  G3_FRONTEND_PORT=5176
  G3_BACKEND_PYTHON=/path/to/python3
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --no-open)
      OPEN_BROWSER=0
      shift
      ;;
    --restart)
      FORCE_RESTART=1
      shift
      ;;
    --backend-port)
      BACKEND_PORT="${2:?--backend-port requires a value}"
      shift 2
      ;;
    --frontend-port)
      FRONTEND_PORT="${2:?--frontend-port requires a value}"
      shift 2
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      MODE="$1"
      shift
      ;;
  esac
done

case "$MODE" in
  rr|real|real-temp|real-real)
    MODE="real-real"
    MODE_LABEL="real camera + real temperature"
    HARDWARE_CONFIG="$ROOT_DIR/configs/local/realcamera_temp.local.yaml"
    EXPECTED_CAMERA_BACKEND="hik_gige_mvs"
    EXPECTED_TEMP_BACKEND="lu92xx_modbus_rtu"
    ;;
  rs|real-sim|real-simtemp)
    MODE="real-simtemp"
    MODE_LABEL="real camera + simulated temperature"
    HARDWARE_CONFIG="$ROOT_DIR/configs/local/realcamera_simtemp.local.yaml"
    EXPECTED_CAMERA_BACKEND="hik_gige_mvs"
    EXPECTED_TEMP_BACKEND="simulated"
    ;;
  ss|sim|simulated|sim-sim)
    MODE="sim-sim"
    MODE_LABEL="simulated camera + simulated temperature"
    HARDWARE_CONFIG="$ROOT_DIR/configs/local/simcamera_simtemp.local.yaml"
    EXPECTED_CAMERA_BACKEND="simulated"
    EXPECTED_TEMP_BACKEND="simulated"
    ;;
  *)
    echo "Unknown startup mode: $MODE" >&2
    usage >&2
    exit 2
    ;;
esac

BACKEND_URL="http://$HOST:$BACKEND_PORT"
FRONTEND_URL="http://$HOST:$FRONTEND_PORT/"
LOG_DIR="$ROOT_DIR/output/dev"
BACKEND_LOG="$LOG_DIR/g3-fast-start-backend-$BACKEND_PORT.log"
FRONTEND_LOG="$LOG_DIR/g3-fast-start-frontend-$FRONTEND_PORT.log"
BACKEND_PID_FILE="$LOG_DIR/g3-fast-start-backend-$BACKEND_PORT.pid"
FRONTEND_PID_FILE="$LOG_DIR/g3-fast-start-frontend-$FRONTEND_PORT.pid"
BACKEND_LABEL="local.yyt1771.g3.backend.$BACKEND_PORT"
FRONTEND_LABEL="local.yyt1771.g3.frontend.$FRONTEND_PORT"
LAUNCH_DOMAIN="gui/$(id -u)"

mkdir -p "$LOG_DIR"

log() {
  printf '[g3-start] %s\n' "$*"
}

port_pids() {
  lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

pid_command() {
  ps eww -p "$1" -o command= 2>/dev/null || true
}

pid_cwd() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1
}

is_project_backend_pid() {
  local pid="$1"
  local command
  command="$(pid_command "$pid")"
  [[ "$command" == *"uvicorn yyt1771_g3.api.main:app"* ]]
}

is_project_frontend_pid() {
  local pid="$1"
  local command cwd
  command="$(pid_command "$pid")"
  cwd="$(pid_cwd "$pid")"
  [[ "$command" == *"vite"* && "$cwd" == "$ROOT_DIR/frontend" ]]
}

stop_pid() {
  local pid="$1"
  local label="$2"
  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  log "Stopping $label PID $pid"
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 25); do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 0.2
  done
  log "$label PID $pid did not exit quickly; leaving it untouched"
  return 1
}

stop_launch_label() {
  local label="$1"
  launchctl bootout "$LAUNCH_DOMAIN/$label" >/dev/null 2>&1 || true
}

profile_matches_mode() {
  local profile_json="$1"
  python3 -c '
import json
import sys

expected_camera = sys.argv[1]
expected_temp = sys.argv[2]
profile = json.load(sys.stdin)
camera_backend = profile.get("camera", {}).get("backend")
temp_backend = profile.get("temp", {}).get("backend")
raise SystemExit(0 if camera_backend == expected_camera and temp_backend == expected_temp else 1)
' "$EXPECTED_CAMERA_BACKEND" "$EXPECTED_TEMP_BACKEND" <<<"$profile_json"
}

profile_summary() {
  local profile_json="$1"
  python3 -c '
import json
import sys

profile = json.load(sys.stdin)
camera = profile.get("camera", {})
temp = profile.get("temp", {})
run = profile.get("run", {})
print(
    "camera={camera} temp={temp} port={port} sync_ms={sync}".format(
        camera=camera.get("backend", ""),
        temp=temp.get("backend", ""),
        port=temp.get("serial", {}).get("port", ""),
        sync=run.get("temp_sync_target_ms", ""),
    )
)
' <<<"$profile_json"
}

wait_for_backend() {
  local started_at now elapsed
  started_at="$(date +%s)"
  for _ in $(seq 1 75); do
    if curl -fsS --max-time 2 "$BACKEND_URL/api/health" >/dev/null 2>&1; then
      now="$(date +%s)"
      elapsed=$((now - started_at))
      log "Backend healthy after ${elapsed}s: $BACKEND_URL"
      return 0
    fi
    sleep 1
  done
  log "Backend did not become healthy. Last log lines:"
  tail -80 "$BACKEND_LOG" || true
  return 1
}

wait_for_frontend() {
  for _ in $(seq 1 45); do
    if curl -fsS -I --max-time 2 "$FRONTEND_URL" >/dev/null 2>&1; then
      log "Frontend healthy: $FRONTEND_URL"
      return 0
    fi
    sleep 1
  done
  log "Frontend did not become healthy. Last log lines:"
  tail -80 "$FRONTEND_LOG" || true
  return 1
}

ensure_backend() {
  if [[ ! -f "$HARDWARE_CONFIG" ]]; then
    echo "Hardware config not found: $HARDWARE_CONFIG" >&2
    exit 1
  fi
  if [[ ! -x "$BACKEND_PYTHON" ]]; then
    echo "Backend Python not executable: $BACKEND_PYTHON" >&2
    exit 1
  fi

  local pids profile_json
  pids="$(port_pids "$BACKEND_PORT")"
  if [[ -n "$pids" ]]; then
    if curl -fsS --max-time 2 "$BACKEND_URL/api/health" >/dev/null 2>&1; then
      profile_json="$(curl -fsS --max-time 2 "$BACKEND_URL/api/hardware/profile" 2>/dev/null || true)"
      if [[ "$FORCE_RESTART" -eq 0 && -n "$profile_json" ]] && profile_matches_mode "$profile_json"; then
        log "Reusing backend on $BACKEND_URL ($(profile_summary "$profile_json"))"
        return 0
      fi
      for pid in $pids; do
        if is_project_backend_pid "$pid"; then
          stop_launch_label "$BACKEND_LABEL"
          stop_pid "$pid" "backend" || true
        else
          log "Backend port $BACKEND_PORT is held by non-project PID $pid; not killing it"
          exit 1
        fi
      done
    else
      for pid in $pids; do
        if is_project_backend_pid "$pid"; then
          stop_launch_label "$BACKEND_LABEL"
          stop_pid "$pid" "unhealthy backend" || true
        else
          log "Backend port $BACKEND_PORT is held by non-project PID $pid; not killing it"
          exit 1
        fi
      done
    fi
  fi

  log "Starting backend: $MODE_LABEL"
  : >"$BACKEND_LOG"
  python3 - "$BACKEND_PID_FILE" "$ROOT_DIR" "$BACKEND_LOG" "$BACKEND_PYTHON" "$ROOT_DIR/backend/src" "$HARDWARE_CONFIG" "$HOST" "$BACKEND_PORT" <<'PY'
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

pid_file, root, log_path, python_bin, pythonpath, hardware_config, host, port = sys.argv[1:9]
env = os.environ.copy()
env["PYTHONPATH"] = pythonpath
env["YYT1771_G3_HARDWARE_CONFIG"] = hardware_config
Path(log_path).parent.mkdir(parents=True, exist_ok=True)
with open(log_path, "ab", buffering=0) as log:
    process = subprocess.Popen(
        [
            python_bin,
            "-m",
            "uvicorn",
            "yyt1771_g3.api.main:app",
            "--host",
            host,
            "--port",
            port,
        ],
        cwd=root,
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        close_fds=True,
        start_new_session=True,
    )
Path(pid_file).write_text(f"{process.pid}\n", encoding="utf-8")
PY
  wait_for_backend

  curl -fsS --max-time 5 "$BACKEND_URL/api/offline-datasets" >/dev/null
  profile_json="$(curl -fsS --max-time 5 "$BACKEND_URL/api/hardware/profile")"
  if ! profile_matches_mode "$profile_json"; then
    log "Backend started, but hardware profile does not match requested mode"
    log "Profile: $(profile_summary "$profile_json")"
    exit 1
  fi
  log "Backend profile: $(profile_summary "$profile_json")"
}

ensure_frontend() {
  local pids command
  pids="$(port_pids "$FRONTEND_PORT")"
  if [[ -n "$pids" ]]; then
    if curl -fsS -I --max-time 2 "$FRONTEND_URL" >/dev/null 2>&1; then
      for pid in $pids; do
        command="$(pid_command "$pid")"
        if is_project_frontend_pid "$pid" && [[ "$command" == *"VITE_G3_API_BASE=$BACKEND_URL"* ]]; then
          log "Reusing frontend on $FRONTEND_URL"
          return 0
        fi
        if is_project_frontend_pid "$pid"; then
          stop_launch_label "$FRONTEND_LABEL"
          stop_pid "$pid" "frontend" || true
        else
          log "Frontend port $FRONTEND_PORT is held by non-project PID $pid; not killing it"
          exit 1
        fi
      done
    else
      for pid in $pids; do
        if is_project_frontend_pid "$pid"; then
          stop_launch_label "$FRONTEND_LABEL"
          stop_pid "$pid" "unhealthy frontend" || true
        else
          log "Frontend port $FRONTEND_PORT is held by non-project PID $pid; not killing it"
          exit 1
        fi
      done
    fi
  fi

  log "Starting frontend with VITE_G3_API_BASE=$BACKEND_URL"
  : >"$FRONTEND_LOG"
  local npm_bin
  npm_bin="$(command -v npm || true)"
  if [[ -z "$npm_bin" ]]; then
    echo "npm is required to start the frontend" >&2
    exit 1
  fi
  python3 - "$FRONTEND_PID_FILE" "$ROOT_DIR/frontend" "$FRONTEND_LOG" "$npm_bin" "$BACKEND_URL" "$FRONTEND_PORT" <<'PY'
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

pid_file, frontend_root, log_path, npm_bin, api_base, port = sys.argv[1:7]
env = os.environ.copy()
env["VITE_G3_API_BASE"] = api_base
Path(log_path).parent.mkdir(parents=True, exist_ok=True)
with open(log_path, "ab", buffering=0) as log:
    process = subprocess.Popen(
        [npm_bin, "run", "dev", "--", "--port", port],
        cwd=frontend_root,
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        close_fds=True,
        start_new_session=True,
    )
Path(pid_file).write_text(f"{process.pid}\n", encoding="utf-8")
PY
  wait_for_frontend
}

log "Mode: $MODE ($MODE_LABEL)"
log "Hardware config: $HARDWARE_CONFIG"
log "Runtime source: ${YYT1771_G3_RUNTIME_SOURCE:-legacy-default}"
log "Product mode: ${YYT1771_G3_PRODUCT_MODE:-development}"
ensure_backend
ensure_frontend

if [[ "$OPEN_BROWSER" -eq 1 ]]; then
  open "$FRONTEND_URL" >/dev/null 2>&1 || true
fi

log "Ready"
log "Frontend: $FRONTEND_URL"
log "Backend:  $BACKEND_URL"
log "Logs:     $BACKEND_LOG ; $FRONTEND_LOG"
