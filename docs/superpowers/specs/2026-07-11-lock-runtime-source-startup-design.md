# Lock Actual-Use Workflow and Select Runtime Source at Startup Design

**Date:** 2026-07-11

**Target branch:** `codex/configurable-multi-position-roi`

**Feature branch:** `codex/lock-runtime-source-startup`

**Planned PR title:** `feat(product): lock actual-use workflow and select runtime source at startup`

## 1. Goal

Turn the normal G3 application into one production-shaped Operator workflow whose acquisition source is selected before the backend starts. The browser must never switch between Engineering and Operator interfaces or between real hardware and simulated material. The backend must enforce the selected source, preserve the existing detector and AFAS mathematics, and make the source traceable through runs, exports, and historical imports.

This change preserves configurable one-to-six-position ROI measurements, multi-position curves and exports, the first-run hardware binding wizard, the fixed `contrast_widest_span` Operator detector policy, and all legacy internal detector fields needed for compatibility.

## 2. Chosen Architecture

Use one immutable backend `RuntimePolicy` as the authority for runtime-source and product-mode decisions.

```text
process environment + selected hardware profile
                    |
                    v
             RuntimePolicy
        parse -> normalize -> validate
                    |
      +-------------+-------------+
      |             |             |
      v             v             v
 app/runtime   source-status   API/service guards
      |                           |
      v                           v
 Operator UI                probe/run/export
```

The policy is loaded and validated during application startup. Request handlers, camera and temperature factories, source-status reporting, run creation, and export metadata consume this same policy rather than independently inferring intent from UI fields.

The frontend always renders the existing Operator application shell. Engineering components and compatibility code may remain in the repository, but no main navigation, URL query parameter, local-storage value, or visible control can activate them.

## 3. Runtime Policy

### 3.1 Environment contract

The backend recognizes:

```text
YYT1771_G3_RUNTIME_SOURCE=real_hardware|simulated_material
YYT1771_G3_PRODUCT_MODE=production|development
YYT1771_G3_SIMULATED_DATASET_ID=<registered dataset id>
YYT1771_G3_HARDWARE_CONFIG=<YAML profile path>
```

Defaults for legacy starts are deliberately safe:

- `runtime_source` defaults to `real_hardware`.
- `product_mode` defaults to `development` so existing development commands continue to start, while still selecting real hardware unless simulation is explicit.
- `simulated_dataset_id` defaults to `golden_a_20260522_dev_lab` only when `runtime_source=simulated_material`; it is ignored in real-hardware mode.
- Unknown or empty explicit enum values fail startup with a descriptive configuration error.

`RuntimePolicy` exposes:

```python
RuntimeSource = Literal["real_hardware", "simulated_material"]
ProductMode = Literal["production", "development"]

class RuntimePolicy:
    runtime_source: RuntimeSource
    product_mode: ProductMode
    simulated_dataset_id: str
    simulation_enabled: bool
    simulation_allowed: bool
    production_mode: bool
```

`simulation_allowed` is false in production and true in development. `simulation_enabled` describes the active source and is true only for `simulated_material`.

### 3.2 Startup validation

Startup validation applies these rules before the app accepts requests:

1. `production + simulated_material` is rejected.
2. `real_hardware` rejects a simulated dataset camera backend.
3. `real_hardware` rejects `simulated_temperature`.
4. `simulated_material` requires a simulated dataset camera backend and `simulated_temperature`.
5. `simulated_material` requires a non-empty registered dataset ID. Missing or inaccessible datasets produce a traceable startup error rather than connecting to hardware.
6. No mode falls back to the opposite source after a connection or configuration failure.

Startup logs print:

```text
Runtime source: real_hardware
Product mode: production
Simulation allowed: false
```

The same values are printed for development and simulated starts with their actual normalized values.

### 3.3 Source-specific adapters

In `real_hardware` mode, preview, probe, live run, temperature reads, and temperature control use only the configured Hik/real camera and LU92XX/real temperature adapters. Device absence is an availability failure, not a reason to instantiate simulated adapters.

