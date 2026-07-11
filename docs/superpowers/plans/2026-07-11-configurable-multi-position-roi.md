# Configurable Multi-Position ROI Measurements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-to-six configurable measurement positions with independent ROI detection, filtering, live curves, AFAS results, and exports while preserving every single-ROI compatibility field.

**Architecture:** Normalize every measurement to `regions` while mirroring the first enabled position into legacy fields. Acquire each frame and temperature once, then use a new region orchestration service with state maps keyed by `region_id`; store complete results in additive region fields and continue exposing position 1 through legacy fields. Frontend state is array/map based, and combined charts share axes while retaining region-specific color, visibility, smoothing, status, and analysis.

**Tech Stack:** Python 3.11+, Pydantic v2, FastAPI, NumPy/OpenCV, pytest, React, TypeScript, Vite, Node `node:test`, SVG charts, Playwright/Chromium browser verification.

## Global Constraints

- Default one measurement position; minimum one total and enabled position; maximum six positions.
- The run snapshot locks position membership, enabled state, labels, colors, and ROIs until the run stops.
- One source frame and one temperature reading per frame, independent of region count.
- Operator Mode remains fixed to `detector_mode = contrast_widest_span` and exposes only contrast threshold, maximum allowed jump, and position/ROI controls.
- Camera connection logic, temperature connection logic, detector mathematics, and AFAS mathematics must not change.
- Measurement coordinates remain original source pixels; display scaling never changes formal ROI, A/B, or distance values.
- Each region has independent candidate, temporal, policy, outlier, curve, and AFAS state.
- `TEMP_SYNC_STALE` and `TEMP_SYNC_MISSING` never enter a formal temperature-distance curve.
- Invalid-first behavior remains mandatory: a bad region result is `INVALID`, not a plausible but wrong A/B pair.
- New code uses arrays/maps and must not introduce `region1` through `region6` fields.
- Existing single-ROI manifests, APIs, exports, imports, and Engineering Mode remain compatible.
- New manifests/exports always include normalized regions, including one-position runs.
- Raw input data and configured golden datasets are read-only.
- `problem.md` status may become `RESOLVED_BROWSER_VERIFIED` only after real-browser evidence is recorded.

## File Responsibility Map

- `backend/src/yyt1771_g3/core/models.py`: region models, validation/migration, result and analysis compatibility fields.
- `backend/src/yyt1771_g3/services/region_detection_service.py`: one-frame/many-region orchestration and state ownership.
- `backend/src/yyt1771_g3/services/probe_service.py`: multi-region probe response plus legacy top-level response.
- `backend/src/yyt1771_g3/services/live_offline_run_service.py`: offline acquisition-once integration and region events.
- `backend/src/yyt1771_g3/services/real_camera_run_service.py`: real acquisition-once integration and region events.
- `backend/src/yyt1771_g3/services/analysis_service.py`: per-region curve and AFAS construction plus legacy mirror.
- `backend/src/yyt1771_g3/services/export_service.py`: long/wide/per-region data and combined/per-region images.
- `backend/src/yyt1771_g3/services/import_service.py`: old/new JSON/ZIP normalization.
- `frontend/src/measurementRegions.ts`: pure region list operations and legacy normalization.
- `frontend/src/multiRegionAnalysis.ts`: live region state, result normalization, visible series, and display smoothing.
- `frontend/src/api/client.ts`: additive API types and normalization at network boundaries.
- `frontend/src/main.tsx`: Operator position panel, canvas integration, run lock, status, result and history composition.
- `frontend/src/curves.ts`: shared-axis multi-series chart models.
- `frontend/src/i18n.ts`: required Chinese/English position copy.
- `frontend/src/styles.css`: region list, overlay, legend, combined chart, and result summary styling.

---

### Task 1: Measurement Region Models And Legacy Migration

**Files:**
- Modify: `backend/src/yyt1771_g3/core/models.py`
- Modify: `backend/tests/unit/test_core_models.py`

**Interfaces:**
- Produces: `REGION_COLORS`, `MeasurementRegion`, `MeasurementDefinition.enabled_regions`, `DetectionResult.region_*`, `RunManifest.region_detection_results`, `RegionAnalysisResult`, and `AnalysisResult.regions`.
- Compatibility: legacy `roi` creates `region_1`; legacy result metadata defaults to `region_1`; legacy manifest results seed `region_detection_results`; legacy analysis top-level fields seed one `RegionAnalysisResult` only when parsing persisted data.

- [ ] **Step 1: Write failing model migration tests**

```python
def test_legacy_roi_is_normalized_to_region_one() -> None:
    measurement = MeasurementDefinition.model_validate(legacy_measurement_payload())
    assert measurement.regions[0].region_id == "region_1"
    assert measurement.regions[0].roi == measurement.roi
    assert measurement.regions[0].color == "#ef4444"

@pytest.mark.parametrize("count", [0, 7])
def test_region_count_outside_one_to_six_is_rejected(count: int) -> None:
    with pytest.raises(ValidationError):
        MeasurementDefinition.model_validate(measurement_payload_with_regions(count))

def test_measurement_requires_one_enabled_region_and_unique_ids() -> None:
    with pytest.raises(ValidationError):
        MeasurementDefinition.model_validate(measurement_payload(enabled=[False, False]))
    with pytest.raises(ValidationError):
        MeasurementDefinition.model_validate(measurement_payload(ids=["same", "same"]))
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests/unit/test_core_models.py -q`

