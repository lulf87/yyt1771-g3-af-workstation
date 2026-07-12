# Multi-Region AFAS Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore complete, position-selectable AFAS analysis charts and truthful per-position reanalysis on current, reopened, and imported multi-ROI results.

**Architecture:** Keep `MultiRegionTrendChart` as the comparison overview and add one shared `MultiRegionAfasReview` that adapts a selected `RegionAnalysisResult` to the existing `AnalysisAfasChart`. Extend the recompute endpoint with an optional `region_id`; the backend rebuilds only that region and merges it with unchanged region snapshots, while the existing request without a region continues to rebuild all regions.

**Tech Stack:** React 18 + TypeScript, FastAPI + Pydantic, Python services, Node test runner, pytest, Playwright Chromium.

---

### Task 1: Lock the AFAS detail UI contract with failing tests

**Files:**
- Modify: `frontend/tests/operatorRegionResults.test.mjs`
- Modify: `frontend/tests/operatorActualUseUi.test.mjs`

- [ ] **Step 1: Add current/imported result assertions**

Assert that both `OperatorResultsPage` and `ImportedRunCurveReview` render `MultiRegionTrendChart` and `MultiRegionAfasReview`; assert the shared review contains position tabs and `AnalysisAfasChart`.

- [ ] **Step 2: Add selected-region isolation assertions**

Assert that `analysisForRegion` copies `region.afas_preprocessing`, `region.afas_analysis`, `region.summary`-backed analysis fields and does not select top-level compatibility AFAS values.

- [ ] **Step 3: Add parameter-scope assertions**

Assert that the operator reanalysis panel receives the selected `regionId` and calls `recomputeRunAnalysis` with that region ID; imported review must not expose reanalysis controls.

- [ ] **Step 4: Run tests and verify RED**

Run: `cd frontend && node --test tests/operatorRegionResults.test.mjs tests/operatorActualUseUi.test.mjs`

Expected: FAIL because `MultiRegionAfasReview`, `analysisForRegion`, and scoped request wiring do not exist.

### Task 2: Add selected-region analysis adaptation and shared detail UI

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/i18n.ts`
- Test: `frontend/tests/operatorRegionResults.test.mjs`

- [ ] **Step 1: Implement `analysisForRegion`**

Create a pure helper that returns an `AnalysisResult` whose legacy curve and AFAS fields mirror exactly one selected region while retaining the parent run metadata. Do not manufacture `all_frames`; use the region data already present.

- [ ] **Step 2: Implement `MultiRegionAfasReview`**

Add controlled props `analysis`, `selectedRegionId`, and `onSelectedRegionId`. Render color-coded position tabs, select the first region when the current selection is absent, render `AnalysisAfasChart` for the selected region, and show its failure reason when unavailable.

- [ ] **Step 3: Mount it in every structured result flow**

Render the shared component below the combined chart in `OperatorResultsPage` and `ImportedRunCurveReview`. Preserve PNG-only fallback behavior.

- [ ] **Step 4: Add layout and localized copy**

Add compact tab styling and translations for `AFAS detailed analysis`, `Selected position`, `Re-analyze current position`, and `Apply to all positions`.

- [ ] **Step 5: Run targeted frontend tests**

Run: `cd frontend && node --test tests/operatorRegionResults.test.mjs tests/operatorActualUseUi.test.mjs`

Expected: detail rendering tests PASS; scoped request tests remain RED until Task 4.

### Task 3: Add backend region-scoped analysis and persistence

**Files:**
- Modify: `backend/src/yyt1771_g3/api/main.py`
- Modify: `backend/src/yyt1771_g3/services/analysis_service.py`
- Modify: `backend/tests/unit/test_analysis_service.py`
- Modify: `backend/tests/integration/test_analysis_api.py`

- [ ] **Step 1: Write failing service tests**

Build a manifest with two enabled regions and distinct AFAS inputs. Recompute one region and assert that the target changes while the other `RegionAnalysisResult.model_dump()` remains identical.

- [ ] **Step 2: Write failing API tests**

POST `region_id` to `/api/runs/{run_id}/analysis`, assert the response preserves both regions, changes only the target, and persists the merged result/summary. Also assert an unknown region returns HTTP 422.

- [ ] **Step 3: Verify RED**

Run: `PYTHONPATH=backend/src pytest -q backend/tests/unit/test_analysis_service.py backend/tests/integration/test_analysis_api.py`

Expected: FAIL because `region_id` is not accepted and merge behavior is absent.

- [ ] **Step 4: Implement service merge helper**

Add a helper that locates a measurement region, rebuilds it with `build_region_analysis_result`, merges it into the existing region order, and calls `build_analysis_result_from_regions`. Reject missing/disabled IDs explicitly.

- [ ] **Step 5: Extend the API request and v1/v2 persistence**

Add `region_id: str | None`. For scoped requests, load the existing saved analysis snapshot, rebuild only the target from the manifest, merge unchanged regions, then atomically write v2 `analysis_summary.json` or v1 `analysis_result.json`. Requests without `region_id` preserve current all-region behavior.

- [ ] **Step 6: Verify GREEN**

Run: `PYTHONPATH=backend/src pytest -q backend/tests/unit/test_analysis_service.py backend/tests/integration/test_analysis_api.py`

Expected: all targeted backend tests PASS.

### Task 4: Wire truthful current-position and all-position parameter actions

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/tests/apiClient.test.mjs`
- Modify: `frontend/tests/operatorRegionResults.test.mjs`