In `simulated_material` mode, the backend uses the configured simulated dataset camera with the startup-selected dataset ID and the simulated temperature controller. It does not enumerate, open, or poll real hardware. The normal real-camera-shaped Operator endpoints may remain the public workflow, but their adapters are selected by `RuntimePolicy` rather than by browser-submitted source fields.

## 4. Runtime and Source-Status APIs

Add:

```http
GET /api/app/runtime
```

Real-hardware response:

```json
{
  "runtime_source": "real_hardware",
  "display_label_zh": "真实相机 + 真实温控",
  "display_label_en": "Real camera + real temperature controller",
  "simulation_enabled": false,
  "simulation_allowed": false,
  "product_mode": "production",
  "production_mode": true,
  "simulated_dataset_id": ""
}
```

Simulated-material response:

```json
{
  "runtime_source": "simulated_material",
  "display_label_zh": "模拟素材调试",
  "display_label_en": "Simulated material debug",
  "simulation_enabled": true,
  "simulation_allowed": true,
  "product_mode": "development",
  "production_mode": false,
  "simulated_dataset_id": "golden_a_20260522_dev_lab"
}
```

Extend `/api/operator/source-status` without removing existing fields. It returns:

```text
runtime_source
product_mode
real_hardware_available
real_camera_available
real_temperature_available
camera_is_simulated
temperature_is_simulated
configuration_valid
configuration_error_zh
configuration_error_en
```

Availability means the adapters required by the selected runtime source are ready. In real-hardware mode, either simulated flag makes `configuration_valid=false`, `real_hardware_available=false`, and produces the required bilingual configuration-error text. Hardware connection failures report the unavailable component separately.

## 5. API and Service Guards

The browser cannot override runtime policy through request payloads.

- Real-hardware mode rejects offline-dataset probe/run endpoints used by the normal Operator workflow.
- Simulated-material mode rejects real-hardware preview/probe/run and hardware-control operations.
- Existing Engineering/offline endpoints may remain for developer compatibility, but production starts do not advertise them and the runtime guard prevents cross-source acquisition.
- Device discovery and binding endpoints are enabled only in real-hardware mode.
- Probe and run validate source readiness before acquiring a frame. Unavailable real hardware returns a stable typed response suitable for disabling the UI; it never returns a simulated frame.

The frontend submits only measurement, temperature program, and Operator-visible detector values. Source, object class, and detector mode are normalized server-side to the startup-selected source and fixed Operator policy.

## 6. Operator-Only Frontend

### 6.1 Remove mode selection

The normal entry point:

- initializes the application as Operator without a mutable `uiMode` state;
- does not render the Actual-use/Engineering switch;
- ignores `?mode=engineering` and all other UI-mode query parameters;
- neither reads nor writes the legacy UI-mode local-storage key;
- does not render Engineering navigation or panels.

Engineering components can remain unreferenced to minimize this PR and preserve possible development recovery.

### 6.2 Runtime-aware Operator shell

The frontend fetches `/api/app/runtime` before enabling acquisition actions and fetches `/api/operator/source-status` for live availability.

Both sources render the same one-to-six-position Operator workflow:

1. source/device badge;
2. measurement-position and ROI editor;
3. contrast threshold;
4. maximum allowed jump;
5. probe current frame;
6. temperature setup;
7. start/stop run;
8. live multi-position curves;
9. results and export;
10. device setup when applicable.

The Operator UI fixes:

```text
detector_mode = contrast_widest_span
distance_outlier_filter_enabled = true
```

It continues to expose only `contrast_threshold` and `distance_outlier_max_jump_px`. A/C class, detector selection, offline dataset selection, camera and temperature engineering fields, baseline/reference/recovery controls, contour and support-column parameters, template settings, and debug JSON are absent from the rendered Operator tree.

### 6.3 Real-hardware behavior

The badge reads `真实相机 + 真实温控` / `Real camera + real temperature controller`.