Expected: FAIL because `MeasurementRegion`, `regions`, and region validation do not exist.

- [ ] **Step 3: Implement normalized model fields**

```python
REGION_COLORS = ("#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4")

class MeasurementRegion(G3Model):
    region_id: str
    index: int
    label: str
    enabled: bool = True
    roi: RotatedROI
    color: str

class MeasurementDefinition(G3Model):
    roi: RotatedROI | None = None
    regions: list[MeasurementRegion] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_roi(cls, value: Any) -> Any:
        payload = dict(value)
        if not payload.get("regions") and payload.get("roi") is not None:
            payload["regions"] = [{
                "region_id": "region_1", "index": 1, "label": "位置 1",
                "enabled": True, "roi": payload["roi"], "color": REGION_COLORS[0],
            }]
        return payload
```

Add after-validation for count, enabled count, ID/index uniqueness, ROI mirror, labels, and hex colors. Add default region metadata to `DetectionResult`, dual manifest fields, and region analysis models exactly as specified in the design.

- [ ] **Step 4: Run model tests and verify GREEN**

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests/unit/test_core_models.py -q`

Expected: PASS.

- [ ] **Step 5: Commit the model slice**

```bash
git add backend/src/yyt1771_g3/core/models.py backend/tests/unit/test_core_models.py
git commit -m "feat(model): add compatible measurement regions"
```

### Task 2: One-Frame Multi-Region Detection And Probe

**Files:**
- Create: `backend/src/yyt1771_g3/services/region_detection_service.py`
- Modify: `backend/src/yyt1771_g3/services/probe_service.py`
- Create: `backend/tests/unit/test_region_detection_service.py`
- Modify: `backend/tests/integration/test_probe_api.py`

**Interfaces:**
- Consumes: `MeasurementDefinition.enabled_regions`, existing `detect_frame_with_state`, `CandidateSelectionState`, run policy helpers, and one `np.ndarray`.
- Produces: `RegionRuntimeState`, `RegionFrameResult`, `create_region_runtime_state(measurement)`, `detect_regions_for_frame(frame, measurement, ...)`, and probe `region_results`.

- [ ] **Step 1: Write failing synthetic three-ROI and probe tests**

```python
def test_detect_regions_for_frame_returns_three_distinct_results(monkeypatch) -> None:
    calls: list[tuple[int, float]] = []
    monkeypatch.setattr(region_service, "detect_frame_with_state", fake_detector(calls))
    results, _ = detect_regions_for_frame(np.zeros((120, 240), dtype=np.uint8), three_region_measurement(), frame_index=9)
    assert [item.detection.region_id for item in results] == ["region_1", "region_2", "region_3"]
    assert [item.detection.distance_px for item in results] == [20.0, 30.0, 40.0]
    assert len({roi_center for _, roi_center in calls}) == 3

def test_probe_returns_one_image_and_all_enabled_region_results(client) -> None:
    body = client.post("/api/probe", json=three_region_probe_request()).json()
    assert body["image_data_url"].startswith("data:image/png;base64,")
    assert len(body["region_results"]) == 3
    assert body["detection_result"]["region_id"] == body["region_results"][0]["region_id"]
```

- [ ] **Step 2: Run tests and verify RED**

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests/unit/test_region_detection_service.py backend/tests/integration/test_probe_api.py -q`

Expected: FAIL because the orchestration service and `region_results` response are absent.

- [ ] **Step 3: Implement the region orchestration boundary**

```python
@dataclass
class RegionRuntimeState:
    candidate_states: dict[str, CandidateSelectionState]
    policy_states: dict[str, RunDetectorPolicyState]
    temporal_stabilizers: dict[str, CausalTemporalStabilizer]
    outlier_filters: dict[str, CausalDistanceOutlierFilter]
    temperature_distance_points: dict[str, list[CurvePoint]]

@dataclass(frozen=True)
class RegionFrameResult:
    region: MeasurementRegion
    detection: DetectionResult
    curve_points: dict[str, CurvePoint | None]
    live_point_status: dict[str, Any]
```

For each enabled region, clone the measurement with that ROI, run detection against the same frame array, attach region metadata, apply region-keyed state, and catch only region-local detector exceptions into `DetectionStatus.INVALID` results.

- [ ] **Step 4: Update probe responses**

Build all `region_results` from one loaded/captured frame. Keep `detection_result` and `overlay` as the first enabled item and include a combined overlay list.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests/unit/test_region_detection_service.py backend/tests/integration/test_probe_api.py -q`

Expected: PASS.

- [ ] **Step 6: Commit the detection/probe slice**

```bash
git add backend/src/yyt1771_g3/services/region_detection_service.py backend/src/yyt1771_g3/services/probe_service.py backend/tests/unit/test_region_detection_service.py backend/tests/integration/test_probe_api.py
git commit -m "feat(detection): probe all enabled measurement regions"
```

### Task 3: Per-Region Outlier And Live Status Isolation

**Files:**
- Modify: `backend/src/yyt1771_g3/services/distance_outlier_filter.py`
- Modify: `backend/src/yyt1771_g3/services/live_point_status.py`
- Modify: `backend/tests/unit/test_distance_outlier_filter.py`
- Modify: `backend/tests/unit/test_region_detection_service.py`

**Interfaces:**
- Produces: `filter_detection_sequence_by_region(results, config)` and `live_point_status.region_id`.
- Invariant: no recent distance or recovery state can cross a region ID.

- [ ] **Step 1: Write failing isolation tests**

```python
def test_region_one_outlier_does_not_pause_region_two() -> None:
    filters = {
        "region_1": CausalDistanceOutlierFilter(config(max_jump=10)),
        "region_2": CausalDistanceOutlierFilter(config(max_jump=10)),
    }
    filters["region_1"].apply(valid_detection("region_1", 100))
    filters["region_2"].apply(valid_detection("region_2", 500))
    rejected = filters["region_1"].apply(valid_detection("region_1", 160))
    accepted = filters["region_2"].apply(valid_detection("region_2", 506))
    assert rejected.distance_outlier_filtered is True
    assert accepted.distance_outlier_filtered is False
    assert accepted.distance_outlier_baseline_px == 500