- [ ] **Step 1: Write failing API-client test**

Assert `recomputeRunAnalysis` serializes an optional `region_id` and omits it for all-position requests.

- [ ] **Step 2: Extend the typed request**

Add `region_id?: string` to the client payload without changing response normalization.

- [ ] **Step 3: Make parameter source region-aware**

Pass `analysisForRegion(analysis, selectedRegionId)` into `AfasParameterPanel`, reset form state when selection changes, and label the scoped button `Re-analyze current position`.

- [ ] **Step 4: Add explicit all-position action**

Add a second `Apply to all positions` action that sends the same normalized preprocessing and tangent values without `region_id`. Both actions replace the full returned analysis atomically; imported views remain read-only.

- [ ] **Step 5: Run frontend targeted tests**

Run: `cd frontend && node --test tests/apiClient.test.mjs tests/operatorRegionResults.test.mjs tests/operatorActualUseUi.test.mjs`

Expected: all targeted frontend tests PASS.

### Task 5: Regression, browser verification, and issue closure

**Files:**
- Modify: `problem.md`
- Create evidence under: `output/playwright/p0097-multi-region-afas-detail-20260712/`

- [ ] **Step 1: Run full automated verification**

Run:

```bash
PYTHONPATH=backend/src pytest -q backend/tests
cd frontend && npm test && npm run build
```

Expected: all backend/frontend tests and build PASS with no skipped existing tests introduced.

- [ ] **Step 2: Start the approved simulated-material profile**

Run: `scripts/g3_fast_start.sh sim-sim` with `golden_a_20260522_dev_lab` selected by runtime policy.

- [ ] **Step 3: Execute Playwright browser flow**

Create at least three enabled positions, run and stop a simulation, open Results, switch all position tabs, verify baseline/tangent/AS/AF/max-slope SVG layers, reanalyze one position, reload the saved run, export and import the ZIP, and compare visible values and saved summary data.

- [ ] **Step 4: Record evidence and update P-0097**

Write browser, OS, URLs, dataset, steps, expected/actual, console state, screenshots, and export paths into `problem.md`. Mark `RESOLVED_BROWSER_VERIFIED` only if the complete browser flow passes; otherwise keep `FIXED_PENDING_BROWSER_RETEST` or `BLOCKED`.

- [ ] **Step 5: Final diff and performance guard audit**

Run `git diff --check` and confirm v2 summaries still exclude `all_frames`, no detector code changed, and complete events remain lightweight.
