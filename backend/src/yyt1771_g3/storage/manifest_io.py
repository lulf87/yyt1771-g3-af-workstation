from __future__ import annotations

import json
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel


ModelT = TypeVar("ModelT", bound=BaseModel)


def write_json_model(path: Path, model: BaseModel) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        model.model_dump_json(indent=2),
        encoding="utf-8",
    )


def read_json_model(path: Path, model_type: type[ModelT]) -> ModelT:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return model_type.model_validate(payload)