```

- [ ] **Step 2: Run tests and verify RED**

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests/unit/test_distance_outlier_filter.py backend/tests/unit/test_region_detection_service.py -q`

Expected: FAIL because batch filtering and live status are not region-aware.

- [ ] **Step 3: Implement keyed sequence filtering and status metadata**

```python
def filter_detection_sequence_by_region(results: Iterable[DetectionResult], config: DetectorConfig) -> list[DetectionResult]:
    filters: dict[str, CausalDistanceOutlierFilter] = {}
    filtered: list[DetectionResult] = []
    for result in results:
        filter_state = filters.setdefault(result.region_id, CausalDistanceOutlierFilter(config))
        filtered.append(filter_state.apply(result))
    return filtered
```

Add `region_id`, `region_index`, and `region_label` to `build_live_point_status` output.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests/unit/test_distance_outlier_filter.py backend/tests/unit/test_region_detection_service.py -q`

Expected: PASS.

- [ ] **Step 5: Commit the isolation slice**

```bash
git add backend/src/yyt1771_g3/services/distance_outlier_filter.py backend/src/yyt1771_g3/services/live_point_status.py backend/tests/unit/test_distance_outlier_filter.py backend/tests/unit/test_region_detection_service.py
git commit -m "feat(run): isolate filtering state by region"
```

### Task 4: Offline And Real Run Multi-Region Events

**Files:**
- Modify: `backend/src/yyt1771_g3/services/live_offline_run_service.py`
- Modify: `backend/src/yyt1771_g3/services/real_camera_run_service.py`
- Modify: `backend/tests/integration/test_live_offline_run_service.py`
- Modify: `backend/tests/integration/test_real_camera_run_service.py`

**Interfaces:**
- Consumes: `detect_regions_for_frame` and `RegionRuntimeState`.
- Produces: frame events with `region_results`, manifests with first-position `detection_results` and all-position `region_detection_results`, and analysis progress events.

- [ ] **Step 1: Write failing acquisition-once and event tests**

```python
def test_real_camera_multi_region_frame_reads_camera_and_temperature_once(tmp_path) -> None:
    camera = CountingCamera(frame())
    temperature = CountingTemperature(reading())
    event = next(frame_events(camera, temperature, three_region_measurement(), tmp_path))
    assert camera.preview_calls == 1
    assert temperature.read_calls == 1
    assert len(event["region_results"]) == 3

def test_offline_region_outlier_does_not_stop_other_curve(monkeypatch, tmp_path) -> None:
    events = list(run_three_region_offline_stream(monkeypatch, tmp_path))
    frame = next(item for item in events if item["event"] == "frame" and item["frame_index"] == 2)
    by_id = {item["region_id"]: item for item in frame["region_results"]}
    assert by_id["region_1"]["curve_points"]["temperature_distance"] is None
    assert by_id["region_2"]["curve_points"]["temperature_distance"] is not None
```

- [ ] **Step 2: Run tests and verify RED**

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests/integration/test_live_offline_run_service.py backend/tests/integration/test_real_camera_run_service.py -q`

Expected: FAIL because run services still process one region.

- [ ] **Step 3: Integrate one-acquisition multi-region processing**

Replace the per-frame single detector path after acquisition with:

```python
region_results, runtime_state = detect_regions_for_frame(
    frame.array,
    measurement,
    frame_index=frame_index,
    runtime_state=runtime_state,
    frame_timestamp_ms=frame_timestamp_ms,
    synced_temperature=synced_temperature,
)
legacy_detection = region_results[0].detection
all_region_detections.extend(item.detection for item in region_results)
legacy_detections.append(legacy_detection)
```

Keep preview saving before region iteration and use the same `FrameRecord` and `TemperatureRecord` for all results.

- [ ] **Step 4: Emit compatibility and region event fields**

```python
return {
    "event": "frame",
    "detection_result": first.detection.model_dump(mode="json"),
    "curve_points": dump_curve_points(first.curve_points),
    "live_point_status": first.live_point_status,
    "region_results": [dump_region_result(item) for item in region_results],
}
```

Persist both manifest result representations and record the locked regions in `config_snapshot`.

