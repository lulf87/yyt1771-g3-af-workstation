# AFAS Interaction Bounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every low/high baseline range drag and maximum-slope tangent drag numerically and visually inside the authoritative AFAS data domain, and prevent invalid previews from overwriting the last valid saved analysis.

**Architecture:** Derive one formal data domain from the existing smoothed → repaired → grouped fallback and expose its full and zoom-intersected forms on the chart model. Pure interaction helpers clamp pointer coordinates, sampled ranges, tangent intercepts, and tangent endpoints; the backend independently validates every manual preview/save against the full formal domain, while the chart persists only the last preview accepted by that backend.

**Tech Stack:** React 18 + TypeScript SVG, existing AFAS curve model, FastAPI/Pydantic, NumPy/Python services, Node test runner, pytest, Playwright/real Chromium.

---

## File map

- `frontend/src/afasInteraction.ts`: pure plot/data clamping, sampled-range behavior, tangent rectangle intersection, translation, and endpoint rotation.
- `frontend/src/curves.ts`: authoritative full/visible AFAS domains on `AnalysisAfasModel`.
- `frontend/src/main.tsx`: clamped pointer conversion, valid-preview state machine, tangent handles, and SVG clip groups.
- `frontend/src/styles.css`: keep hit targets usable without drawing outside the plot.
- `backend/src/yyt1771_g3/services/afas_adjustment_validation.py`: shared manual-adjustment validator.
- `backend/src/yyt1771_g3/services/afas_analysis.py`: route every manual result through that validator without changing automatic AFAS math.
- `backend/src/yyt1771_g3/services/analysis_service.py`: continue using the same validated analysis path for preview and persistence.
- Targeted tests and `problem.md` changes are named in each task.

### Task 1: Define the authoritative chart domain and pure interaction constraints

**Files:**
- Modify: `frontend/src/afasInteraction.ts`
- Modify: `frontend/src/curves.ts`
- Modify: `frontend/tests/afasInteraction.test.mjs`
- Modify: `frontend/tests/curveSpecs.test.mjs`

- [ ] **Step 1: Write failing domain and pointer-clamp tests**

Add tests proving the full domain comes only from formal points, zoom takes an intersection, and pointer coordinates are clamped to the plot before conversion:

```javascript
test("analysis AFAS model exposes formal full and zoom-intersected domains", async () => {
  const { buildAnalysisAfasModel } = await loadCurveModule();
  const analysis = sampleAnalysisWithTangentOverlay();
  analysis.afas_preprocessing.smoothed_temperature_points = [
    { temperature_celsius: 20, distance_px: 100, representative_frame_index: 1 },
    { temperature_celsius: 30, distance_px: 120, representative_frame_index: 2 },
    { temperature_celsius: 40, distance_px: 150, representative_frame_index: 3 },
    { temperature_celsius: 48, distance_px: 160, representative_frame_index: 4 }
  ];
  analysis.temperature_distance.push({ x: -999, y: 9999, frame_index: 999 });

  const full = buildAnalysisAfasModel(analysis, { width: 980, height: 540 });
  const zoomed = buildAnalysisAfasModel(analysis, { width: 980, height: 540, xDomain: [22, 44] });

  assert.deepEqual(full.dataDomain.availableTemperatures, [20, 30, 40, 48]);
  assert.equal(full.dataDomain.temperatureMin, 20);
  assert.equal(full.dataDomain.temperatureMax, 48);
  assert.equal(zoomed.interactionDomain.temperatureMin, 22);
  assert.equal(zoomed.interactionDomain.temperatureMax, 44);
  assert.deepEqual(zoomed.interactionDomain.availableTemperatures, [30, 40]);
});


test("AFAS plot and data points clamp on all four sides", async () => {
  const { clampAfasDataPoint, clampAfasPlotPoint } = await loadInteractionModule();
  const plot = { left: 80, right: 860, top: 40, bottom: 460 };
  const domain = {
    temperatureMin: 20,
    temperatureMax: 50,
    distanceMin: 100,
    distanceMax: 160,
    availableTemperatures: [20, 30, 40, 50]
  };
  assert.deepEqual(clampAfasPlotPoint({ x: -50, y: 900 }, plot), { x: 80, y: 460 });
  assert.deepEqual(clampAfasPlotPoint({ x: 999, y: -20 }, plot), { x: 860, y: 40 });
  assert.deepEqual(
    clampAfasDataPoint({ temperature: 10, distance: 200 }, domain),
    { temperature: 20, distance: 160 }
  );
});
```

- [ ] **Step 2: Write failing tangent constraint tests**

Replace the unconstrained tangent test with explicit domain tests for line translation, both slope handles, finite values, and rectangle intersection:

