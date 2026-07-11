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
  "regions": [
    {
      "region_id": "region_1",
      "index": 1,
      "label": "位置 1",
      "enabled": true,
      "color": "#ef4444",
      "roi": {
        "type": "rotated_rect",
        "center_x": 1000.0,
        "center_y": 650.0,
        "width": 800.0,
        "height": 300.0,
        "angle_deg": -5.0
      }
    }
  ],
  "detector_config": {
    "tie_width_epsilon_px": 2.0,
    "switch_after_n_frames": 3,
    "jump_limit_px": 25.0
  }
}
```

兼容规则：`regions` 是新数据的权威结构，数量为 1–6 且至少一个位置启用；`region_id` 不得重复。旧数据只有 `roi` 时读取层自动生成 `region_1`。顶层 `roi` 继续保存，并镜像第一个启用位置的 ROI。

---

## 3. FrameRecord

```json
{
  "frame_index": 1,
  "region_id": "region_1",
  "region_index": 1,
  "region_label": "位置 1",
  "region_color": "#ef4444",
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

同一帧的全部启用位置结果保存到 `RunManifest.region_detection_results`；兼容字段 `RunManifest.detection_results` 每帧只保留第一个启用位置。某一位置 `INVALID` 不得影响同帧其他位置。

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
region detection results（每帧 × 每个启用位置）
artifact paths
software version/hash
config snapshot
```

新增 run manifest 必须保存锁定的 `measurement_definition.regions`。实时 frame event 使用：

```json
{
  "event": "frame",
  "frame_index": 123,
  "temperature_record": {},
  "region_results": [
    {
      "region_id": "region_1",
      "region_index": 1,
      "region_label": "位置 1",
      "color": "#ef4444",
      "detection_result": {},
      "curve_points": {"temperature_distance": {}},
      "live_point_status": {}
    }
  ],
  "detection_result": {},
  "curve_points": {}
}
```

顶层 `detection_result`、`curve_points` 和 `live_point_status` 镜像第一个启用位置。前端新代码优先读取 `region_results`。

---

## 8. AnalysisResult 与导出

`AnalysisResult.regions` 按位置保存独立的 `temperature_distance`、`all_frames`、`afas_preprocessing`、`afas_analysis` 和 `summary`。顶层同名字段继续镜像第一个位置；旧分析读取后包装为 `region_1`。

多位置 ZIP 在保留旧文件的同时新增：

```text
frame_results_long.csv
frame_results_wide.csv
regions/<region_id>_frame_results.csv
analysis_by_region.json
temperature_distance_combined.png
temperature_distance_<region_id>.png
roi_ab_overlay_combined.png
```
