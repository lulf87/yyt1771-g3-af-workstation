# G3 数据结构与 manifest 草案 v0.1

## 1. 核心原则

```text
原始输入 + 配置快照 + 代码版本 + 输出结果 + 异常状态必须可追溯。
同一数据、同一配置、同一代码版本，重复分析结果必须一致。
```

---

## 2. MeasurementDefinition

```json
{
  "measurement_id": "example",
  "object_class": "A_BALLOON_ENVELOPE",
  "detector": "BalloonEnvelopeDetector",
  "width_mode": "max_width",
  "measurement_coordinates": "source_pixel",
  "roi": {
    "type": "rotated_rect",
    "center_x": 1000.0,
    "center_y": 650.0,
    "width": 800.0,
    "height": 300.0,
    "angle_deg": -5.0
  },
  "detector_config": {
    "tie_width_epsilon_px": 2.0,
    "switch_after_n_frames": 3,
    "jump_limit_px": 25.0
  }
}
```

---

## 3. FrameRecord

```json
{
  "frame_index": 1,
  "frame_path": "frames/frame_000001.npy",
  "timestamp_ms": 1779445920097,
  "shape": [1364, 2048],
  "dtype": "uint8",
  "source": "hik_gige_mvs",
  "camera_meta": {
    "transport": "gige_vision",
    "backend": "hik_gige_mvs",
    "trigger_mode": "free_run",
    "pixel_format": "mono8"
  }
}
```

---

## 4. TemperatureRecord

```json
{
  "timestamp_ms": 1779445920110,
  "celsius": 1.4,
  "source": "lu92xx_modbus_rtu",
  "sampled_this_frame": true,
  "error": ""
}
```

---

## 5. DetectionResult

```json
{
  "frame_index": 1,
  "detection_status": "VALID",
  "ab_points": {
    "a": {"x": 900.0, "y": 610.0},
    "b": {"x": 900.0, "y": 910.0}
  },
  "distance_px": 300.0,
  "raw_best_candidate": {},
  "selected_candidate": {},
  "quality": {
    "confidence": 0.95,
    "roi_coverage": 0.72,
    "jump_from_previous_px": 1.0
  },
  "rejected_candidates": [],
  "rejected_reason": "",
  "debug_artifacts": {
    "strut_mask_path": "artifacts/frame_000001_strut_mask.png",
    "mesh_region_path": "artifacts/frame_000001_mesh_region.png",
    "outer_contour_debug_path": "artifacts/frame_000001_outer_contour_debug.png",
    "overlay_debug_image_path": "artifacts/frame_000001_overlay.png"
  },
  "temperature_sync_status": "TEMP_SYNC_OK"
}
```

---

## 6. TemperatureSyncStatus

```text
TEMP_SYNC_OK
TEMP_SYNC_INTERPOLATED
TEMP_SYNC_STALE
TEMP_SYNC_MISSING
```

---

## 7. RunManifest

每次 run 保存：

```text
run metadata
measurement definition
frame records
temperature records
detection results
artifact paths
software version/hash
config snapshot
```