```javascript
test("AFAS tangent translation is clamped to the formal data rectangle", async () => {
  const { tangentIntersectsDomain, translateAfasTangent } = await loadInteractionModule();
  const domain = {
    temperatureMin: 20, temperatureMax: 50,
    distanceMin: 100, distanceMax: 160,
    availableTemperatures: [20, 30, 40, 50]
  };
  const translated = translateAfasTangent(2, 40, { temperature: 30, distance: 100 }, { temperature: 30, distance: 500 }, domain);
  assert.equal(tangentIntersectsDomain(translated.slope, translated.intercept, domain), true);
  assert.equal(translated.intercept, 100);
});


test("both AFAS tangent endpoint drags stay finite and inside the domain", async () => {
  const { clampTangentControlPoints, rotateAfasTangent } = await loadInteractionModule();
  const domain = {
    temperatureMin: 20, temperatureMax: 50,
    distanceMin: 100, distanceMax: 160,
    availableTemperatures: [20, 30, 40, 50]
  };
  const startAnchor = { temperature: 50, distance: 160 };
  const fromLeft = rotateAfasTangent(startAnchor, { temperature: -10, distance: 400 }, 2, domain, 0.1);
  const fromRight = rotateAfasTangent({ temperature: 20, distance: 100 }, { temperature: 90, distance: -50 }, 2, domain, 0.1);
  assert.ok(Number.isFinite(fromLeft.slope) && Number.isFinite(fromLeft.intercept));
  assert.ok(Number.isFinite(fromRight.slope) && Number.isFinite(fromRight.intercept));
  assert.equal(clampTangentControlPoints(fromLeft.slope, fromLeft.intercept, domain).length, 2);
  assert.equal(clampTangentControlPoints(fromRight.slope, fromRight.intercept, domain).length, 2);
});
```

- [ ] **Step 3: Run targeted frontend tests and verify RED**

Run:

```bash
cd frontend && node --test tests/afasInteraction.test.mjs tests/curveSpecs.test.mjs
```

Expected: FAIL because `dataDomain`, `interactionDomain`, pointer clamps, and constrained tangent signatures do not exist.

- [ ] **Step 4: Add shared interaction domain types and clamps**

Add these exact exported types and helpers to `afasInteraction.ts`:

```typescript
export type AfasDataDomain = {
  temperatureMin: number;
  temperatureMax: number;
  distanceMin: number;
  distanceMax: number;
  availableTemperatures: number[];
};

export type AfasPlotBounds = { left: number; right: number; top: number; bottom: number };
export type AfasPlotPoint = { x: number; y: number };

export function clampAfasPlotPoint(point: AfasPlotPoint, plot: AfasPlotBounds): AfasPlotPoint {
  return {
    x: Math.max(plot.left, Math.min(plot.right, point.x)),
    y: Math.max(plot.top, Math.min(plot.bottom, point.y))
  };
}

export function clampAfasDataPoint(point: AfasDataPoint, domain: AfasDataDomain): AfasDataPoint {
  return {
    temperature: Math.max(domain.temperatureMin, Math.min(domain.temperatureMax, point.temperature)),
    distance: Math.max(domain.distanceMin, Math.min(domain.distanceMax, point.distance))
  };
}
```

Keep `resizeAfasRange()` and `moveAfasRange()` sample-index based; they already preserve at least two points and range width when passed the correct `availableTemperatures`.

- [ ] **Step 5: Implement line-rectangle constraints**

Change both tangent functions to require `AfasDataDomain`. Clamp translation using analytically derived intercept bounds and clamp rotation pointer coordinates before slope calculation:

```typescript
export function tangentInterceptBounds(slope: number, domain: AfasDataDomain): [number, number] {
  const endpointProducts = [slope * domain.temperatureMin, slope * domain.temperatureMax];
  return [
    domain.distanceMin - Math.max(...endpointProducts),
    domain.distanceMax - Math.min(...endpointProducts)
  ];
}

export function translateAfasTangent(
  slope: number,
  intercept: number,
  start: AfasDataPoint,
  current: AfasDataPoint,
  domain: AfasDataDomain
): { slope: number; intercept: number } {
  const boundedCurrent = clampAfasDataPoint(current, domain);
  const candidate = intercept + (boundedCurrent.distance - start.distance) - slope * (boundedCurrent.temperature - start.temperature);
  const [minimum, maximum] = tangentInterceptBounds(slope, domain);
  return { slope, intercept: Math.max(minimum, Math.min(maximum, candidate)) };
}

export function rotateAfasTangent(
  anchor: AfasDataPoint,
  pointer: AfasDataPoint,
  fallbackSlope: number,
  domain: AfasDataDomain,
  minimumTemperatureDelta = 1e-6
): { slope: number; intercept: number } {
  const boundedAnchor = clampAfasDataPoint(anchor, domain);
  const boundedPointer = clampAfasDataPoint(pointer, domain);
  const delta = boundedPointer.temperature - boundedAnchor.temperature;
  const slope = Math.abs(delta) < minimumTemperatureDelta
    ? fallbackSlope
    : (boundedPointer.distance - boundedAnchor.distance) / delta;
  const finiteSlope = Number.isFinite(slope) ? slope : fallbackSlope;
  return { slope: finiteSlope, intercept: boundedAnchor.distance - finiteSlope * boundedAnchor.temperature };
}
```

