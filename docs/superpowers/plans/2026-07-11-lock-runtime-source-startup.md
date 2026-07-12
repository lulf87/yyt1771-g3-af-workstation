# Startup-Selected Runtime Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the product UI to the actual-use Operator workflow and make backend startup configuration the sole authority for real-hardware versus simulated-material acquisition.

**Architecture:** Add an immutable `RuntimePolicy` parsed and validated from environment plus hardware profile, expose it through runtime/source-status APIs, and use it to guard acquisition and provenance. Keep the existing Operator multi-ROI workflow, but derive its source and labels from the runtime API instead of query parameters, local storage, or browser controls.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic, pytest, React 18, TypeScript, Vite, Node test runner, Bash, PowerShell, Playwright/browser QA.

## Global Constraints

- Do not change detector mathematics, AFAS mathematics, ROI measurement coordinates, or multi-position acquisition semantics.
- Operator fixes `detector_mode=contrast_widest_span` and `distance_outlier_filter_enabled=true`.
- Operator exposes only contrast threshold and maximum allowed jump as detector parameters.
- One frame and one temperature value feed every enabled ROI in a frame event.
- Real-hardware mode must never instantiate or fall back to simulated camera or temperature adapters.
- Production mode must reject simulated-material startup.
- Raw data and registered offline datasets are immutable.
- UI/process fixes require real-browser retest evidence in `problem.md`.

---

### Task 1: Runtime policy and startup validation

**Files:**
- Create: `backend/src/yyt1771_g3/core/runtime_policy.py`
- Create: `backend/tests/unit/test_runtime_policy.py`
- Modify: `backend/src/yyt1771_g3/api/main.py`

**Interfaces:**
- Produces: `RuntimePolicy`, `RuntimePolicyError`, `load_runtime_policy(environ=None, hardware_config=None)` and `runtime_policy_payload(policy)`.
- Consumes: `HardwareConfig.camera.backend`, `HardwareConfig.camera.simulated_dataset_id`, and `HardwareConfig.temp.backend`.

- [ ] Write failing tests for safe defaults, both valid sources, invalid enum values, production simulation rejection, real/sim adapter mismatch, dataset environment override, and API labels.
- [ ] Run `PYTHONPATH=backend/src pytest backend/tests/unit/test_runtime_policy.py -q` and confirm failures are caused by the missing module.
- [ ] Implement enum normalization, derived booleans, adapter classification, validation, bilingual labels, and the runtime payload.
- [ ] Attach validated policy to `app.state.runtime_policy` during lifespan startup and log runtime source, product mode, and simulation allowance.
- [ ] Run the targeted tests and existing hardware-config tests until green.
- [ ] Commit with `feat(runtime): validate startup-selected acquisition source`.

### Task 2: Runtime and source-status API contracts

**Files:**
- Modify: `backend/src/yyt1771_g3/api/main.py`
- Modify: `backend/src/yyt1771_g3/services/source_provenance.py`
- Create: `backend/tests/integration/test_runtime_api.py`
- Modify: `backend/tests/integration/test_camera_api.py`

**Interfaces:**
- Produces: `GET /api/app/runtime` and extended `/api/operator/source-status` fields.
- Consumes: `RuntimePolicy` from Task 1 and existing provenance classification.

- [ ] Write failing API tests for real, simulated, production, configuration-error, and component-availability responses.
- [ ] Verify failures against the current absent endpoint/fields.
- [ ] Add `/api/app/runtime`; extend `operator_source_status()` with runtime/product/configuration fields and required bilingual configuration-error copy.
- [ ] Make unavailable real devices return stable false readiness without changing their adapters.
- [ ] Run runtime, camera API, hardware setup API, and source provenance tests.
- [ ] Commit with `feat(api): expose immutable runtime source status`.

### Task 3: Source guards and source-selected Operator acquisition

**Files:**
- Modify: `backend/src/yyt1771_g3/api/main.py`
- Modify: `backend/src/yyt1771_g3/camera/factory.py`
- Modify: `backend/src/yyt1771_g3/services/real_camera_run_service.py`
- Modify: `backend/src/yyt1771_g3/services/live_offline_run_service.py`
- Modify: `backend/tests/integration/test_probe_api.py`
- Modify: `backend/tests/integration/test_live_offline_run_api.py`
- Modify: `backend/tests/integration/test_camera_api.py`

