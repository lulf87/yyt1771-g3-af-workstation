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

新 run、analysis、`run_export.json` 和 `parameters.json` 同时保存：

```json
{
  "runtime_source": "real_hardware 或 simulated_material",
  "product_mode": "production 或 development",
  "operator_data_source": "real_hardware 或 simulated_material",
  "provenance": {}
}
```

旧数据缺少字段时继续根据 `operator_data_source`、run mode 和 provenance 推断；无法可靠判断时保持 unknown，不得把模拟/离线数据显示为真实测试。

---

## 9. Operator run v2 紧凑存储

新 Operator run 不再把完整 `DetectionResult` 数组重复写入 manifest 和 analysis。正式数据分为：

```text
run_meta.json
  run/source/product/provenance/measurement/config/software

run_state.json
  state/stage/processed_frames/region_count/stop timestamps/error

results.sqlite
  frames                 每帧一条
  region_results         每帧每个 enabled ROI 一条，联合主键去重
  diagnostic_events      只保留 INVALID/outlier/显式诊断事件

analysis_summary.json
  regions[].curves/AFAS/summary/status_events/latest_result
```

`analysis_summary.json` 不得包含 `all_frames`、`detection_results` 或顶层第一 ROI 曲线副本。为保证重启后显示与停止时一致，最终曲线点、AFAS 预处理、AS/AF/拟合结果作为显示快照保存，打开历史 run 时不默认重新检测或重算 AFAS。

v1 兼容边界：

```text
v1: run_manifest.json + analysis_result.json
v2: run_meta.json + run_state.json + results.sqlite + analysis_summary.json
```

读取层自动识别版本。旧 v1 run 无需迁移；新 v2 run 不得在普通结果请求中重建巨大 v1 对象。导出按钮可在边界层临时构造紧凑的兼容视图，但不回写 run 主存储。

## 10. 温度—距离曲线层

`afas_preprocessing.parameters.temperature_group_bin_celsius` 是唯一桶宽来源，默认 `0.01 °C`。后端用整数 `bin_key` 统一分桶，并依次保存 `grouped_temperature_points`、`repaired_temperature_points`、`smoothed_temperature_points`。每个 grouped point 包含均值距离、sample count、min/max 及 first/last/representative frame。

默认正式 path 使用 smoothed，不可用时依次 fallback 到 repaired、grouped。raw frame points 仅用于审计和诊断散点，不得连线。任何正式 path 的温度 X 必须严格递增。