Implement `clampTangentControlPoints()` by intersecting `y = slope*x + intercept` with all four domain edges, accepting finite in-range points, de-duplicating corner hits at `1e-9`, sorting by temperature/distance, and returning the two farthest points. `tangentIntersectsDomain()` returns whether at least one finite intersection exists.

```typescript
export function clampTangentControlPoints(
  slope: number,
  intercept: number,
  domain: AfasDataDomain
): AfasDataPoint[] {
  if (!Number.isFinite(slope) || !Number.isFinite(intercept)) return [];
  const candidates: AfasDataPoint[] = [];
  const add = (temperature: number, distance: number) => {
    if (!Number.isFinite(temperature) || !Number.isFinite(distance)) return;
    if (temperature < domain.temperatureMin - 1e-9 || temperature > domain.temperatureMax + 1e-9) return;
    if (distance < domain.distanceMin - 1e-9 || distance > domain.distanceMax + 1e-9) return;
    if (candidates.some((point) => Math.abs(point.temperature - temperature) <= 1e-9 && Math.abs(point.distance - distance) <= 1e-9)) return;
    candidates.push(clampAfasDataPoint({ temperature, distance }, domain));
  };
  add(domain.temperatureMin, slope * domain.temperatureMin + intercept);
  add(domain.temperatureMax, slope * domain.temperatureMax + intercept);
  if (Math.abs(slope) > 1e-12) {
    add((domain.distanceMin - intercept) / slope, domain.distanceMin);
    add((domain.distanceMax - intercept) / slope, domain.distanceMax);
  }
  if (candidates.length <= 2) return candidates;
  let farthest: [AfasDataPoint, AfasDataPoint] = [candidates[0], candidates[1]];
  let farthestSquared = -1;
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const dx = candidates[right].temperature - candidates[left].temperature;
      const dy = candidates[right].distance - candidates[left].distance;
      if (dx * dx + dy * dy > farthestSquared) {
        farthest = [candidates[left], candidates[right]];
        farthestSquared = dx * dx + dy * dy;
      }
    }
  }
  return farthest;
}

export function tangentIntersectsDomain(slope: number, intercept: number, domain: AfasDataDomain): boolean {
  return clampTangentControlPoints(slope, intercept, domain).length > 0;
}
```

- [ ] **Step 6: Add full and zoom-intersected domains to the chart model**

Import `formalCurvePoints` and `AfasDataDomain`. Build the full domain only from the formal series, never raw/outlier/overlay values:

```typescript
function buildAfasDataDomain(analysis: AnalysisCurveSource): AfasDataDomain | null {
  const points = formalCurvePoints(analysis.afas_preprocessing, analysis.temperature_distance)
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const availableTemperatures = [...new Set(points.map((point) => point.x))].sort((left, right) => left - right);
  if (availableTemperatures.length < 2 || points.length < 2) return null;
  return {
    temperatureMin: availableTemperatures[0],
    temperatureMax: availableTemperatures[availableTemperatures.length - 1],
    distanceMin: Math.min(...points.map((point) => point.y)),
    distanceMax: Math.max(...points.map((point) => point.y)),
    availableTemperatures
  };
}

function intersectAfasDomainWithXRange(
  domain: AfasDataDomain,
  xRange: { min: number; max: number }
): AfasDataDomain | null {
  const temperatureMin = Math.max(domain.temperatureMin, xRange.min);
  const temperatureMax = Math.min(domain.temperatureMax, xRange.max);
  if (temperatureMin > temperatureMax) return null;
  return {
    ...domain,
    temperatureMin,
    temperatureMax,
    availableTemperatures: domain.availableTemperatures.filter(
      (value) => value >= temperatureMin && value <= temperatureMax
    )
  };
}
```

Add `dataDomain: AfasDataDomain | null` and `interactionDomain: AfasDataDomain | null` to `AnalysisAfasModel`, and populate both after `xRange` is resolved.

- [ ] **Step 7: Run helper/model tests and verify GREEN**

Run:

```bash
cd frontend && node --test tests/afasInteraction.test.mjs tests/curveSpecs.test.mjs
```

Expected: all range, pointer, tangent, formal-domain, zoom, and existing chart-model tests PASS.

- [ ] **Step 8: Commit pure constraints**

```bash
git add frontend/src/afasInteraction.ts frontend/src/curves.ts \
  frontend/tests/afasInteraction.test.mjs frontend/tests/curveSpecs.test.mjs
git commit -m "fix(afas): constrain interactions to formal data"
```

### Task 2: Reject invalid manual AFAS candidates in both backend paths

**Files:**
- Create: `backend/src/yyt1771_g3/services/afas_adjustment_validation.py`
- Create: `backend/tests/unit/test_afas_adjustment_validation.py`
- Modify: `backend/src/yyt1771_g3/services/afas_analysis.py`
- Modify: `backend/tests/integration/test_analysis_api.py`

- [ ] **Step 1: Write failing validator unit tests**

