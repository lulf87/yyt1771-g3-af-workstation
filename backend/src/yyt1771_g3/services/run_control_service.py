from __future__ import annotations

from threading import Lock


class RunControlRegistry:
    def __init__(self) -> None:
        self._lock = Lock()
        self._stop_requested: set[str] = set()

    def register(self, run_id: str) -> None:
        with self._lock:
            self._stop_requested.discard(run_id)

    def request_stop(self, run_id: str) -> bool:
        with self._lock:
            self._stop_requested.add(run_id)
        return True

    def should_stop(self, run_id: str) -> bool:
        with self._lock:
            return run_id in self._stop_requested

    def release(self, run_id: str) -> None:
        with self._lock:
            self._stop_requested.discard(run_id)


run_controls = RunControlRegistry()