- [ ] **Step 5: Run integration tests and verify GREEN**

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests/integration/test_live_offline_run_service.py backend/tests/integration/test_real_camera_run_service.py -q`

Expected: PASS, including all legacy one-region tests.

- [ ] **Step 6: Commit the run slice**

```bash
git add backend/src/yyt1771_g3/services/live_offline_run_service.py backend/src/yyt1771_g3/services/real_camera_run_service.py backend/tests/integration/test_live_offline_run_service.py backend/tests/integration/test_real_camera_run_service.py
git commit -m "feat(run): stream multi-region frame results"
```

### Task 5: Region Analysis And Progress

**Files:**
- Modify: `backend/src/yyt1771_g3/services/analysis_service.py`
- Modify: `backend/src/yyt1771_g3/api/main.py`
- Modify: `backend/tests/unit/test_analysis_service.py`
- Modify: `backend/tests/integration/test_analysis_api.py`
- Modify: `backend/tests/integration/test_live_offline_run_service.py`
- Modify: `backend/tests/integration/test_real_camera_run_service.py`

**Interfaces:**
- Produces: `build_region_analysis_result`, `build_analysis_result(...).regions`, re-analysis across all regions, and `analyzing_region` / `analysis_region_complete` stream events.

- [ ] **Step 1: Write failing independent analysis tests**

```python
def test_analysis_builds_three_independent_region_results() -> None:
    analysis = build_analysis_result(three_region_manifest())
    assert [region.region_id for region in analysis.regions] == ["region_1", "region_2", "region_3"]
    assert [len(region.temperature_distance) for region in analysis.regions] == [8, 8, 2]
    assert analysis.regions[2].summary["status"] == "unavailable"
    assert analysis.regions[0].summary["status"] != "unavailable"
    assert analysis.temperature_distance == analysis.regions[0].temperature_distance
```

Add a stream assertion that three `analyzing_region` events appear in index order and a failed middle region does not prevent the third completion event.

- [ ] **Step 2: Run tests and verify RED**

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests/unit/test_analysis_service.py backend/tests/integration/test_analysis_api.py backend/tests/integration/test_live_offline_run_service.py backend/tests/integration/test_real_camera_run_service.py -q`

Expected: FAIL because analysis has no region collection or per-region progress.

- [ ] **Step 3: Extract reusable region analysis**

```python
def build_region_analysis_result(region: MeasurementRegion, detections: list[DetectionResult], *, preprocessing_parameters=None, analysis_parameters=None) -> RegionAnalysisResult:
    curves = collect_curves(detections)
    preprocessing, afas = run_existing_afas(curves["temperature_distance"], preprocessing_parameters, analysis_parameters)
    return RegionAnalysisResult(
        region_id=region.region_id,
        region_index=region.index,
        region_label=region.label,
        color=region.color,
        all_frames=detections,
        **curves,
        afas_preprocessing=preprocessing,
        afas_analysis=afas,
        summary=region_summary(curves, preprocessing, afas),
    )
```

Group `manifest.region_detection_results` by region ID, analyze each enabled region in index order, catch region-local AFAS exceptions into an unavailable summary, and mirror the first result to legacy fields.

- [ ] **Step 4: Add re-analysis and streaming progress**

Use the same global AFAS parameter payload for each region. Emit `analyzing_region` before each analysis and `analysis_region_complete` afterward; return the assembled final `AnalysisResult` in `complete`.