Build a preprocessing mapping with formal temperatures `20..50` and values `100..160`. Assert valid input passes, then parameterize range, tangent, intersection, AS/AF-domain, and ordering failures:

```python
@pytest.mark.parametrize(
    ("overrides", "result_patch", "message"),
    [
        ({"low_range_celsius": [19.0, 24.0]}, {}, "low-temperature range"),
        ({"high_range_celsius": [48.0, 51.0]}, {}, "high-temperature range"),
        ({"low_range_celsius": [20.0, 20.1]}, {}, "at least two formal points"),
        ({"tangent_slope_override": float("nan"), "tangent_intercept_override": 1.0}, {}, "finite"),
        ({"tangent_slope_override": 1.0, "tangent_intercept_override": 1000.0}, {}, "data rectangle"),
        ({"tangent_slope_override": 2.0, "tangent_intercept_override": 40.0}, {"As": 19.0}, "AS"),
        ({"tangent_slope_override": 2.0, "tangent_intercept_override": 40.0}, {"As": 42.0, "Af_tan": 40.0}, "AS < AF"),
    ],
)
def test_validate_manual_afas_adjustment_rejects_invalid_candidates(overrides, result_patch, message) -> None:  # noqa: ANN001
    preprocessing, analysis = valid_adjustment_fixture()
    analysis["result"].update(result_patch)
    with pytest.raises(AfasAdjustmentValidationError, match=message):
        validate_manual_afas_adjustment(preprocessing, overrides, analysis)
```

Define the fixture in the same test file so every referenced field is explicit:

```python
def valid_adjustment_fixture() -> tuple[dict[str, Any], dict[str, Any]]:
    points = [
        {"temperature_celsius": 20.0, "distance_px": 100.0},
        {"temperature_celsius": 22.0, "distance_px": 104.0},
        {"temperature_celsius": 24.0, "distance_px": 108.0},
        {"temperature_celsius": 40.0, "distance_px": 140.0},
        {"temperature_celsius": 45.0, "distance_px": 150.0},
        {"temperature_celsius": 50.0, "distance_px": 160.0},
    ]
    preprocessing = {"smoothed_temperature_points": points}
    analysis = {
        "parameters": {
            "resolved_low_range_celsius": [20.0, 24.0],
            "resolved_high_range_celsius": [45.0, 50.0],
        },
        "fit": {"tangent": {"slope": 2.0, "intercept": 40.0}},
        "result": {"As": 25.0, "Af_tan": 47.0},
    }
    return preprocessing, analysis
```

Also test fallback order by removing `smoothed_temperature_points`, then repaired, and confirming repaired/grouped data becomes authoritative.

- [ ] **Step 2: Run validator tests and verify RED**

Run:

```bash
PYTHONPATH=backend/src pytest -q backend/tests/unit/test_afas_adjustment_validation.py
```

Expected: collection FAIL because `afas_adjustment_validation.py` does not exist.

- [ ] **Step 3: Implement formal-series extraction and validation**

Create a `ValueError` subclass and a single public validator. Extract point-object arrays in `smoothed_temperature_points`, `repaired_temperature_points`, `grouped_temperature_points` order; if absent, read `smoothed`, `outlier_repair`, `grouped` parallel arrays in that order. Reject non-increasing or non-finite formal data:

```python
class AfasAdjustmentValidationError(ValueError):
    pass


def validate_manual_afas_adjustment(
    preprocessing: Mapping[str, Any],
    overrides: Mapping[str, Any] | None,
    analysis: Mapping[str, Any],
) -> None:
    if not _has_manual_overrides(overrides):
        return
    temperatures, values = _formal_series(preprocessing)
    if len(temperatures) < 2:
        raise AfasAdjustmentValidationError("Manual AFAS adjustment requires at least two formal points.")
    temperature_min, temperature_max = min(temperatures), max(temperatures)
    distance_min, distance_max = min(values), max(values)
    parameters = _mapping(analysis.get("parameters"))
    override_values = overrides or {}
    low_range = override_values.get("low_range_celsius") or parameters.get("resolved_low_range_celsius")
    high_range = override_values.get("high_range_celsius") or parameters.get("resolved_high_range_celsius")
    _validate_range("low-temperature", low_range, temperatures)
    _validate_range("high-temperature", high_range, temperatures)

    tangent = _mapping(_mapping(analysis.get("fit")).get("tangent"))
    slope_value = override_values.get("tangent_slope_override")
    intercept_value = override_values.get("tangent_intercept_override")
    slope = _finite_number(slope_value if slope_value is not None else tangent.get("slope"), "Tangent slope must be finite.")
    intercept = _finite_number(
        intercept_value if intercept_value is not None else tangent.get("intercept"),
        "Tangent intercept must be finite.",
    )
    products = (slope * temperature_min, slope * temperature_max)
    line_min = min(products) + intercept
    line_max = max(products) + intercept
    if line_max < distance_min or line_min > distance_max:
        raise AfasAdjustmentValidationError("Tangent must intersect the formal data rectangle.")

    result = _mapping(analysis.get("result"))
    as_value = _finite_number(result.get("As"), "AS must be finite.")
    af_value = _finite_number(result.get("Af_tan"), "AF must be finite.")
    if not temperature_min <= as_value <= temperature_max:
        raise AfasAdjustmentValidationError("AS must remain inside the formal temperature domain.")
    if not temperature_min <= af_value <= temperature_max:
        raise AfasAdjustmentValidationError("AF must remain inside the formal temperature domain.")
    if as_value >= af_value:
        raise AfasAdjustmentValidationError("Manual AFAS adjustment must satisfy AS < AF.")
```

