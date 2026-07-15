from __future__ import annotations

import argparse
import logging
import os
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

import uvicorn

from yyt1771_g3.core.app_paths import ensure_runtime_directories, hardware_config_path, is_frozen, log_dir, project_root


LOGGER = logging.getLogger("yyt1771_g3.launcher")


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    ensure_runtime_directories()
    _configure_environment(args)
    _configure_logging(log_dir() / "g3-workstation.log")
    url = f"http://{args.host}:{args.port}/"

    if _healthy(url + "api/health"):
        LOGGER.info("G3 is already running at %s", url)
        if not args.no_browser:
            webbrowser.open(url)
        return 0

    if not args.no_browser:
        threading.Thread(target=_open_when_ready, args=(url,), daemon=True).start()
    LOGGER.info("Starting G3 at %s", url)
    uvicorn.run("yyt1771_g3.api.main:app", host=args.host, port=args.port, log_config=None)
    return 0


def _configure_environment(args: argparse.Namespace) -> None:
    source = "real_hardware" if args.source == "real" else "simulated_material"
    os.environ["YYT1771_G3_RUNTIME_SOURCE"] = source
    os.environ["YYT1771_G3_PRODUCT_MODE"] = args.product_mode
    if args.hardware_config:
        hardware_config = Path(args.hardware_config).expanduser()
    elif args.source == "sim" and not is_frozen():
        hardware_config = project_root() / "configs" / "local" / "simcamera_simtemp.local.yaml"
    else:
        hardware_config = hardware_config_path()
    os.environ["YYT1771_G3_HARDWARE_CONFIG"] = str(hardware_config)
    if args.dataset_id:
        os.environ["YYT1771_G3_SIMULATED_DATASET_ID"] = args.dataset_id
    elif args.source == "real":
        os.environ.pop("YYT1771_G3_SIMULATED_DATASET_ID", None)


def _configure_logging(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handlers: list[logging.Handler] = [logging.FileHandler(path, encoding="utf-8")]
    if sys.stderr is not None:
        handlers.append(logging.StreamHandler())
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        handlers=handlers,
        force=True,
    )


def _open_when_ready(url: str) -> None:
    health_url = url + "api/health"
    for _ in range(120):
        if _healthy(health_url):
            webbrowser.open(url)
            return
        time.sleep(0.25)
    LOGGER.error("Backend did not become healthy: %s", health_url)


def _healthy(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=0.5) as response:  # noqa: S310
            return response.status == 200
    except OSError:
        return False


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="YY/T 1771 G3 workstation launcher")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8022)
    parser.add_argument("--source", choices=("real", "sim"), default="real")
    parser.add_argument("--product-mode", choices=("production", "development"), default="production")
    parser.add_argument("--dataset-id", default="")
    parser.add_argument("--hardware-config", default="")
    parser.add_argument("--no-browser", action="store_true")
    return parser


if __name__ == "__main__":
    raise SystemExit(main())
