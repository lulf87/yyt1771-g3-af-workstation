from __future__ import annotations

import io
from pathlib import Path

import numpy as np
from PIL import Image


def array_to_png_bytes(array: np.ndarray, max_width: int | None = None) -> bytes:
    image_array = np.asarray(array)
    if image_array.dtype != np.uint8:
        image_array = np.clip(image_array, 0, 255).astype(np.uint8)
    if image_array.ndim == 2:
        image = Image.fromarray(np.ascontiguousarray(image_array), mode="L")
    elif image_array.ndim == 3:
        image = Image.fromarray(np.ascontiguousarray(image_array))
    else:
        raise ValueError(f"Unsupported frame shape for PNG preview: {array.shape}")

    if max_width is not None and image.width > max_width:
        target_width = min(max_width, image.width)
        target_height = max(1, round(image.height * (target_width / image.width)))
        image = image.resize((target_width, target_height), Image.Resampling.BILINEAR)

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def save_preview_png(array: np.ndarray, path: Path, *, max_width: int = 1200) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(array_to_png_bytes(array, max_width=max_width))