Define every helper used by the validator in the same module:

```python
_MANUAL_OVERRIDE_KEYS = {
    "low_range_celsius",
    "high_range_celsius",
    "tangent_slope_override",
    "tangent_intercept_override",
}


def _has_manual_overrides(overrides: Mapping[str, Any] | None) -> bool:
    return bool(overrides) and any(overrides.get(key) is not None for key in _MANUAL_OVERRIDE_KEYS)


def _formal_series(preprocessing: Mapping[str, Any]) -> tuple[list[float], list[float]]:
    for key in ("smoothed_temperature_points", "repaired_temperature_points", "grouped_temperature_points"):
        records = preprocessing.get(key)
        if isinstance(records, list) and records:
            pairs = [
                (float(record["temperature_celsius"]), float(record["distance_px"]))
                for record in records
                if isinstance(record, Mapping)
                and _is_finite(record.get("temperature_celsius"))
                and _is_finite(record.get("distance_px"))
            ]
            if pairs:
                return _strict_formal_pairs(pairs)
    for key in ("smoothed", "outlier_repair", "grouped"):
        stage = _mapping(preprocessing.get(key))
        temperatures = stage.get("temperature_celsius")
        values = stage.get("values")
        if isinstance(temperatures, list) and isinstance(values, list) and temperatures and len(temperatures) == len(values):
            pairs = [
                (float(temperature), float(value))
                for temperature, value in zip(temperatures, values, strict=True)
                if _is_finite(temperature) and _is_finite(value)
            ]
            if pairs:
                return _strict_formal_pairs(pairs)
    return [], []


def _strict_formal_pairs(pairs: list[tuple[float, float]]) -> tuple[list[float], list[float]]:
    temperatures = [pair[0] for pair in pairs]
    if any(current <= previous for previous, current in zip(temperatures, temperatures[1:])):
        raise AfasAdjustmentValidationError("Formal AFAS temperatures must be strictly increasing.")
    return temperatures, [pair[1] for pair in pairs]


def _validate_range(label: str, value: Any, temperatures: list[float]) -> None:
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise AfasAdjustmentValidationError(f"The {label} range requires two finite endpoints.")
    start = _finite_number(value[0], f"The {label} range requires finite endpoints.")
    end = _finite_number(value[1], f"The {label} range requires finite endpoints.")
    if start >= end or start < temperatures[0] or end > temperatures[-1]:
        raise AfasAdjustmentValidationError(f"The {label} range must remain inside the formal temperature domain.")
    if sum(start <= temperature <= end for temperature in temperatures) < 2:
        raise AfasAdjustmentValidationError(f"The {label} range must contain at least two formal points.")


def _finite_number(value: Any, message: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise AfasAdjustmentValidationError(message) from exc
    if not math.isfinite(parsed):
        raise AfasAdjustmentValidationError(message)
    return parsed


def _is_finite(value: Any) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}
```

`_validate_range()` must require two finite increasing endpoints inside `[temperature_min, temperature_max]` and count at least two formal temperatures inclusively.

- [ ] **Step 4: Route every manual analysis return through the validator**

In `afas_analysis.py`, add a finalizer and replace every return from `analyze_preprocessed_afas()`—including unavailable branches—with `return _finalize_afas_analysis(...)`. Automatic calls with no manual range/tangent override remain unchanged:

```python
def _finalize_afas_analysis(
    payload: dict[str, Any],
    preprocessing: Mapping[str, Any],
    parameter_overrides: Mapping[str, Any] | None,
) -> dict[str, Any]:
    validate_manual_afas_adjustment(preprocessing, parameter_overrides, payload)
    return payload
```

Treat non-`None` `low_range_celsius`, `high_range_celsius`, `tangent_slope_override`, or `tangent_intercept_override` as manual. `tangent_offset` alone is not an interactive geometry override and must preserve existing automatic behavior.

- [ ] **Step 5: Add API no-overwrite regression tests**

After creating and persisting a valid analysis, send one invalid preview and one invalid scoped save. Assert HTTP 422 and byte-identical saved JSON:

```python
stored_before = (run_store.run_dir(run_id) / "analysis_result.json").read_bytes()
invalid = {
    "region_id": "region_1",
    "afas_analysis_parameters": {
        "low_range_celsius": [10.0, 11.0],
        "high_range_celsius": [45.0, 50.0],
        "tangent_slope_override": 2.0,
        "tangent_intercept_override": 40.0,
    },
}
assert client.post(f"/api/runs/{run_id}/analysis/preview", json=invalid).status_code == 422
assert client.post(f"/api/runs/{run_id}/analysis", json=invalid).status_code == 422
assert (run_store.run_dir(run_id) / "analysis_result.json").read_bytes() == stored_before
```