- [ ] **Step 5: Run analysis tests and verify GREEN**

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests/unit/test_analysis_service.py backend/tests/integration/test_analysis_api.py backend/tests/integration/test_live_offline_run_service.py backend/tests/integration/test_real_camera_run_service.py -q`

Expected: PASS.

- [ ] **Step 6: Commit the analysis slice**

```bash
git add backend/src/yyt1771_g3/services/analysis_service.py backend/src/yyt1771_g3/api/main.py backend/tests/unit/test_analysis_service.py backend/tests/integration/test_analysis_api.py backend/tests/integration/test_live_offline_run_service.py backend/tests/integration/test_real_camera_run_service.py
git commit -m "feat(analysis): calculate AFAS results by region"
```

### Task 6: Multi-Region Export And Legacy Import

**Files:**
- Modify: `backend/src/yyt1771_g3/services/export_service.py`
- Modify: `backend/src/yyt1771_g3/services/import_service.py`
- Modify: `backend/tests/integration/test_export_service.py`
- Modify: `backend/tests/integration/test_export_api.py`
- Modify: `backend/tests/unit/test_import_service.py`
- Modify: `backend/tests/integration/test_import_api.py`

**Interfaces:**
- Produces: legacy files plus `frame_results_long.csv`, `frame_results_wide.csv`, `regions/*.csv`, `analysis_by_region.json`, combined/per-region curve PNGs, combined overlay PNG, and normalized imports.

- [ ] **Step 1: Write failing ZIP content and import tests**

```python
def test_multi_region_export_contains_long_wide_and_per_region_files(tmp_path: Path) -> None:
    bundle = export_three_region_bundle(tmp_path)
    with ZipFile(bundle) as archive:
        names = set(archive.namelist())
        assert "frame_results_long.csv" in names
        assert "frame_results_wide.csv" in names
        assert "regions/region_1_frame_results.csv" in names
        assert "regions/region_2_frame_results.csv" in names
        payload = json.loads(archive.read("run_export.json"))
        assert len(payload["run_manifest"]["measurement_definition"]["regions"]) == 3
        assert len(payload["analysis_result"]["regions"]) == 3

def test_legacy_single_region_export_imports_as_region_one() -> None:
    view = import_run_export_bytes(filename="run_export.json", content=legacy_export_bytes())
    assert view.analysis_result["regions"][0]["region_id"] == "region_1"
```

- [ ] **Step 2: Run tests and verify RED**

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests/integration/test_export_service.py backend/tests/integration/test_export_api.py backend/tests/unit/test_import_service.py backend/tests/integration/test_import_api.py -q`

Expected: FAIL because the new files and normalized imported regions are missing.

- [ ] **Step 3: Implement CSV and JSON artifacts**

```python
def _region_results(manifest: RunManifest) -> list[DetectionResult]:
    return manifest.region_detection_results or manifest.detection_results

def _group_results_by_frame(results: list[DetectionResult]) -> dict[int, dict[str, DetectionResult]]:
    grouped: dict[int, dict[str, DetectionResult]] = {}
    for result in results:
        grouped.setdefault(result.frame_index, {})[result.region_id] = result
    return grouped
```

Write long rows with region identity first, wide rows with stable `<safe_region_id>_distance_px` and status columns, and one existing-schema CSV per region. Keep `frame_results.csv` unchanged for the first compatibility region.

- [ ] **Step 4: Implement image artifacts and import normalization**

Render shared-domain combined curves using region colors, per-region curve PNGs, and all ROI/A/B overlays on one preview. Prefer new analysis/long data on import and wrap legacy top-level structures as `region_1`.

- [ ] **Step 5: Run export/import tests and verify GREEN**

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests/integration/test_export_service.py backend/tests/integration/test_export_api.py backend/tests/unit/test_import_service.py backend/tests/integration/test_import_api.py -q`

Expected: PASS and legacy CSV field-order assertions remain unchanged.

- [ ] **Step 6: Commit the export/import slice**

```bash
git add backend/src/yyt1771_g3/services/export_service.py backend/src/yyt1771_g3/services/import_service.py backend/tests/integration/test_export_service.py backend/tests/integration/test_export_api.py backend/tests/unit/test_import_service.py backend/tests/integration/test_import_api.py
git commit -m "feat(export): package results for every measurement region"
```

### Task 7: Frontend Region State And API Compatibility

**Files:**
- Create: `frontend/src/measurementRegions.ts`
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/tests/measurementRegions.test.mjs`
- Modify: `frontend/tests/apiClientUrls.test.mjs`

**Interfaces:**
- Produces: `MeasurementRegion`, `RegionResult`, `RegionAnalysisResult`, `normalizeMeasurementRegions`, `addRegion`, `removeRegion`, `updateRegionRoi`, `toggleRegionEnabled`, `renameRegion`, `regionResultsFromEvent`, and API request normalization.

- [ ] **Step 1: Write failing pure state tests**

```javascript
test("legacy ROI normalizes to one enabled region", async () => {
  const measurement = normalizeMeasurementRegions(legacyMeasurement());
  assert.equal(measurement.regions.length, 1);
  assert.equal(measurement.regions[0].region_id, "region_1");
  assert.deepEqual(measurement.roi, measurement.regions[0].roi);
});

test("position operations enforce one through six and preserve IDs/colors", async () => {
  let measurement = normalizeMeasurementRegions(legacyMeasurement());
  for (let index = 0; index < 5; index += 1) measurement = addRegion(measurement);
  assert.equal(measurement.regions.length, 6);
  assert.throws(() => addRegion(measurement), /six/i);
  const kept = measurement.regions[2];
  measurement = removeRegion(measurement, measurement.regions[1].region_id);
  assert.equal(measurement.regions.find((item) => item.region_id === kept.region_id).color, kept.color);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd frontend && npm test -- measurementRegions.test.mjs apiClientUrls.test.mjs`

Expected: FAIL because the module and additive API types do not exist.

- [ ] **Step 3: Implement pure region operations and types**

```typescript
export const REGION_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#06b6d4"] as const;

export function updateRegionRoi(measurement: MeasurementDefinition, regionId: string, roi: RotatedROI): MeasurementDefinition {
  const regions = measurement.regions.map((region) => region.region_id === regionId ? { ...region, roi } : region);
  return mirrorCompatibilityRoi({ ...measurement, regions });
}
```

All operations return new arrays/objects, reject invalid bounds, preserve IDs/colors, renumber display indices after deletion, and mirror the first enabled ROI.

- [ ] **Step 4: Normalize network payloads**

Before POST, always include normalized `regions` and compatibility `roi`. On response, synthesize one `region_results` item or one `analysis.regions` item when only legacy fields exist.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `cd frontend && npm test -- measurementRegions.test.mjs apiClientUrls.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the frontend state slice**

```bash
git add frontend/src/measurementRegions.ts frontend/src/api/client.ts frontend/tests/measurementRegions.test.mjs frontend/tests/apiClientUrls.test.mjs
git commit -m "feat(operator): manage configurable measurement positions"
```

### Task 8: Operator Position Panel And Multi-ROI Canvas

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/i18n.ts`
- Modify: `frontend/src/styles.css`
- Create: `frontend/tests/operatorMeasurementRegions.test.mjs`
- Modify: `frontend/tests/operatorActualUseUi.test.mjs`
- Modify: `frontend/tests/operatorProbeUi.test.mjs`
- Modify: `frontend/tests/roiCoordinates.test.mjs`

**Interfaces:**
- Consumes: region helpers and probe `region_results`.
- Produces: `OperatorMeasurementPositionsPanel` and multi-region `FrameCanvas` compatibility props.

- [ ] **Step 1: Write failing UI source and coordinate tests**

```javascript
test("operator mode renders configurable positions and locks them while running", () => {
  assert.match(mainSource, /function OperatorMeasurementPositionsPanel/);
  assert.match(mainSource, /disabled=\{operatorRunActive/);
  assert.match(mainSource, /Add position/);
  assert.match(mainSource, /Delete position/);
});

test("frame canvas draws all enabled regions and edits only the active one", () => {
  assert.match(mainSource, /regions\.map/);
  assert.match(mainSource, /region\.region_id === activeRegionId/);
  assert.match(mainSource, /stroke=\{region\.color\}/);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd frontend && npm test -- operatorMeasurementRegions.test.mjs operatorActualUseUi.test.mjs operatorProbeUi.test.mjs roiCoordinates.test.mjs`

Expected: FAIL because the position panel and multi-overlay canvas are absent.

- [ ] **Step 3: Implement the Operator position panel**

Render an array-driven list with active edit selection, enabled toggle, inline label, current result, point count, last frame, edit, delete, and add actions. Disable deletion at one, addition at six, disabling at one enabled, and all changes while running. Add exact bilingual entries for: `检测位置 / Measurement positions`, `添加位置 / Add position`, `删除位置 / Delete position`, `当前编辑位置 / Active edit position`, `启用 / Enabled`, `禁用 / Disabled`, `编辑测量区域 / Edit ROI`, `最多支持 6 个检测位置 / Up to 6 measurement positions are supported`, `至少保留 1 个检测位置 / At least one measurement position is required`, `该位置无正式点 / No formal points for this position`, `正在分析位置 {current}/{total} / Analyzing position {current}/{total}`, `组合曲线 / Combined curves`, `位置结果 / Position results`, and `启用位置 / Enabled positions`.

- [ ] **Step 4: Extend the frame canvas compatibly**

```typescript
type FrameCanvasRegionOverlay = {
  region: MeasurementRegion;
  detection: DetectionResult | null;
};
```

Render every enabled ROI and detection overlay in its fixed color. Attach move/resize/rotate handlers only to the active region. Adapt the existing single `roi`/`abPoints` props into one overlay for Engineering Mode.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `cd frontend && npm test -- operatorMeasurementRegions.test.mjs operatorActualUseUi.test.mjs operatorProbeUi.test.mjs roiCoordinates.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the Operator ROI slice**

```bash
git add frontend/src/main.tsx frontend/src/i18n.ts frontend/src/styles.css frontend/tests/operatorMeasurementRegions.test.mjs frontend/tests/operatorActualUseUi.test.mjs frontend/tests/operatorProbeUi.test.mjs frontend/tests/roiCoordinates.test.mjs
git commit -m "feat(operator): edit multiple colored ROIs"
```

### Task 9: Multi-Region Live State And Shared-Axis Trend

**Files:**
- Create: `frontend/src/multiRegionAnalysis.ts`
- Modify: `frontend/src/liveRunAnalysis.ts`
- Modify: `frontend/src/curves.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/styles.css`
- Create: `frontend/tests/multiRegionAnalysis.test.mjs`
- Modify: `frontend/tests/liveRunAnalysis.test.mjs`
- Modify: `frontend/tests/curveSpecs.test.mjs`

**Interfaces:**
- Produces: `RegionLiveStateById`, `appendRegionFrameEvent`, `buildMultiRegionTrendModel`, per-region display smoothing, shared axes, legend visibility, and region tooltip metadata.

- [ ] **Step 1: Write failing independent update and chart tests**

```javascript
test("region one invalid does not stop region two formal curve growth", () => {
  const next = appendRegionFrameEvent(emptyRegionLiveState(measurement), eventWithRegionOneInvalid());
  assert.equal(next.region_1.temperatureDistance.length, 0);
  assert.equal(next.region_2.temperatureDistance.length, 1);
  assert.equal(next.region_2.lastFormalFrameIndex, 12);
});

test("combined trend shares axes and preserves region colors", () => {
  const model = buildMultiRegionTrendModel(regionAnalyses(), { width: 900, height: 420, visibleRegionIds: new Set(["region_1", "region_2"]) });
  assert.equal(model.series.length, 2);
  assert.equal(model.series[0].color, "#ef4444");
  assert.deepEqual(model.series[0].xRange, model.series[1].xRange);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd frontend && npm test -- multiRegionAnalysis.test.mjs liveRunAnalysis.test.mjs curveSpecs.test.mjs`

Expected: FAIL because multi-region live state and combined model are absent.

- [ ] **Step 3: Implement independent live accumulation and smoothing**

Store results and curves by region ID. For every frame event, append each non-null formal point immediately. Smooth a copied point array per region for display only and retain raw formal points unchanged.

- [ ] **Step 4: Implement the combined trend chart**

Build one domain across visible series, deterministic display downsampling above the selected point threshold, per-region paths and latest markers, legend toggle state, and nearest-point tooltip with label, temperature, distance, frame, detection status, and sync status.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `cd frontend && npm test -- multiRegionAnalysis.test.mjs liveRunAnalysis.test.mjs curveSpecs.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the live chart slice**

```bash
git add frontend/src/multiRegionAnalysis.ts frontend/src/liveRunAnalysis.ts frontend/src/curves.ts frontend/src/main.tsx frontend/src/styles.css frontend/tests/multiRegionAnalysis.test.mjs frontend/tests/liveRunAnalysis.test.mjs frontend/tests/curveSpecs.test.mjs
git commit -m "feat(operator): chart live curves by region"
```

### Task 10: Multi-Region Results, Re-Analysis, And History

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/curves.ts`
- Modify: `frontend/src/i18n.ts`
- Modify: `frontend/src/styles.css`
- Create: `frontend/tests/operatorRegionResults.test.mjs`
- Modify: `frontend/tests/curveSpecs.test.mjs`
- Modify: `frontend/tests/apiClientUrls.test.mjs`

**Interfaces:**
- Consumes: normalized `AnalysisResult.regions` from current runs and imports.
- Produces: region result summaries, combined result chart layers, legend toggles, global re-analysis across all regions, and analysis progress copy.

- [ ] **Step 1: Write failing result/history tests**

```javascript
test("results render one summary per analysis region", () => {
  assert.match(mainSource, /analysis\.regions\.map/);
  assert.match(mainSource, /Position results/);
  assert.match(mainSource, /Combined curves/);
});

test("legacy imported analysis is shown as position one", async () => {
  const normalized = normalizeAnalysisRegions(legacyAnalysis());
  assert.equal(normalized.regions.length, 1);
  assert.equal(normalized.regions[0].region_id, "region_1");
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd frontend && npm test -- operatorRegionResults.test.mjs curveSpecs.test.mjs apiClientUrls.test.mjs`

Expected: FAIL because the result page and imported view remain single-region.

- [ ] **Step 3: Implement result summaries and combined layers**

Render per-region raw count, smoothed count, AS, AF, delta T, maximum-slope temperature, status, and failure reason. Extend the combined chart to toggle formal raw points, live/display trend, and AFAS smoothed curve per visible region on one axis.

- [ ] **Step 4: Wire global re-analysis and progress**

Submit the existing AFAS parameter form once; consume returned `analysis.regions`. During stop analysis events show `Analyzing position {current}/{total}` and merge completed region results without hiding prior regions.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `cd frontend && npm test -- operatorRegionResults.test.mjs curveSpecs.test.mjs apiClientUrls.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the result/history slice**

```bash
git add frontend/src/main.tsx frontend/src/curves.ts frontend/src/i18n.ts frontend/src/styles.css frontend/tests/operatorRegionResults.test.mjs frontend/tests/curveSpecs.test.mjs frontend/tests/apiClientUrls.test.mjs
git commit -m "feat(operator): review region results together"
```

### Task 11: Requirements, Manifest Documentation, And Problem Registration

**Files:**
- Modify: `docs/requirements/G3_需求规格说明书_v0.1.md`
- Modify: `docs/architecture/G3_技术架构草案_v0.1.md`
- Modify: `docs/data/G3_数据结构与manifest草案_v0.1.md`
- Modify: `docs/milestones/G3_开发任务拆分_v0.1.md`
- Modify: `docs/testing/G3_验收与真实浏览器复测清单_v0.1.md`
- Modify: `problem.md`

**Interfaces:**
- Produces: confirmed 1–6 ROI requirements, dual-layer schema documentation, test checklist, milestone entry, and a traceable problem item.

- [ ] **Step 1: Update confirmed requirements without changing detector/AFAS rules**

Replace the obsolete `ROI 数量：一个` statement with:

```text
检测位置数量：最少 1 个，最多 6 个；默认 1 个。
每个启用检测位置拥有独立 rotated ROI、A/B、distance、正式曲线和 AFAS 结果。
同一帧只采集一次图像并只读取一次温度；所有启用位置共享该帧和温度。
```

Document `regions`, `region_detection_results`, `region_results`, `analysis.regions`, and legacy mirror fields.

- [ ] **Step 2: Add a new `problem.md` item without staging unrelated P-0089**

Register the multi-position work as `IN_PROGRESS`, record the affected modules and expected browser flows, and preserve the existing uncommitted P-0089 hunk. Stage only the new problem hunk when committing.

- [ ] **Step 3: Verify documentation consistency**

Run: `rg -n "ROI 数量：一个|多 ROI.*不做|region_detection_results|最多 6|最少 1" docs problem.md`

Expected: no active confirmed requirement says multi-ROI is excluded; the new additive fields and limits are documented.

- [ ] **Step 4: Commit documentation with selective staging**

```bash
git add docs/requirements/G3_需求规格说明书_v0.1.md docs/architecture/G3_技术架构草案_v0.1.md docs/data/G3_数据结构与manifest草案_v0.1.md docs/milestones/G3_开发任务拆分_v0.1.md docs/testing/G3_验收与真实浏览器复测清单_v0.1.md
git add -p problem.md
git commit -m "docs: specify multi-position measurement workflow"
```

### Task 12: Full Automated Verification

**Files:**
- No planned file changes. If a verification command fails, return to the owning task above, add a regression test to that task's listed test file, verify RED, implement the minimal fix in that task's listed production file, and rerun this full verification task.

**Interfaces:**
- Produces: fresh full-suite evidence and a requirement-by-requirement completion matrix.

- [ ] **Step 1: Run backend unit and integration tests**

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests -q`

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run frontend tests and type/build checks**

Run: `cd frontend && npm test`

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`

Run: `cd frontend && npm run build`

Expected: all commands exit 0 with zero test failures and zero TypeScript/build errors.

- [ ] **Step 3: Run source and diff checks**

Run: `git diff --check`

Run: `rg -n "region1|region2|region3|region4|region5|region6" frontend/src backend/src`

Expected: diff check exits 0; no six-field hard-coded state model is introduced.

- [ ] **Step 4: Inspect generated multi-region export**

Create a deterministic three-region run fixture and inspect ZIP names, CSV headers/row counts, JSON regions, and PNG non-empty sizes. Confirm `frame_results.csv` retains its legacy core field order.

- [ ] **Step 5: Audit every acceptance criterion against tests/artifacts**

Create a local checklist mapping the 14 acceptance criteria and backend/frontend test requirements to test names, generated artifacts, or browser evidence. Any missing evidence returns to the relevant RED-GREEN task before browser verification.

### Task 13: Real Browser And Golden Dataset Verification

**Files:**
- Modify: `problem.md`
- Create: evidence under `output/playwright/` and export artifacts under `output/` (not committed unless repository policy already tracks them).

**Interfaces:**
- Consumes: running backend/frontend and the configured dataset registry.
- Produces: browser evidence for Operator, Engineering, new/legacy import, export, and both golden datasets.

- [ ] **Step 1: Start the safe simulated profile for repeatable UI flows**

Run: `scripts/g3_fast_start.sh sim-sim --restart --no-open`

Verify: `/api/health`, `/api/offline-datasets`, `/api/hardware/profile`, and `http://127.0.0.1:5176/` respond successfully.

- [ ] **Step 2: Run Operator three-position browser flow**

In Playwright Chromium at `http://127.0.0.1:5176/?mode=operator`:

1. Add positions to reach three.
2. Edit each ROI and confirm fixed colors and active highlight.
3. Probe once and confirm one displayed image with three region results/overlays.
4. Start run and confirm add/delete/toggle/ROI controls are locked.
5. Confirm three independent status rows and shared-axis live curves.
6. Stop and observe region analysis progress.
7. Confirm three result summaries and combined chart legend toggles.
8. Export ZIP and inspect `frame_results.csv`, `frame_results_long.csv`, `frame_results_wide.csv`, every `regions/<safe_region_id>_frame_results.csv`, `analysis_by_region.json`, `run_export.json`, `parameters.json`, `temperature_distance.png`, `temperature_distance_combined.png`, every `temperature_distance_<safe_region_id>.png`, `roi_ab_overlay.png`, and `roi_ab_overlay_combined.png`.
9. Import that ZIP and confirm three-position history rendering.

- [ ] **Step 3: Run legacy and Engineering browser regressions**

Import a pre-feature one-region export and confirm it displays as Position 1. Switch to Engineering Mode and complete the existing single-ROI Setup/Probe/Run/Analysis flow without multi-position Operator controls replacing engineering diagnostics.

- [ ] **Step 4: Run golden A and C dataset flows**

Use dataset IDs `golden_a_20260522_dev_lab` and `golden_c_20260529_dev_lab`. For each dataset, complete Setup ROI editing and probe, Playback probe, Live Offline Run, Analysis review, and Export download/import. Confirm source-pixel overlay alignment, independent multi-position results, and no raw-data modifications.

- [ ] **Step 5: Update `problem.md` status and evidence**

Record date, Chromium version, macOS, URLs, dataset, pages, steps, expected/actual, PASS/FAIL, screenshots, logs, run manifests, analyses, and export paths. Set `RESOLVED_BROWSER_VERIFIED` only if every required browser flow passes; otherwise use `REOPENED` or `FIXED_PENDING_BROWSER_RETEST` with the exact gap.

### Task 14: Review, Publish, And Open Draft PR

**Files:**
- No new production files unless review finds a tested defect.

**Interfaces:**
- Produces: reviewed commits, pushed feature branch, and draft PR targeting `codex/first-run-hardware-setup`.

- [ ] **Step 1: Perform final scope and dirty-worktree audit**

Run: `git status --short --branch`

Run: `git diff codex/first-run-hardware-setup...HEAD --stat`

Run: `git diff codex/first-run-hardware-setup...HEAD -- problem.md`

Expected: feature changes are intentional; unrelated P-0089 is not in commits; no generated data or raw inputs are staged.

- [ ] **Step 2: Run fresh completion verification**

Repeat the full backend suite, frontend tests, TypeScript check, build, and `git diff --check`. Read complete outputs before making any completion claim.

- [ ] **Step 3: Confirm GitHub authentication and push**

```bash
gh --version
gh auth status
git push -u origin codex/configurable-multi-position-roi
```

- [ ] **Step 4: Create the draft PR**

Create a draft PR with:

```text
Title: feat(operator): support configurable multi-position ROI measurements
Base: codex/first-run-hardware-setup
Head: codex/configurable-multi-position-roi
```

The body summarizes the dual-layer schema, one-frame/one-temperature invariant, independent region state, Operator UX, analysis/export compatibility, automated checks, browser evidence, and remaining known risks.

- [ ] **Step 5: Verify remote PR state**

Run: `gh pr view --json number,title,url,isDraft,baseRefName,headRefName,state`

Expected: title matches exactly, `isDraft=true`, base/head branches match, and state is OPEN.