**Interfaces:**
- Produces: Operator probe/run endpoints whose adapters are selected only by runtime policy.
- Consumes: runtime policy, startup dataset ID, existing simulated dataset camera, and existing real/sim temperature controllers.

- [ ] Add failing tests proving real mode rejects offline/sim acquisition, simulated mode rejects hardware acquisition, simulated mode completes probe/run without real hardware, and real unavailable mode returns no simulated frame.
- [ ] Verify each test fails for the expected missing guard or incorrect source.
- [ ] Add a focused runtime-source guard and route Operator probe/run through the correct existing service path without changing detector code.
- [ ] Ensure simulated mode never calls hardware discovery/open/read and real mode never constructs simulated adapters.
- [ ] Run probe, live-offline, camera, real-camera-run, and multi-region service tests.
- [ ] Commit with `feat(runtime): enforce source-specific acquisition`.

### Task 4: Manifest, export, import, and historical provenance

**Files:**
- Modify: `backend/src/yyt1771_g3/core/models.py`
- Modify: `backend/src/yyt1771_g3/services/live_offline_run_service.py`
- Modify: `backend/src/yyt1771_g3/services/real_camera_run_service.py`
- Modify: `backend/src/yyt1771_g3/services/analysis_service.py`
- Modify: `backend/src/yyt1771_g3/services/export_service.py`
- Modify: `backend/src/yyt1771_g3/services/import_service.py`
- Modify: `backend/tests/integration/test_export_service.py`
- Modify: `backend/tests/unit/test_import_service.py`
- Modify: `backend/tests/unit/test_analysis_service.py`

**Interfaces:**
- Produces: defaulted `runtime_source` and `product_mode` on run/analysis/import views and JSON artifacts.
- Consumes: runtime policy values captured at run creation and existing provenance inference.

- [ ] Write failing tests for real/sim manifests, `run_export.json`, `parameters.json`, analysis propagation, legacy inference, and imported simulated badges.
- [ ] Verify failures are missing fields or incorrect legacy inference.
- [ ] Add compatibility fields and propagate them without changing multi-region export structures.
- [ ] Normalize new `operator_data_source` to `real_hardware` or `simulated_material` while keeping old values readable.
- [ ] Run model, analysis, export, import, and multi-region export tests.
- [ ] Commit with `feat(export): preserve runtime source provenance`.

### Task 5: Runtime API client and fixed Operator entry