Repeat the persistence assertion for a v2 `analysis_summary.json` fixture.

- [ ] **Step 6: Run backend AFAS tests and verify GREEN**

Run:

```bash
PYTHONPATH=backend/src pytest -q \
  backend/tests/unit/test_afas_adjustment_validation.py \
  backend/tests/integration/test_analysis_api.py
```

Expected: validator and API tests PASS; automatic analysis regressions remain unchanged.

- [ ] **Step 7: Commit backend validation**

```bash
git add backend/src/yyt1771_g3/services/afas_adjustment_validation.py \
  backend/src/yyt1771_g3/services/afas_analysis.py \
  backend/tests/unit/test_afas_adjustment_validation.py \
  backend/tests/integration/test_analysis_api.py
git commit -m "fix(afas): reject out-of-domain adjustments"
```

### Task 3: Clamp chart edits and persist only the last accepted preview

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/tests/operatorRegionResults.test.mjs`

- [ ] **Step 1: Write failing chart-state tests**

Add source-contract assertions for clamped pointer conversion, interaction-domain temperatures, accepted-preview separation, and pointer-up persistence:

```javascript
test("AFAS chart clamps edits and saves only backend-accepted parameters", () => {
  const source = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");
  const start = source.indexOf("function AnalysisAfasChart(");
  const end = source.indexOf("function AnalysisLayerToggle(", start);
  const block = source.slice(start, end);
  assert.match(block, /clampAfasPlotPoint/);
  assert.match(block, /model\.interactionDomain\.availableTemperatures/);
  assert.match(block, /candidateParametersRef/);
  assert.match(block, /acceptedParametersRef/);
  assert.match(block, /acceptedParametersRef\.current\s*=\s*parameters/);
  assert.match(block, /persistInteractiveAdjustment\(acceptedParameters/);
  assert.doesNotMatch(block, /persistInteractiveAdjustment\(candidateParameters/);
});
```

- [ ] **Step 2: Run the chart test and verify RED**

Run:

```bash
cd frontend && node --test tests/operatorRegionResults.test.mjs
```

Expected: FAIL because the chart still uses unbounded data conversion and `draftParametersRef`.

- [ ] **Step 3: Clamp pointer coordinates before data conversion**

Change the conversion helper to clamp in SVG space first, then inverse-scale, then clamp to the interaction data domain when requested:

```typescript
function analysisAfasChartDataPoint(
  point: { x: number; y: number },
  model: AnalysisAfasModel,
  constrainForEdit = false
): AfasDataPoint {
  const boundedPlotPoint = clampAfasPlotPoint(point, model.plot);
  const converted = {
    temperature: inverseScaleValue(
      boundedPlotPoint.x, model.plot.left, model.plot.right, model.xRange.min, model.xRange.max
    ),
    distance: inverseScaleValue(
      boundedPlotPoint.y, model.plot.bottom, model.plot.top, model.yRange.min, model.yRange.max
    )
  };
  return constrainForEdit && model.interactionDomain
    ? clampAfasDataPoint(converted, model.interactionDomain)
    : converted;
}
```

Pass `true` in `beginRangeEdit`, `beginTangentEdit`, and active edit pointer moves. Do not change brush/hover semantics.

- [ ] **Step 4: Use sampled visible temperatures and domain-clipped tangent controls**

Disable editing when `interactionDomain` is null or has fewer than two `availableTemperatures`. Store that exact temperature array in range interactions. For tangent handles, derive both endpoints with `clampTangentControlPoints(line.slope, line.intercept, model.interactionDomain)`; anchor the opposite endpoint and pass `model.interactionDomain` into translate/rotate.

Use the minimum temperature delta based on the smallest positive difference in `availableTemperatures`, not padded chart width:

```typescript
function minimumPositiveTemperatureStep(values: number[]): number | null {
  const sorted = [...new Set(values.filter(Number.isFinite))].sort((left, right) => left - right);
  const positiveDeltas = sorted.slice(1)
    .map((value, index) => value - sorted[index])
    .filter((value) => value > 0);
  return positiveDeltas.length ? Math.min(...positiveDeltas) : null;
}

const minimumTemperatureDelta = minimumPositiveTemperatureStep(
  model.interactionDomain.availableTemperatures
) ?? Math.max(1e-6, (model.interactionDomain.temperatureMax - model.interactionDomain.temperatureMin) * 0.002);
```

- [ ] **Step 5: Separate candidate and accepted preview state**

Replace `draftParametersRef` with these refs:

```typescript
const candidateParametersRef = useRef<AfasAnalysisFormState | null>(null);
const acceptedParametersRef = useRef<AfasAnalysisFormState | null>(null);
```

At edit start set both to `null`. On move write only the candidate. In `requestInteractivePreview(parameters)`, write `acceptedParametersRef.current = parameters` only after the latest non-aborted response succeeds, immediately before applying that preview to displayed analysis. On error keep the last accepted value and displayed analysis. On pointer up:

```typescript
const acceptedParameters = acceptedParametersRef.current;
candidateParametersRef.current = null;
acceptedParametersRef.current = null;
if (acceptedParameters) void persistInteractiveAdjustment(acceptedParameters);
```

If the newest request is still pending, abort it and save the latest earlier accepted preview; never save a merely generated candidate.

- [ ] **Step 6: Run frontend chart and interaction tests and verify GREEN**

Run:

```bash
cd frontend && node --test \
  tests/afasInteraction.test.mjs \
  tests/curveSpecs.test.mjs \
  tests/operatorRegionResults.test.mjs
npm run build
```

Expected: targeted tests and TypeScript/Vite build PASS.

- [ ] **Step 7: Commit chart interaction state**

```bash
git add frontend/src/main.tsx frontend/tests/operatorRegionResults.test.mjs
git commit -m "fix(ui): retain last valid AFAS drag state"
```

### Task 4: Clip all AFAS plot and hit layers without clipping axes or labels

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/tests/operatorRegionResults.test.mjs`

- [ ] **Step 1: Write a failing SVG structure test**

Assert `AnalysisAfasChart` creates one unique plot clip, uses it for both underlay and interactive/data layers, and keeps axes/tooltip/labels outside clipped groups:

```javascript
test("AFAS plot visuals and hit targets share a unique SVG clip", () => {
  const source = readFileSync(resolve(rootDir, "src/main.tsx"), "utf8");
  const block = source.slice(source.indexOf("function AnalysisAfasChart("), source.indexOf("function AnalysisLayerToggle("));
  assert.match(block, /useId\(\)/);
  assert.match(block, /<clipPath id=\{plotClipId\}>/);
  assert.match(block, /<rect[\s\S]*x=\{model\.plot\.left\}[\s\S]*height=\{model\.plot\.bottom - model\.plot\.top\}/);
  assert.ok((block.match(/clipPath=\{`url\(#\$\{plotClipId\}\)`\}/g) ?? []).length >= 2);
  assert.match(block, /<AnalysisAfasTooltip/);
});
```

- [ ] **Step 2: Run the SVG test and verify RED**

Run:

```bash
cd frontend && node --test tests/operatorRegionResults.test.mjs
```

Expected: FAIL because no AFAS plot clip path exists.

- [ ] **Step 3: Add the unique clip definition and clipped underlay**

At chart initialization:

```typescript
const plotClipId = `analysis-afas-plot-${useId().replace(/:/g, "")}`;
const plotClipUrl = `url(#${plotClipId})`;
```

Pass a fragment through `underlay` containing `<defs>` and a clipped `<g>` for low/high bands:

```tsx
const rangeBandRects = rangeBands.map(({ kind, range }) => {
  const x1 = analysisAfasChartX(range[0], model);
  const x2 = analysisAfasChartX(range[1], model);
  return (
    <rect
      className={`analysisAfasFitBand analysisAfasFitBand--${kind}`}
      height={model.plot.bottom - model.plot.top}
      key={`band-${kind}`}
      width={Math.abs(x2 - x1)}
      x={Math.min(x1, x2)}
      y={model.plot.top}
    />
  );
});

<>
  <defs>
    <clipPath id={plotClipId}>
      <rect
        x={model.plot.left}
        y={model.plot.top}
        width={model.plot.right - model.plot.left}
        height={model.plot.bottom - model.plot.top}
      />
    </clipPath>
  </defs>
  <g clipPath={plotClipUrl}>{rangeBandRects}</g>
</>
```

- [ ] **Step 4: Partition chart content into clipped and un-clipped groups**

Place these nodes inside a second `<g clipPath={plotClipUrl}>`: range move targets, four range boundaries and full-height hit strips, raw/outlier/smoothed data, low/high fit lines, tangent line/wide target/two handles, and construction guides. Keep inline labels, marker labels, tooltip, axes/ticks/axis labels, toolbar, and empty-state copy outside the clipped group.

Clamp label anchor coordinates to `model.plot` before rendering so un-clipped text remains associated with the visible line instead of drifting into the page margin.

```tsx
<g clipPath={plotClipUrl} data-layer="afas-clipped-plot">
  {model.rawPoints.map((point, index) => (
    <circle className="analysisAfasRawPoint" cx={point.x} cy={point.y} key={`raw-${point.frameIndex ?? index}`} r={2.6} />
  ))}
  {model.fitLines.map((line) => (
    <line
      className={`analysisAfasFitLine analysisAfasFitLine--${line.kind}`}
      key={`geometry-${line.kind}`}
      x1={line.x1}
      x2={line.x2}
      y1={line.y1}
      y2={line.y2}
    />
  ))}
  {model.smoothedPath ? <polyline className="analysisAfasSmoothedLine" points={model.smoothedPath} /> : null}
</g>
<g data-layer="afas-unclipped-labels">
  {model.fitLines.map((line) => (
    <text className="analysisAfasInlineLabel" key={`label-${line.kind}`} x={clamp(line.labelX, model.plot.left, model.plot.right)} y={clamp(line.labelY - 8, model.plot.top, model.plot.bottom)} textAnchor="middle">
      {t(line.label)}
    </text>
  ))}
  {model.markers.map((marker) => marker.kind === "max_slope"
    ? <MaxSlopeMarker key={`marker-${marker.kind}`} marker={marker} plot={model.plot} />
    : <AfasReferenceMarker key={`marker-${marker.kind}`} marker={marker} plot={model.plot} />)}
</g>
{hoverTarget ? <AnalysisAfasTooltip target={hoverTarget} plot={model.plot} /> : null}
```

- [ ] **Step 5: Keep hit areas large but bounded**

Retain 14 px range hit strips and tangent stroke hit width in CSS; rely on the shared SVG clip to cut their overhang at each plot edge:

```css
.analysisAfasRangeHandleHitTarget,
.analysisAfasRangeMoveTarget,
.analysisAfasTangentMoveTarget {
  pointer-events: stroke;
}

.analysisAfasTangentMoveTarget {
  stroke: transparent;
  stroke-width: 18px;
}
```

- [ ] **Step 6: Run SVG/UI tests and production build and verify GREEN**

Run:

```bash
cd frontend && node --test \
  tests/operatorRegionResults.test.mjs \
  tests/afasInteraction.test.mjs \
  tests/curveSpecs.test.mjs
npm run build
```

Expected: SVG structure, interaction, curve model, and production build PASS.

- [ ] **Step 7: Commit SVG clipping**

```bash
git add frontend/src/main.tsx frontend/src/styles.css frontend/tests/operatorRegionResults.test.mjs
git commit -m "fix(ui): clip AFAS plot interaction layers"
```

### Task 5: Full regression and required real-browser verification

**Files:**
- Modify: `problem.md`
- Create evidence under: `output/playwright/p0116-afas-bounds-20260721/`

- [ ] **Step 1: Run all automated checks**

Run:

```bash
PYTHONPATH=backend/src pytest -q backend/tests
cd frontend && npm test && npm run build
git diff --check
```

Expected: all backend/frontend tests and build PASS; detector, ROI, temperature sync, and AFAS formulas have no unrelated changes.

- [ ] **Step 2: Start the approved simulated browser profile**

Run:

```bash
scripts/g3_fast_start.sh sim-sim
```

Confirm `/api/health` is healthy and open the reported frontend URL in Chrome/Playwright.

- [ ] **Step 3: Verify every drag mode on both Golden datasets**

For `golden_a_20260522_dev_lab` and `golden_c_20260529_dev_lab`, complete a run and open Results. In full range and after a brush zoom, drag each of these toward left, right, top, and bottom beyond the plot:

```text
Low-temperature start boundary
Low-temperature end boundary
Low-temperature whole band
High-temperature start boundary
High-temperature end boundary
High-temperature whole band
Maximum-slope tangent whole line
Maximum-slope tangent start handle
Maximum-slope tangent end handle
```

Verify sampled ranges retain at least two points; tangent parameters remain finite; shaded bands, lines, wide hit layers, and handles never render over axes; failed 422 previews leave the last valid visible/saved state; save, reload, export, and import retain the same valid AS/AF result.

- [ ] **Step 4: Save browser evidence and update P-0116**

Create the evidence directory, then record in `problem.md` the exact browser-reported version, `sw_vers` output, actual frontend/backend URLs, one entry per dataset ID, the nine completed drag modes, expected and observed behavior, PASS/FAIL, and concrete screenshot/log filenames:

```bash
mkdir -p output/playwright/p0116-afas-bounds-20260721
sw_vers > output/playwright/p0116-afas-bounds-20260721/macos-version.txt
```

After Mac PASS, keep P-0116 at `FIXED_PENDING_BROWSER_RETEST`; the reported defect is in the Windows package and still needs the same matrix in target Edge/Chrome. Use `REOPENED` and record the exact failing mode if any Mac step fails.

- [ ] **Step 5: Repeat the bounded-drag matrix in the packaged Windows build**

Install the next Setup on Windows 11 x64, open the single-port UI in Edge or Chrome, and repeat all nine drag modes at full range and zoom for both dataset IDs. Record browser version, package version, screenshots, network 422 behavior, save/reload, and console output:

```text
Result required for closure: PASS on golden_a_20260522_dev_lab and golden_c_20260529_dev_lab
Status after Windows PASS: RESOLVED_BROWSER_VERIFIED
Status after Windows FAIL: REOPENED
```

- [ ] **Step 6: Commit the verified issue record**

```bash
git add problem.md
git add -f output/playwright/p0116-afas-bounds-20260721
git commit -m "test(afas): verify bounded chart interactions"
```

If repository policy excludes screenshot binaries, commit only textual browser logs and keep absolute/local evidence paths in `problem.md`.