If the real camera, real temperature controller, or both are unavailable:

- show `真实硬件不可用` / `Real hardware unavailable` with component detail;
- disable Probe current frame and Start live test;
- keep Device setup visible and enabled;
- show no simulated image, dataset selector, or simulation action.

If the hardware profile is simulated despite `runtime_source=real_hardware`, show the required bilingual configuration error and keep acquisition disabled.

### 6.4 Simulated-material behavior

The badge reads `模拟素材调试` / `Simulated material debug`. A prominent notice reads:

```text
当前为模拟素材调试模式，不代表真实测试数据。
Simulated material debug mode is active. This is not real test data.
```

The start button reads `开始模拟测试` / `Start simulated test`. Probe, one-to-six positions, ROI editing, live run, curves, results, exports, and historical import otherwise behave like the real workflow. Device setup is hidden or replaced by the read-only statement `模拟素材模式不需要绑定真实设备。` / `Simulated material mode does not require real-device binding.`

## 7. Multi-Position Acquisition Invariants

This PR does not change the established multi-position service model:

```text
one frame acquisition
one temperature read
N enabled ROI detections (1 <= N <= 6)
N independent temporal/outlier states
N live curves
N AFAS results
one multi-position export bundle
```

The same invariant applies to both runtime sources. Simulated material provides one dataset frame and one simulated temperature value per frame event; real hardware provides one physical frame and one physical temperature value per frame event.

## 8. Run, Export, and Import Provenance

Add defaulted compatibility fields to run and analysis models:

```python
runtime_source: str = ""
product_mode: str = ""
```

New runs always fill both fields from `RuntimePolicy`. `operator_data_source` for new runs is normalized to `real_hardware` or `simulated_material`; legacy values such as `real_camera` and `offline_dataset` remain readable.

For simulated material:

```text
runtime_source = simulated_material
operator_data_source = simulated_material
provenance.overall_kind = simulated or offline
```

For real hardware:

```text
runtime_source = real_hardware
operator_data_source = real_hardware
provenance.overall_kind = real_hardware
camera_is_simulated = false
temperature_is_simulated = false
```

`run_manifest`, `analysis_result`, top-level `run_export.json`, and `parameters.json` include `runtime_source` and `product_mode`. The existing multi-position files and shapes remain unchanged.

Import precedence is:

1. explicit top-level `runtime_source`;
2. run-manifest `runtime_source`;
3. parameters `runtime_source`;
4. infer from legacy `operator_data_source` and provenance;
5. unknown for genuinely ambiguous legacy material.

Imported simulated/offline data displays the simulation/offline source badge and can never be presented as a real test. Imported provenance continues to retain `imported_from_provenance`.

## 9. Launch Commands

Add `scripts/g3_start.sh` as the stable operator entry point:

```bash
scripts/g3_start.sh real
scripts/g3_start.sh sim
```

The positional source argument has priority over inherited `YYT1771_G3_RUNTIME_SOURCE` and selects the matching profile:

- `real` sets `YYT1771_G3_RUNTIME_SOURCE=real_hardware` and defaults to `configs/local/realcamera_temp.local.yaml`.
- `sim` sets `YYT1771_G3_RUNTIME_SOURCE=simulated_material`, defaults `YYT1771_G3_SIMULATED_DATASET_ID=golden_a_20260522_dev_lab`, and selects the repository's simulated camera plus simulated-temperature profile.

Explicit compatible `YYT1771_G3_HARDWARE_CONFIG` and simulated dataset values remain overrideable for deployment. Unknown or missing source arguments print usage and exit non-zero. The script delegates common process reuse, health checks, port handling, and browser opening to the established fast-start implementation where practical.

If a Windows operator startup script already exists, add `-Source real|sim` with the same precedence. Otherwise add a focused `scripts/windows/start_operator.ps1` wrapper rather than duplicating backend/frontend process logic throughout documentation.

The existing `g3_fast_start.sh` modes remain compatible during transition, but documentation promotes `g3_start.sh` as the product-facing command.

