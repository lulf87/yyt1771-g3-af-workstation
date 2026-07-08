# Operator UI And Export Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the actual-use Operator interface for real camera + real temperature operation, add a guided export folder picker, and add display-only live trend smoothing.

**Architecture:** Keep backend detector and AFAS math unchanged. Gate all simplification inside Operator Mode UI and convert Operator measurement submissions to real-camera `contrast_widest_span`, while Engineering Mode keeps the existing full setup/run/analysis panels. Add small frontend helpers for temperature polling, export directory persistence, and live display smoothing so tests can cover behavior without browser-only UI setup.

**Tech Stack:** Vite, React, TypeScript, browser File System Access API, IndexedDB, Node `node:test`, FastAPI backend smoke tests.

## Global Constraints

- Only simplify actual-use / Operator Mode; Engineering Mode must retain data source, object class, detector mode, hardware diagnostics, advanced parameters, and full analysis/export behavior.
- Do not change detector core logic or AFAS mathematical logic.
- Operator Mode is fixed to real camera + real temperature and must not fall back to offline or simulated data.
- Operator Mode submits `detector_mode = "contrast_widest_span"` and exposes only `contrast_threshold` plus `distance_outlier_max_jump_px`.
- Export API remains unchanged; frontend changes only the save workflow.
- Live display smoothing is display-only and must not mutate `analysis.temperature_distance`.
- UI and export changes require automated tests and real browser retest with `problem.md` evidence.

---

### Task 1: Operator Surface Tests

**Files:**
- Modify: `frontend/tests/operatorProbeUi.test.mjs`
- Modify: `frontend/tests/detectorControls.test.mjs`
- Create: `frontend/tests/operatorActualUseUi.test.mjs`

**Interfaces:**
- Consumes: current `frontend/src/main.tsx` source.
- Produces: failing source-level tests for Operator hiding offline/source/object/detector controls, real-hardware-only probe/run, hidden read temperature button, and retained Engineering Mode controls.

- [ ] **Step 1: Write failing tests**

Update tests to assert that `OperatorRunPage` no longer renders `OperatorSourceControls`, object class select, C detector mode select, camera backend metrics, or read-temperature button, and that it still renders `Contrast threshold`, `Maximum allowed jump (px)`, `Probe current frame`, serial port refresh, and re-analysis controls on results.

- [ ] **Step 2: Run tests to verify RED**

Run: `cd frontend && npm test -- operatorProbeUi.test.mjs detectorControls.test.mjs operatorActualUseUi.test.mjs`

Expected: FAIL because current Operator Mode still exposes source selection, object/detector controls, camera diagnostics, and manual read temperature.

### Task 2: Export Picker And Display Smoothing Tests

**Files:**
- Create: `frontend/tests/exportSaveTarget.test.mjs`
- Modify: `frontend/tests/apiClientUrls.test.mjs`
- Modify: `frontend/tests/curveSpecs.test.mjs`

**Interfaces:**
- Produces: `fetchRunExportBundle(runId)`, `createIndexedDbExportDirectoryStore()`, `writeBlobToDirectory()`, `smoothLiveDisplaySeries(points, options)`, and `buildRunTrendModel(..., { displaySmoothing })` expectations.

- [ ] **Step 1: Write failing tests**

Add tests for blob fetch without immediate download, modal-support helper paths, IndexedDB handle persistence source, fallback-download source, live display smoothing labels, and non-mutating behavior.

- [ ] **Step 2: Run tests to verify RED**

Run: `cd frontend && npm test -- exportSaveTarget.test.mjs apiClientUrls.test.mjs curveSpecs.test.mjs`

Expected: FAIL because the new modules/functions and model option do not exist yet.

### Task 3: Implement Operator UI Simplification

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/i18n.ts`
- Modify: `frontend/src/operatorTemperaturePolling.ts`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: current measurement state and existing real-camera probe/run functions.
- Produces: `toOperatorActualUseMeasurement(measurement)` and Operator-only panels with fixed real camera source, fixed contrast detector mode, automatic temperature polling, and simplified hardware error copy.

- [ ] **Step 1: Implement minimal code**

Remove Operator source/object/detector mode rendering, add `OperatorDetectionParameterPanel`, remove Operator manual read button, add a 500 ms idle polling effect using `shouldAutoPollOperatorTemperature`, and force Operator probe/run measurements to real-camera `contrast_widest_span`.

- [ ] **Step 2: Run targeted tests**

Run: `cd frontend && npm test -- operatorProbeUi.test.mjs detectorControls.test.mjs operatorActualUseUi.test.mjs`

Expected: PASS.

### Task 4: Implement Export Picker And Live Display Smoothing

**Files:**
- Modify: `frontend/src/api/client.ts`
- Create: `frontend/src/exportSaveTarget.ts`
- Modify: `frontend/src/curves.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/i18n.ts`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Produces: Operator export modal using File System Access API plus IndexedDB handle persistence, fallback browser download, and Operator live chart display smoothing.

- [ ] **Step 1: Implement minimal code**

Add `fetchRunExportBundle`, directory picker helpers, `ExportSaveDialog`, and `displaySmoothing` support in `buildRunTrendModel`; pass smoothing only from Operator live trend.

- [ ] **Step 2: Run targeted tests**

Run: `cd frontend && npm test -- exportSaveTarget.test.mjs apiClientUrls.test.mjs curveSpecs.test.mjs`

Expected: PASS.

### Task 5: Verification, Browser Retest, Commit, Push, PR

**Files:**
- Modify: `problem.md`

**Interfaces:**
- Consumes: local services through `scripts/g3_fast_start.sh real-real`.
- Produces: browser retest evidence under `output/playwright/`, final `problem.md` status, commit, pushed branch, and draft PR.

- [ ] **Step 1: Run automated checks**

Run: `cd frontend && npm test`

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit`

Run: `PYTHONPATH=backend/src /Users/lulingfeng/miniforge3/envs/yyt1771-mvs-x86/bin/python3 -m pytest backend/tests/integration/test_export_service.py backend/tests/integration/test_camera_api.py -q`

- [ ] **Step 2: Browser retest**

Run: `scripts/g3_fast_start.sh real-real`, open `http://127.0.0.1:5176/`, verify Operator simplification, real hardware error handling or real probe/run, temperature auto refresh, live smoothing, result re-analysis controls, export modal, and fallback or directory save.

- [ ] **Step 3: Update problem.md**

Record commands, browser, pages, expected/actual, result, and evidence path.

- [ ] **Step 4: Publish**

Commit with title `feat(operator): simplify actual-use UI and export picker`, push `codex/operator-simplify-export-picker`, and open a draft PR titled `feat(operator): simplify actual-use UI and add guided export folder picker`.