**Files:**
- Modify: `frontend/src/api.ts`
- Modify: `frontend/src/apiTypes.ts`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/uiMode.ts`
- Modify: `frontend/tests/apiClientUrls.test.mjs`
- Modify: `frontend/tests/operatorActualUseUi.test.mjs`

**Interfaces:**
- Produces: `AppRuntime`, `getAppRuntime()`, and one immutable Operator application entry.
- Consumes: `/api/app/runtime` and `/api/operator/source-status`.

- [ ] Add failing static/behavior tests proving there is no mode switch render, query/local-storage mode selection, or Engineering branch in the root render, and proving the runtime API client URL.
- [ ] Run the targeted Node tests and confirm expected failures.
- [ ] Remove mutable UI-mode initialization/persistence and render Operator navigation/workspace unconditionally; keep dormant engineering components unmounted.
- [ ] Load app runtime before acquisition actions and derive Operator source from it rather than local storage or source controls.
- [ ] Run targeted frontend tests and TypeScript build.
- [ ] Commit with `feat(product): lock the actual-use workflow`.

### Task 6: Runtime-aware Operator controls and multi-ROI workflow

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/i18n.ts`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/apiTypes.ts`
- Modify: `frontend/tests/operatorActualUseUi.test.mjs`
- Modify: `frontend/tests/operatorProbeUi.test.mjs`
- Modify: `frontend/tests/operatorMeasurementRegions.test.mjs`
- Modify: `frontend/tests/operatorRegionResults.test.mjs`
- Modify: `frontend/tests/hardwareSetupWizard.test.mjs`

**Interfaces:**
- Produces: real/sim badges, warning/guard copy, simulated start label, source-selected probe/run, and conditional Device setup.
- Consumes: `AppRuntime`, extended source status, and existing one-to-six-region state/results.

- [ ] Add failing tests for real hardware labels/guard, simulated warning/start label, no source selector, no advanced controls, Device setup visibility, and one-to-six positions in both sources.
- [ ] Verify failures are missing runtime-aware UI behavior.
- [ ] Replace source chooser with a read-only badge; route simulated runtime to existing dataset-backed probe/run using the startup dataset ID and route real runtime to hardware probe/run.
- [ ] Disable Probe/Start on real unavailability or configuration error; keep Device setup available only for real runtime.
- [ ] Preserve exactly the contrast and maximum-jump detector controls and all multi-region controls/results.
- [ ] Run the focused frontend suite and `npm run build`.
- [ ] Commit with `feat(operator): render startup-selected source workflow`.

### Task 7: Product startup scripts

**Files:**
- Create: `scripts/g3_start.sh`
- Modify: `scripts/g3_fast_start.sh`
- Create: `scripts/windows/start_operator.ps1`
- Create: `scripts/tests/test_g3_start.sh`

**Interfaces:**
- Produces: `scripts/g3_start.sh real|sim` and Windows `-Source real|sim`.
- Consumes: existing fast-start process/health-check behavior and hardware profile files.

- [ ] Write a failing shell test using a dry-run mode to assert selected environment variables, profile, dataset, argument precedence, and invalid-source usage.
- [ ] Run the shell test and confirm failure because the wrapper/dry-run contract is absent.
- [ ] Implement source normalization, environment export, dry-run output, command-line precedence, and delegation to `g3_fast_start.sh`.
- [ ] Add the PowerShell wrapper with the same source rules and production-friendly defaults.
- [ ] Run shell tests, `bash -n` on both shell scripts, and PowerShell syntax checks when `pwsh` is available.
- [ ] Commit with `feat(startup): select runtime source from command line`.

### Task 8: Documentation and problem tracking

**Files:**
- Modify: `README_使用说明.md`
- Modify: `docs/production_setup.md`
- Create: `docs/windows_setup.md`
- Modify: `docs/architecture/G3_技术架构草案_v0.1.md`
- Modify: `docs/data/G3_数据结构与manifest草案_v0.1.md`
- Modify: `problem.md`

**Interfaces:**
- Produces: exact real/sim/production commands and traceable retest record.

- [ ] Document `scripts/g3_start.sh sim`, `scripts/g3_start.sh real`, production environment defaults, Windows delivery defaults, no UI source switch, and no fallback semantics.
- [ ] Update architecture/data docs with runtime policy and export fields.
- [ ] Register the product-workflow issue/retest item in `problem.md` as `IN_PROGRESS` before browser testing.
- [ ] Search docs for obsolete claims that normal users can select Engineering or offline/real sources and correct only affected product-facing sections.
- [ ] Run link/path/search consistency checks.
- [ ] Commit with `docs: describe startup-selected operator runtime`.

### Task 9: Full verification, browser retest, review, and PR

**Files:**
- Modify: `problem.md`
- Create evidence under the repository's existing browser-retest artifact location.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified branch and GitHub PR.

- [ ] Run backend unit/integration tests, frontend tests/build, shell tests, and `git diff --check`; record exact outcomes.
- [ ] Start simulated mode with `golden_a_20260522_dev_lab`, drive the real browser through Operator load, three ROIs, Probe, run, curves, export, and import, and save screenshot/log/export evidence.
- [ ] Start real mode without fallback; when hardware is unavailable, verify the guard, disabled Probe/Start, Device setup entry, and absence of simulated imagery.
- [ ] Update `problem.md` to `RESOLVED_BROWSER_VERIFIED` only for browser-verified assertions; leave physical-device-only coverage `FIXED_PENDING_BROWSER_RETEST` when hardware is absent.
- [ ] Re-run affected tests after the problem/evidence update and inspect the final diff against `codex/configurable-multi-position-roi`.
- [ ] Commit final evidence, push `codex/lock-runtime-source-startup`, and open a PR titled `feat(product): lock actual-use workflow and select runtime source at startup` with test and retest details.