## 10. Documentation

Update:

- `README_使用说明.md` with development simulation and real-hardware commands;
- `docs/production_setup.md` with production environment and no-fallback behavior;
- `docs/windows_setup.md` if present, or create the corresponding Windows delivery section/document;
- script help/README content where present;
- architecture and data-model docs where runtime policy and provenance are authoritative.

Windows delivery defaults to `real_hardware + production`, exposes no Engineering or simulation entry, and uses a dedicated simulation command only for demonstrations.

## 11. Testing Strategy

### 11.1 Backend

Tests cover:

- environment parsing, safe defaults, invalid enum values, and command-selected values;
- production rejecting simulated material;
- real hardware rejecting simulated camera or temperature backends;
- simulated material requiring simulated adapters and a registered dataset;
- `/api/app/runtime` response shape;
- source-status runtime and availability fields;
- no real-to-simulated or simulated-to-real fallback;
- manifest, analysis, JSON export, parameters export, and import source fields;
- one-to-six-position runs preserving one frame and temperature sample per event.

### 11.2 Frontend

Tests prove:

- no mode switch or Engineering navigation is rendered;
- `?mode=engineering` cannot change the UI;
- a legacy local-storage UI mode cannot change the UI;
- real and simulated runtime payloads render the correct badge and actions;
- unavailable or misconfigured real hardware disables Probe and Start but leaves Device setup available;
- simulated material shows the warning and simulated start label without a device-binding workflow;
- only the two Operator detector controls and the required actual-use workflow controls are present;
- A/C, detector mode, offline datasets, engineering fields, and advanced parameters are absent;
- one-to-six-position controls and result curves render in both runtime sources;
- imported simulated results retain a non-real source badge.

### 11.3 Scripts and browser retest

Shell tests cover `real`, `sim`, argument precedence, inherited environment behavior, and invalid arguments. PowerShell syntax and parameter behavior are tested when PowerShell is available; otherwise static assertions cover the wrapper.

The required real-browser test uses `golden_a_20260522_dev_lab` through `scripts/g3_start.sh sim` and exercises Operator load, three positions, Probe, simulated live run, multi-curve result, export, and import. It captures screenshot/log/export evidence and updates `problem.md`.

Real-hardware mode is browser-tested to the furthest safe state available. Without connected hardware it must show the real-hardware unavailable guard, disable acquisition, keep Device setup available, and show no simulated frame. It remains `FIXED_PENDING_BROWSER_RETEST` for connected-hardware-only assertions until physical devices are available.

## 12. Non-Goals and Compatibility Boundaries

This PR does not:

- change envelope detection algorithms or their internal parameter models;
- change contrast-widest-span mathematics or outlier-filter mathematics;
- change AFAS preprocessing or AFAS calculations;
- change ROI coordinate semantics;
- change the one-frame/one-temperature multi-position acquisition contract;
- delete Engineering implementation code solely for cleanup;
- remove legacy run, export, import, or detector fields;
- add a browser control that changes runtime source;
- treat successful API or unit tests as a substitute for the required browser retest.

## 13. Acceptance Criteria

The feature is complete when:

1. the normal browser UI always renders the actual-use Operator workflow;
2. URL and local-storage state cannot activate Engineering mode;
3. startup configuration is the only runtime-source selector;
4. real-hardware mode cannot instantiate or fall back to simulated adapters;
5. production rejects simulated-material startup;
6. simulated material runs the same multi-position Operator workflow with an unmistakable non-real warning;
7. only contrast threshold and maximum allowed jump are exposed as detector parameters;
8. real and simulated runs and imports remain distinguishable in manifests, exports, and badges;
9. device setup is available only for real hardware;
10. backend, frontend, script, and browser tests pass to the extent allowed by connected hardware;
11. `problem.md` contains the required browser evidence and honest status for any hardware-blocked assertion;
12. the branch is pushed and a new PR is opened against the latest configured multi-position feature branch or its merged successor.
