import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  Camera,
  Database,
  Download,
  Image as ImageIcon,
  Play,
  RefreshCcw,
  RotateCw,
  Square,
  Settings,
  SquareDashedMousePointer,
  Thermometer,
  Usb
} from "lucide-react";
import {
  apiUrlFromPath,
  artifactDownloadUrl,
  createLiveOfflineRun,
  createRealCameraRun,
  createRunExports,
  frameIndexImageUrl,
  frameImageUrl,
  getTemperatureStatus,
  getRun,
  getRunAvailability,
  getOfflineDatasetSummary,
  listTemperatureSerialPorts,
  listOfflineDatasets,
  previewRealCamera,
  probeFrame,
  realCameraPreviewImageUrl,
  recomputeRunAnalysis,
  streamLiveOfflineRun,
  type ABPoint,
  type AfasAnalysisParameters,
  type AfasPreprocessingParameters,
  type AnalysisResult,
  type CameraPreviewResponse,
  type CurvePoint,
  type DetectionResult,
  type MeasurementDefinition,
  type ExportArtifact,
  type LiveOfflineFrameEvent,
  type OfflineDatasetListItem,
  type OfflineDatasetSummary,
  type ProbeResponse,
  type RunResponse,
  type RotatedROI,
  type SerialPortInfo,
  type TemperatureStatusResponse
} from "./api/client";
import {
  displayPointToMeasurement,
  fitSourceToDisplay,
  measurementPointToDisplay,
  measurementRoiToDisplay,
  roiCorners,
  type FrameDisplayTransform
} from "./geometry/coordinates";
import {
  moveRoiFromDrag,
  resizeRoiFromHandle,
  rotateRoiToPointer,
  type RoiResizeHandle
} from "./geometry/roiInteraction";
import {
  buildAnalysisCurveSpecs,
  buildCurveViewModel,
  buildRunCurveSpecs,
  type CurveSpec
} from "./curves";
import "./styles.css";

type Page = "setup" | "run" | "playback" | "analysis";

type LiveRunState = {
  runId: string;
  datasetId: string;
  status: "running" | "complete" | "stopped";
  frameIndex: number;
  frameUrl: string;
  frameCount: number;
  totalFrames: number;
  processedFrames: number;
  detectionResult: DetectionResult | null;
  analysis: AnalysisResult;
};

const DEFAULT_CONFIG = {
  tie_width_epsilon_px: 2,
  switch_after_n_frames: 3,
  jump_limit_px: 35,
  min_confidence: 0.15,
  min_component_area_px: 80,
  envelope_window_px: 9,
  envelope_step_px: 2,
  min_window_pixels: 8,
  window_width_keep_ratio: 0.2,
  mask_open_kernel_px: 3,
  mask_close_kernel_px: 11,
  mask_dilate_kernel_px: 1,
  max_frames_per_run: 160,
  live_offline_fps: 8,
  target_temperature_celsius: null,
  temperature_power_percent: 100
};

const DEFAULT_AFAS_PREPROCESSING_PARAMETERS: AfasPreprocessingParameters = {
  group_by_temperature: true,
  outlier_window: 11,
  outlier_threshold: 5,
  outlier_max_iterations: 3,
  savgol_window_length: 51,
  savgol_polyorder: 3
};

type AfasAnalysisFormState = {
  low_range_celsius: [number | null, number | null];
  high_range_celsius: [number | null, number | null];
  tangent_offset: number;
};

const DEFAULT_AFAS_ANALYSIS_FORM: AfasAnalysisFormState = {
  low_range_celsius: [null, null],
  high_range_celsius: [null, null],
  tangent_offset: 0
};

const LIVE_FRAME_DISPLAY_MAX_WIDTH = 1024;

function App() {
  const [page, setPage] = useState<Page>("setup");
  const [datasets, setDatasets] = useState<OfflineDatasetListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [summary, setSummary] = useState<OfflineDatasetSummary | null>(null);
  const [measurement, setMeasurement] = useState<MeasurementDefinition | null>(null);
  const [frameIndex, setFrameIndex] = useState(1);
  const [probe, setProbe] = useState<ProbeResponse | null>(null);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [liveRun, setLiveRun] = useState<LiveRunState | null>(null);
  const [cameraPreview, setCameraPreview] = useState<CameraPreviewResponse | null>(null);
  const [cameraPreviewUrl, setCameraPreviewUrl] = useState("");
  const [temperatureStatus, setTemperatureStatus] = useState<TemperatureStatusResponse | null>(null);
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [running, setRunning] = useState(false);
  const [previewingCamera, setPreviewingCamera] = useState(false);
  const [runningCamera, setRunningCamera] = useState(false);
  const [checkingTemperature, setCheckingTemperature] = useState(false);
  const [loadingSerialPorts, setLoadingSerialPorts] = useState(false);
  const [error, setError] = useState("");
  const runAbortRef = useRef<AbortController | null>(null);
  const liveRunIdRef = useRef<string | null>(null);
  const liveRunProcessedFramesRef = useRef(0);

  useEffect(() => {
    void refreshDatasets();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSummary(null);
      setMeasurement(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    getOfflineDatasetSummary(selectedId)
      .then((payload) => {
        if (cancelled) return;
        setSummary(payload);
        setFrameIndex(1);
        setProbe(null);
        setRunResult(null);
        setLiveRun(null);
        setCameraPreview(null);
        setCameraPreviewUrl("");
        setTemperatureStatus(null);
        setMeasurement(createDefaultMeasurement(payload.dataset, payload.first_frame.shape));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setSummary(null);
          setMeasurement(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function refreshDatasets() {
    setLoading(true);
    setError("");
    try {
      const nextDatasets = await listOfflineDatasets();
      setDatasets(nextDatasets);
      setSelectedId((current) => current || nextDatasets[0]?.id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function runProbe(targetFrame = frameIndex) {
    if (!measurement || !selectedId) return;
    setProbing(true);
    setError("");
    try {
      const response = await probeFrame(selectedId, targetFrame, measurement);
      setProbe(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProbe(null);
    } finally {
      setProbing(false);
    }
  }

  async function startLiveOfflineRun() {
    if (!measurement || !selectedId) return;
    const controller = new AbortController();
    runAbortRef.current = controller;
    setRunning(true);
    setError("");
    setRunResult(null);
    setProbe(null);
    liveRunIdRef.current = null;
    liveRunProcessedFramesRef.current = 0;
    setLiveRun(createInitialLiveRun(selectedId, frameIndex, selectedDataset?.frame_count ?? frameIndex));
    try {
      const response = await streamLiveOfflineRun(selectedId, measurement, {
        startFrame: frameIndex,
        targetFps: measurement.detector_config.live_offline_fps ?? 8,
        signal: controller.signal
      }, (event) => {
        if (event.event === "frame") {
          liveRunIdRef.current = event.run_id;
          liveRunProcessedFramesRef.current = event.processed_frames;
          setLiveRun((current) => updateLiveRunFromFrame(current, event));
        } else if (event.event === "complete") {
          liveRunIdRef.current = event.run_manifest.run_id;
          liveRunProcessedFramesRef.current = event.run_manifest.frame_records.length;
          setLiveRun((current) =>
            current
              ? {
                  ...current,
                  status: "complete",
                  analysis: event.analysis_result,
                  processedFrames: event.run_manifest.frame_records.length,
                  totalFrames: event.run_manifest.frame_records.length
                }
              : current
          );
        }
      });
      setRunResult(response);
    } catch (err) {
      if (controller.signal.aborted) {
        setLiveRun((current) => (current ? { ...current, status: "stopped" } : current));
        const stoppedRunId = liveRunIdRef.current;
        if (stoppedRunId) {
          try {
            const partialResult = await waitForStoppedRun(stoppedRunId);
            applyStoppedRunResult(partialResult);
          } catch (fetchErr) {
            if (measurement && selectedId && liveRunProcessedFramesRef.current > 0) {
              try {
                const partialResult = await createLiveOfflineRun(selectedId, measurement, {
                  startFrame: frameIndex,
                  maxFrames: liveRunProcessedFramesRef.current,
                  targetFps: measurement.detector_config.live_offline_fps ?? 8
                });
                applyStoppedRunResult(partialResult);
              } catch (fallbackErr) {
                setError(fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr));
              }
            } else {
              setError(fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
            }
          }
        }
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setRunResult(null);
      }
    } finally {
      if (runAbortRef.current === controller) {
        runAbortRef.current = null;
      }
      setRunning(false);
    }

    function applyStoppedRunResult(partialResult: RunResponse) {
      setRunResult(partialResult);
      setLiveRun((current) =>
        current
          ? {
              ...current,
              status: "stopped",
              runId: partialResult.run_manifest.run_id,
              analysis: partialResult.analysis_result,
              processedFrames: partialResult.run_manifest.frame_records.length,
              totalFrames: partialResult.run_manifest.config_snapshot.max_frames as number
            }
          : current
      );
    }
  }

  function stopLiveOfflineRun() {
    runAbortRef.current?.abort();
  }

  async function previewRealCameraFrame() {
    setPreviewingCamera(true);
    setError("");
    try {
      const response = await previewRealCamera();
      setCameraPreview(response);
      setCameraPreviewUrl(realCameraPreviewImageUrl(Date.now()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCameraPreview(null);
      setCameraPreviewUrl("");
    } finally {
      setPreviewingCamera(false);
    }
  }

  async function readCurrentTemperature() {
    setCheckingTemperature(true);
    setError("");
    try {
      setTemperatureStatus(await getTemperatureStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTemperatureStatus(null);
    } finally {
      setCheckingTemperature(false);
    }
  }

  async function refreshSerialPorts() {
    setLoadingSerialPorts(true);
    setError("");
    try {
      setSerialPorts(await listTemperatureSerialPorts());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSerialPorts([]);
    } finally {
      setLoadingSerialPorts(false);
    }
  }

  async function startRealCameraRun() {
    if (!measurement) return;
    setRunningCamera(true);
    setError("");
    try {
      const response = await createRealCameraRun(measurement, {
        maxFrames: measurement.detector_config.max_frames_per_run ?? 120,
        targetFps: measurement.detector_config.live_offline_fps ?? 8,
        cameraProfile: { pixel_format: "mono8" }
      });
      setRunResult(response);
      setProbe(null);
      setLiveRun(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningCamera(false);
    }
  }

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedId) ?? null,
    [datasets, selectedId]
  );

  const frameCount = selectedDataset?.frame_count ?? 1;
  const frameUrl =
    frameIndex === 1
      ? frameImageUrl(selectedId, "first")
      : frameIndex === frameCount
        ? frameImageUrl(selectedId, "last")
        : frameIndexImageUrl(selectedId, frameIndex);

  return (
    <main className="appShell">
      <header className="topBar">
        <div className="brandBlock">
          <Database size={22} aria-hidden="true" />
          <div>
            <h1>YY/T 1771 G3</h1>
            <span>AF envelope workstation</span>
          </div>
        </div>
        <nav className="tabs" aria-label="Primary">
          <TabButton page="setup" current={page} onSelect={setPage} icon={<Settings size={16} />}>
            Setup
          </TabButton>
          <TabButton page="run" current={page} onSelect={setPage} icon={<Activity size={16} />}>
            Run
          </TabButton>
          <TabButton page="playback" current={page} onSelect={setPage} icon={<Play size={16} />}>
            Playback
          </TabButton>
          <TabButton page="analysis" current={page} onSelect={setPage} icon={<BarChart3 size={16} />}>
            Analysis / Export
          </TabButton>
        </nav>
        <button className="iconButton" onClick={refreshDatasets} type="button" title="Refresh">
          <RefreshCcw size={17} aria-hidden="true" />
        </button>
      </header>

      <section className="workspace">
        <aside className="datasetRail" aria-label="Offline datasets">
          {datasets.map((dataset) => (
            <button
              className={dataset.id === selectedId ? "datasetItem selected" : "datasetItem"}
              key={dataset.id}
              onClick={() => setSelectedId(dataset.id)}
              type="button"
            >
              <span className="datasetId">{dataset.id}</span>
              <span className="datasetMeta">
                {dataset.object_class} · {dataset.frame_count.toLocaleString()} frames
              </span>
              <span className="datasetMeta">
                {dataset.default_detector} · {dataset.default_width_mode}
              </span>
            </button>
          ))}
        </aside>

        <section className="panelArea">
          {error ? <div className="statusBlock error">{error}</div> : null}
          {loading && !summary ? <div className="statusBlock">Loading</div> : null}
          {!loading && !selectedDataset ? <div className="statusBlock">No datasets</div> : null}
          {selectedDataset && summary && measurement ? (
            <PageContent
              dataset={selectedDataset}
              summary={summary}
              measurement={measurement}
              onMeasurement={setMeasurement}
              frameIndex={frameIndex}
              onFrameIndex={setFrameIndex}
              frameUrl={frameUrl}
              probe={probe}
              runResult={runResult}
              liveRun={liveRun}
              cameraPreview={cameraPreview}
              cameraPreviewUrl={cameraPreviewUrl}
              temperatureStatus={temperatureStatus}
              serialPorts={serialPorts}
              probing={probing}
              running={running}
              previewingCamera={previewingCamera}
              runningCamera={runningCamera}
              checkingTemperature={checkingTemperature}
              loadingSerialPorts={loadingSerialPorts}
              onProbe={runProbe}
              onStartRun={startLiveOfflineRun}
              onStopRun={stopLiveOfflineRun}
              onPreviewRealCamera={previewRealCameraFrame}
              onStartRealCameraRun={startRealCameraRun}
              onReadCurrentTemperature={readCurrentTemperature}
              onRefreshSerialPorts={refreshSerialPorts}
              page={page}
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}

function TabButton({
  page,
  current,
  onSelect,
  icon,
  children
}: {
  page: Page;
  current: Page;
  onSelect: (page: Page) => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button className={page === current ? "active" : ""} onClick={() => onSelect(page)} type="button">
      {icon}
      {children}
    </button>
  );
}

function PageContent({
  dataset,
  summary,
  measurement,
  onMeasurement,
  frameIndex,
  onFrameIndex,
  frameUrl,
  probe,
  runResult,
  liveRun,
  cameraPreview,
  cameraPreviewUrl,
  temperatureStatus,
  serialPorts,
  probing,
  running,
  previewingCamera,
  runningCamera,
  checkingTemperature,
  loadingSerialPorts,
  onProbe,
  onStartRun,
  onStopRun,
  onPreviewRealCamera,
  onStartRealCameraRun,
  onReadCurrentTemperature,
  onRefreshSerialPorts,
  page
}: {
  dataset: OfflineDatasetListItem;
  summary: OfflineDatasetSummary;
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
  frameIndex: number;
  onFrameIndex: (frameIndex: number) => void;
  frameUrl: string;
  probe: ProbeResponse | null;
  runResult: RunResponse | null;
  liveRun: LiveRunState | null;
  cameraPreview: CameraPreviewResponse | null;
  cameraPreviewUrl: string;
  temperatureStatus: TemperatureStatusResponse | null;
  serialPorts: SerialPortInfo[];
  probing: boolean;
  running: boolean;
  previewingCamera: boolean;
  runningCamera: boolean;
  checkingTemperature: boolean;
  loadingSerialPorts: boolean;
  onProbe: (frameIndex?: number) => void;
  onStartRun: () => void;
  onStopRun: () => void;
  onPreviewRealCamera: () => void;
  onStartRealCameraRun: () => void;
  onReadCurrentTemperature: () => void;
  onRefreshSerialPorts: () => void;
  page: Page;
}) {
  if (page === "run") {
    return (
      <RunPage
        dataset={dataset}
        summary={summary}
        measurement={measurement}
        startFrame={frameIndex}
        runResult={runResult}
        liveRun={liveRun}
        cameraPreview={cameraPreview}
        cameraPreviewUrl={cameraPreviewUrl}
        temperatureStatus={temperatureStatus}
        serialPorts={serialPorts}
        running={running}
        previewingCamera={previewingCamera}
        runningCamera={runningCamera}
        checkingTemperature={checkingTemperature}
        loadingSerialPorts={loadingSerialPorts}
        onStartRun={onStartRun}
        onStopRun={onStopRun}
        onPreviewRealCamera={onPreviewRealCamera}
        onStartRealCameraRun={onStartRealCameraRun}
        onReadCurrentTemperature={onReadCurrentTemperature}
        onRefreshSerialPorts={onRefreshSerialPorts}
      />
    );
  }
  if (page === "analysis") {
    return <AnalysisPage probe={probe} runResult={runResult} liveRun={liveRun} />;
  }
  return (
    <div className="pageGrid workGrid">
      <section className="toolPanel">
        <h2>{page === "setup" ? "Setup" : "Playback"}</h2>
        <FrameControls
          frameIndex={frameIndex}
          frameCount={dataset.frame_count}
          onFrameIndex={onFrameIndex}
          onProbe={onProbe}
          probing={probing}
        />
        <MeasurementControls measurement={measurement} onMeasurement={onMeasurement} />
        <TemperatureControlPanel
          currentTemperature={probe?.detection_result.temperature_celsius ?? null}
          measurement={measurement}
          onMeasurement={onMeasurement}
        />
        <DetectorStatus dataset={dataset} summary={summary} probe={probe} />
      </section>
      <FrameCanvas
        title={`${dataset.id} · frame ${frameIndex}`}
        imageUrl={frameUrl}
        sourceShape={summary.first_frame.shape}
        roi={measurement.roi}
        abPoints={probe?.detection_result.ab_points ?? null}
        debugArtifacts={probe?.detection_result.debug_artifacts ?? null}
        onRoiChange={(roi) => onMeasurement({ ...measurement, roi })}
      />
    </div>
  );
}

function FrameControls({
  frameIndex,
  frameCount,
  onFrameIndex,
  onProbe,
  probing
}: {
  frameIndex: number;
  frameCount: number;
  onFrameIndex: (frameIndex: number) => void;
  onProbe: (frameIndex?: number) => void;
  probing: boolean;
}) {
  return (
    <div className="controlStack">
      <div className="segmented wide">
        <button onClick={() => onFrameIndex(1)} type="button">
          <ImageIcon size={15} aria-hidden="true" />
          First
        </button>
        <button onClick={() => onFrameIndex(frameCount)} type="button">
          <ImageIcon size={15} aria-hidden="true" />
          Last
        </button>
      </div>
      <label className="field">
        <span>Frame</span>
        <input
          max={frameCount}
          min={1}
          onChange={(event) => onFrameIndex(Number(event.target.value))}
          type="number"
          value={frameIndex}
        />
      </label>
      <button className="primaryButton" disabled={probing} onClick={() => onProbe()} type="button">
        <SquareDashedMousePointer size={16} aria-hidden="true" />
        {probing ? "Probing" : "Probe current frame"}
      </button>
    </div>
  );
}

function MeasurementControls({
  measurement,
  onMeasurement
}: {
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
}) {
  function patchRoi(patch: Partial<RotatedROI>) {
    onMeasurement({ ...measurement, roi: { ...measurement.roi, ...patch } });
  }

  return (
    <div className="controlStack">
      <h3>Measurement ROI</h3>
      <div className="twoColumnControls">
        <NumberField label="Center X" value={measurement.roi.center_x} onChange={(v) => patchRoi({ center_x: v })} />
        <NumberField label="Center Y" value={measurement.roi.center_y} onChange={(v) => patchRoi({ center_y: v })} />
        <NumberField label="Width" value={measurement.roi.width} onChange={(v) => patchRoi({ width: Math.max(1, v) })} />
        <NumberField label="Height" value={measurement.roi.height} onChange={(v) => patchRoi({ height: Math.max(1, v) })} />
      </div>
      <label className="field">
        <span>
          <RotateCw size={14} aria-hidden="true" />
          Angle
        </span>
        <input
          onChange={(event) => patchRoi({ angle_deg: Number(event.target.value) })}
          step={0.5}
          type="number"
          value={roundForInput(measurement.roi.angle_deg)}
        />
      </label>
    </div>
  );
}

function TemperatureControlPanel({
  currentTemperature,
  measurement,
  onMeasurement
}: {
  currentTemperature: number | null;
  measurement: MeasurementDefinition;
  onMeasurement: (measurement: MeasurementDefinition) => void;
}) {
  function patchConfig(patch: Partial<MeasurementDefinition["detector_config"]>) {
    onMeasurement({
      ...measurement,
      detector_config: {
        ...measurement.detector_config,
        ...patch
      }
    });
  }

  return (
    <div className="controlStack">
      <h3>Temperature Control</h3>
      <dl className="metricGrid compact">
        <Metric label="Current" value={formatTemperatureValue(currentTemperature)} />
      </dl>
      <div className="twoColumnControls">
        <NullableNumberField
          label="Target °C"
          value={measurement.detector_config.target_temperature_celsius ?? null}
          onChange={(v) => patchConfig({ target_temperature_celsius: v })}
        />
        <NumberField
          label="Power %"
          value={measurement.detector_config.temperature_power_percent ?? 100}
          onChange={(v) => patchConfig({ temperature_power_percent: clamp(v, 0, 100) })}
        />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
  step = 1
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="number"
        value={roundForInput(value)}
      />
    </label>
  );
}

function NullableNumberField({
  label,
  value,
  min,
  onChange,
  step = 1
}: {
  label: string;
  value: number | null;
  min?: number;
  onChange: (value: number | null) => void;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        min={min}
        onChange={(event) => {
          const raw = event.target.value.trim();
          onChange(raw === "" ? null : Number(raw));
        }}
        placeholder="None"
        step={step}
        type="number"
        value={value == null ? "" : roundForInput(value)}
      />
    </label>
  );
}

function DetectorStatus({
  dataset,
  summary,
  probe
}: {
  dataset: OfflineDatasetListItem;
  summary: OfflineDatasetSummary;
  probe: ProbeResponse | null;
}) {
  const result = probe?.detection_result ?? null;
  return (
    <div className="diagnostics">
      <h3>Result</h3>
      <dl className="metricGrid compact">
        <Metric label="Dataset" value={dataset.id} />
        <Metric label="Detector" value={dataset.default_detector} />
        <Metric label="Frames" value={dataset.frame_count.toLocaleString()} />
        <Metric label="Temperature rows" value={summary.temperature.row_count.toLocaleString()} />
        <Metric label="Status" value={result?.detection_status ?? "Not probed"} />
        <Metric label="Distance" value={formatDistance(result)} />
        <Metric label="Temperature" value={formatTemperature(result)} />
        <Metric label="Sync" value={result?.temperature_sync_status ?? "Not probed"} />
      </dl>
      {result ? (
        <details>
          <summary>Diagnostics</summary>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </details>
      ) : null}
    </div>
  );
}

function FrameCanvas({
  title,
  imageUrl,
  sourceShape,
  roi,
  abPoints,
  debugArtifacts,
  onRoiChange,
  readOnly = false
}: {
  title: string;
  imageUrl: string;
  sourceShape: number[];
  roi: RotatedROI;
  abPoints: { a: ABPoint; b: ABPoint } | null;
  debugArtifacts?: Record<string, unknown> | null;
  onRoiChange?: (roi: RotatedROI) => void;
  readOnly?: boolean;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [rect, setRect] = useState({ width: 800, height: 520 });
  const [dragInteraction, setDragInteraction] = useState<RoiDragInteraction | null>(null);
  const source = { width: sourceShape[1] ?? 1, height: sourceShape[0] ?? 1 };
  const transform = fitSourceToDisplay(source, rect);
  const displayRoi = measurementRoiToDisplay(roi, transform);
  const corners = roiCorners(displayRoi);
  const handles = roiResizeHandles(corners);
  const rotateHandle = roiRotateHandle(corners, displayRoi);
  const editable = !readOnly && Boolean(onRoiChange);
  const stableImage = useStableImageUrl(imageUrl);

  useEffect(() => {
    const element = shellRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect;
      if (next) setRect({ width: next.width, height: next.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function pointerToMeasurement(event: React.PointerEvent<SVGElement>) {
    const bounds = svgRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    const displayPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    return displayPointToMeasurement(displayPoint, transform, true);
  }

  function beginInteraction(
    event: React.PointerEvent<SVGElement>,
    interaction: RoiDragStart
  ) {
    if (!editable) return;
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    setDragInteraction({
      ...interaction,
      startRoi: roi,
      startPoint: pointerToMeasurement(event)
    });
  }

  function updateInteraction(event: React.PointerEvent<SVGSVGElement>) {
    if (!dragInteraction || !onRoiChange) return;
    const currentPoint = pointerToMeasurement(event);
    if (dragInteraction.kind === "move") {
      onRoiChange(moveRoiFromDrag(dragInteraction.startRoi, dragInteraction.startPoint, currentPoint));
    } else if (dragInteraction.kind === "resize") {
      onRoiChange(resizeRoiFromHandle(dragInteraction.startRoi, dragInteraction.handle, currentPoint));
    } else {
      onRoiChange(rotateRoiToPointer(dragInteraction.startRoi, currentPoint));
    }
  }

  return (
    <figure className="frameCanvasFigure">
      <figcaption>{title}</figcaption>
      <div className="frameCanvas" ref={shellRef}>
        {stableImage.displayedUrl ? (
          <img className="frameCanvasImage" src={stableImage.displayedUrl} alt={title} />
        ) : (
          <div className="frameCanvasStatus">Loading frame...</div>
        )}
        {stableImage.status === "error" && stableImage.errorUrl ? (
          <div className="frameCanvasStatus error">Frame image unavailable</div>
        ) : null}
        <svg
          className={editable ? "overlaySvg" : "overlaySvg readOnly"}
          ref={svgRef}
          onPointerMove={updateInteraction}
          onPointerUp={(event) => {
            svgRef.current?.releasePointerCapture(event.pointerId);
            setDragInteraction(null);
          }}
          onPointerLeave={() => setDragInteraction(null)}
          role="img"
        >
          {editable ? (
            <line
              className="roiRotateLine"
              x1={(corners[0].x + corners[1].x) / 2}
              y1={(corners[0].y + corners[1].y) / 2}
              x2={rotateHandle.x}
              y2={rotateHandle.y}
            />
          ) : null}
          <polygon
            className="roiPolygon"
            onPointerDown={(event) => beginInteraction(event, { kind: "move" })}
            points={corners.map((p) => `${p.x},${p.y}`).join(" ")}
          />
          {editable ? (
            <>
              <circle
                className="roiHandle roiMoveHandle"
                cx={displayRoi.center_x}
                cy={displayRoi.center_y}
                data-testid="roi-move-handle"
                onPointerDown={(event) => beginInteraction(event, { kind: "move" })}
                r={6}
              />
              {handles.map((handle) => (
                <rect
                  className="roiHandle roiResizeHandle"
                  data-testid={`roi-resize-${handle.handle}`}
                  height={10}
                  key={handle.handle}
                  onPointerDown={(event) => beginInteraction(event, { kind: "resize", handle: handle.handle })}
                  width={10}
                  x={handle.point.x - 5}
                  y={handle.point.y - 5}
                />
              ))}
              <circle
                className="roiHandle roiRotateHandle"
                cx={rotateHandle.x}
                cy={rotateHandle.y}
                data-testid="roi-rotate-handle"
                onPointerDown={(event) => beginInteraction(event, { kind: "rotate" })}
                r={7}
              />
            </>
          ) : null}
          {debugArtifacts ? <ContourProjectionOverlay debugArtifacts={debugArtifacts} transform={transform} /> : null}
          {abPoints ? <ABOverlay abPoints={abPoints} transform={transform} /> : null}
        </svg>
      </div>
    </figure>
  );
}

function useStableImageUrl(imageUrl: string): {
  displayedUrl: string;
  status: "idle" | "loading" | "loaded" | "error";
  errorUrl: string;
} {
  const [displayedUrl, setDisplayedUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [errorUrl, setErrorUrl] = useState("");
  const latestUrlRef = useRef("");
  const displayedUrlRef = useRef("");
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  const loadLatestRef = useRef<() => void>(() => {});
  loadLatestRef.current = () => {
    if (loadingRef.current) return;
    const nextUrl = latestUrlRef.current;
    if (!nextUrl || nextUrl === displayedUrlRef.current) return;

    loadingRef.current = true;
    setStatus(displayedUrlRef.current ? "loaded" : "loading");
    setErrorUrl("");

    const image = new Image();
    const loadUrl = nextUrl;
    image.onload = () => {
      if (!mountedRef.current) return;
      loadingRef.current = false;
      displayedUrlRef.current = loadUrl;
      setDisplayedUrl(loadUrl);
      setStatus("loaded");
      setErrorUrl("");
      if (latestUrlRef.current !== loadUrl) {
        loadLatestRef.current();
      }
    };
    image.onerror = () => {
      if (!mountedRef.current) return;
      loadingRef.current = false;
      setStatus(displayedUrlRef.current ? "loaded" : "error");
      setErrorUrl(loadUrl);
      if (latestUrlRef.current !== loadUrl) {
        loadLatestRef.current();
      }
    };
    image.src = loadUrl;
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    latestUrlRef.current = imageUrl;
    if (!imageUrl) {
      displayedUrlRef.current = "";
      loadingRef.current = false;
      setDisplayedUrl("");
      setStatus("idle");
      setErrorUrl("");
      return;
    }
    loadLatestRef.current();
  }, [imageUrl]);

  return { displayedUrl, status, errorUrl };
}

type RoiDragInteraction =
  | {
      kind: "move";
      startRoi: RotatedROI;
      startPoint: ABPoint;
    }
  | {
      kind: "resize";
      handle: RoiResizeHandle;
      startRoi: RotatedROI;
      startPoint: ABPoint;
    }
  | {
      kind: "rotate";
      startRoi: RotatedROI;
      startPoint: ABPoint;
    };

type RoiDragStart =
  | {
      kind: "move";
    }
  | {
      kind: "resize";
      handle: RoiResizeHandle;
    }
  | {
      kind: "rotate";
    };

function roiResizeHandles(corners: ABPoint[]): Array<{ handle: RoiResizeHandle; point: ABPoint }> {
  const [nw, ne, se, sw] = corners;
  return [
    { handle: "nw", point: nw },
    { handle: "n", point: midpoint(nw, ne) },
    { handle: "ne", point: ne },
    { handle: "e", point: midpoint(ne, se) },
    { handle: "se", point: se },
    { handle: "s", point: midpoint(se, sw) },
    { handle: "sw", point: sw },
    { handle: "w", point: midpoint(sw, nw) }
  ];
}

function roiRotateHandle(corners: ABPoint[], roi: RotatedROI): ABPoint {
  const topCenter = midpoint(corners[0], corners[1]);
  const outward = normalizeVector({ x: topCenter.x - roi.center_x, y: topCenter.y - roi.center_y });
  return {
    x: topCenter.x + outward.x * 32,
    y: topCenter.y + outward.y * 32
  };
}

function midpoint(a: ABPoint, b: ABPoint): ABPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function normalizeVector(vector: ABPoint): ABPoint {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function readPointArray(value: unknown): ABPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (
      typeof item === "object" &&
      item !== null &&
      typeof (item as { x?: unknown }).x === "number" &&
      typeof (item as { y?: unknown }).y === "number"
    ) {
      return [{ x: (item as { x: number }).x, y: (item as { y: number }).y }];
    }
    return [];
  });
}

function numberFromUnknown(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function arrowHeadPath(start: ABPoint, end: ABPoint, size: number, spread: number): string {
  const direction = normalizeVector({ x: end.x - start.x, y: end.y - start.y });
  const normal = { x: -direction.y, y: direction.x };
  const p1 = {
    x: end.x - direction.x * size + normal.x * size * spread,
    y: end.y - direction.y * size + normal.y * size * spread
  };
  const p2 = {
    x: end.x - direction.x * size - normal.x * size * spread,
    y: end.y - direction.y * size - normal.y * size * spread
  };
  return `M ${end.x} ${end.y} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} Z`;
}

function ABOverlay({
  abPoints,
  transform
}: {
  abPoints: { a: ABPoint; b: ABPoint };
  transform: FrameDisplayTransform;
}) {
  const a = measurementPointToDisplay(abPoints.a, transform);
  const b = measurementPointToDisplay(abPoints.b, transform);
  return (
    <g className="abOverlay">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      <circle cx={a.x} cy={a.y} r={5} />
      <circle cx={b.x} cy={b.y} r={5} />
      <text x={a.x + 8} y={a.y - 8}>
        A
      </text>
      <text x={b.x + 8} y={b.y + 16}>
        B
      </text>
    </g>
  );
}

function ContourProjectionOverlay({
  debugArtifacts,
  transform
}: {
  debugArtifacts: Record<string, unknown>;
  transform: FrameDisplayTransform;
}) {
  const box = readPointArray(debugArtifacts.contour_projection_box);
  const arrow = readPointArray(debugArtifacts.contour_direction_arrow);
  if (box.length !== 4 || arrow.length !== 2) return null;
  const displayBox = box.map((point) => measurementPointToDisplay(point, transform));
  const displayArrow = arrow.map((point) => measurementPointToDisplay(point, transform));
  const theta = numberFromUnknown(debugArtifacts.contour_theta_deg);
  const length = numberFromUnknown(debugArtifacts.contour_length_px);
  const label = `${theta == null ? "theta=?" : `theta=${theta.toFixed(1)} deg`}  ${
    length == null ? "L=?" : `L=${length.toFixed(1)}px`
  }`;
  return (
    <g className="contourProjectionOverlay">
      <polygon points={displayBox.map((point) => `${point.x},${point.y}`).join(" ")} />
      <line x1={displayArrow[0].x} y1={displayArrow[0].y} x2={displayArrow[1].x} y2={displayArrow[1].y} />
      <path d={arrowHeadPath(displayArrow[0], displayArrow[1], 18, 0.45)} />
      <text x={18} y={28}>
        {label}
      </text>
    </g>
  );
}

function RunPage({
  dataset,
  summary,
  measurement,
  startFrame,
  runResult,
  liveRun,
  cameraPreview,
  cameraPreviewUrl,
  temperatureStatus,
  serialPorts,
  running,
  previewingCamera,
  runningCamera,
  checkingTemperature,
  loadingSerialPorts,
  onStartRun,
  onStopRun,
  onPreviewRealCamera,
  onStartRealCameraRun,
  onReadCurrentTemperature,
  onRefreshSerialPorts
}: {
  dataset: OfflineDatasetListItem;
  summary: OfflineDatasetSummary;
  measurement: MeasurementDefinition;
  startFrame: number;
  runResult: RunResponse | null;
  liveRun: LiveRunState | null;
  cameraPreview: CameraPreviewResponse | null;
  cameraPreviewUrl: string;
  temperatureStatus: TemperatureStatusResponse | null;
  serialPorts: SerialPortInfo[];
  running: boolean;
  previewingCamera: boolean;
  runningCamera: boolean;
  checkingTemperature: boolean;
  loadingSerialPorts: boolean;
  onStartRun: () => void;
  onStopRun: () => void;
  onPreviewRealCamera: () => void;
  onStartRealCameraRun: () => void;
  onReadCurrentTemperature: () => void;
  onRefreshSerialPorts: () => void;
}) {
  const manifest = runResult?.run_manifest ?? null;
  const analysis = liveRun?.analysis ?? runResult?.analysis_result ?? null;
  const latestRunMode = manifest?.dataset_id === "real_camera" ? "Real camera run" : "Live offline run";
  const remainingFrames = Math.max(0, dataset.frame_count - startFrame + 1);
  const latestDetection =
    liveRun?.detectionResult ??
    (manifest?.detection_results.length
      ? manifest.detection_results[manifest.detection_results.length - 1]
      : null);
  const latestFrameUrl =
    liveRun?.frameUrl ??
    (latestDetection
      ? frameIndexImageUrl(dataset.id, latestDetection.frame_index, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH })
      : "");
  return (
    <div className="pageGrid runGrid">
      <section className="toolPanel">
        <h2>Run</h2>
        <div className="controlStack">
          <h3>Live Offline</h3>
          <dl className="metricGrid compact">
            <Metric label="Dataset" value={dataset.id} />
            <Metric label="Detector" value={measurement.detector} />
            <Metric label="Start frame" value={startFrame.toLocaleString()} />
            <Metric label="Frame budget" value={remainingFrames.toLocaleString()} />
            <Metric label="Target FPS" value={measurement.detector_config.live_offline_fps ?? 8} />
            <Metric label="Progress" value={liveRun ? `${liveRun.processedFrames.toLocaleString()} / ${liveRun.totalFrames.toLocaleString()}` : "Idle"} />
            <Metric label="Current frame" value={liveRun?.frameIndex.toLocaleString() ?? "None"} />
            <Metric label="Distance" value={formatDistance(latestDetection)} />
            <Metric label="Temperature" value={formatTemperature(latestDetection)} />
            <Metric label="Sync" value={latestDetection?.temperature_sync_status ?? "None"} />
          </dl>
          <div className="buttonPair">
            <button className="primaryButton" disabled={running} onClick={onStartRun} type="button">
              <Play size={16} aria-hidden="true" />
              {running ? "Running" : "Start full offline run"}
            </button>
            <button className="secondaryButton" disabled={!running} onClick={onStopRun} type="button">
              <Square size={16} aria-hidden="true" />
              Stop
            </button>
          </div>
        </div>
        <div className="controlStack">
          <h3>Temperature Control</h3>
          <dl className="metricGrid compact">
            <Metric label="Current" value={formatTemperatureStatus(temperatureStatus) || formatTemperature(latestDetection)} />
            <Metric label="Target" value={formatTemperatureValue(measurement.detector_config.target_temperature_celsius ?? null)} />
            <Metric label="Power" value={`${(measurement.detector_config.temperature_power_percent ?? 100).toFixed(0)} %`} />
            <Metric label="Source" value={temperatureStatus?.reading.source ?? latestDetection?.temperature_source ?? "None"} />
          </dl>
          <div className="buttonPair">
            <button className="secondaryButton" disabled={checkingTemperature} onClick={onReadCurrentTemperature} type="button">
              <Thermometer size={16} aria-hidden="true" />
              {checkingTemperature ? "Reading" : "Read temp"}
            </button>
            <button className="secondaryButton" disabled={loadingSerialPorts} onClick={onRefreshSerialPorts} type="button">
              <Usb size={16} aria-hidden="true" />
              {loadingSerialPorts ? "Scanning" : "Ports"}
            </button>
          </div>
          {serialPorts.length ? (
            <div className="portList">
              {serialPorts.map((port) => (
                <span key={port.device} title={port.hwid || port.description}>
                  {port.device}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="controlStack">
          <h3>Real Camera</h3>
          <dl className="metricGrid compact">
            <Metric label="Profile" value="Hik MVS · Mono8" />
            <Metric label="Status" value={cameraPreview?.camera_status ?? "Not previewed"} />
            <Metric label="Frame shape" value={cameraPreview ? cameraPreview.shape.join(" × ") : "None"} />
            <Metric label="Timestamp" value={cameraPreview?.timestamp_ms ?? "None"} />
          </dl>
          <div className="buttonPair">
            <button className="secondaryButton" disabled={previewingCamera} onClick={onPreviewRealCamera} type="button">
              <Camera size={16} aria-hidden="true" />
              {previewingCamera ? "Previewing" : "Preview"}
            </button>
            <button className="primaryButton" disabled={runningCamera} onClick={onStartRealCameraRun} type="button">
              <Play size={16} aria-hidden="true" />
              {runningCamera ? "Running" : "Run"}
            </button>
          </div>
          {cameraPreviewUrl ? (
            <figure className="cameraPreview">
              <figcaption>Preview frame</figcaption>
              <img src={cameraPreviewUrl} alt="Real camera preview frame" />
            </figure>
          ) : null}
        </div>
      </section>
      <div className="runDetailStack">
        {latestFrameUrl && latestDetection ? (
          <FrameCanvas
            title={`${dataset.id} · live frame ${latestDetection.frame_index}`}
            imageUrl={latestFrameUrl}
            sourceShape={summary.first_frame.shape}
            roi={measurement.roi}
            abPoints={latestDetection.ab_points}
            debugArtifacts={latestDetection.debug_artifacts}
            readOnly
          />
        ) : null}
        {analysis ? (
        <section className="toolPanel">
          <h2>{liveRun?.status === "running" ? "Live Curves" : "Run Result"}</h2>
          <dl className="metricGrid">
            <Metric label="Mode" value={liveRun ? "Live offline run" : latestRunMode} />
            <Metric label="Run ID" value={liveRun?.runId ?? manifest?.run_id ?? "None"} />
            <Metric label="Frames saved" value={manifest?.frame_records.length ?? liveRun?.processedFrames ?? 0} />
            <Metric label="Detections" value={manifest?.detection_results.length ?? liveRun?.analysis.all_frames.length ?? 0} />
            <Metric label="Temp-distance points" value={analysis.temperature_distance.length} />
            <Metric label="AFAS status" value={readAfasStatus(analysis)} />
          </dl>
          <CurveGrid analysis={analysis} variant="run" />
        </section>
        ) : null}
      </div>
    </div>
  );
}

function AnalysisPage({
  probe,
  runResult,
  liveRun
}: {
  probe: ProbeResponse | null;
  runResult: RunResponse | null;
  liveRun: LiveRunState | null;
}) {
  const baseAnalysis = runResult?.analysis_result ?? (liveRun?.status === "stopped" ? liveRun.analysis : null);
  const selectedRunId = runResult?.run_manifest.run_id ?? (liveRun?.status === "stopped" ? liveRun.runId : null);
  const [analysisOverride, setAnalysisOverride] = useState<AnalysisResult | null>(null);
  const analysis = analysisOverride ?? baseAnalysis;
  const [artifacts, setArtifacts] = useState<ExportArtifact[]>(analysis?.export_artifacts ?? []);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    setAnalysisOverride(null);
  }, [selectedRunId]);

  useEffect(() => {
    setArtifacts(analysis?.export_artifacts ?? []);
    setExportError("");
  }, [analysis]);

  async function exportCurrentRun() {
    if (!selectedRunId) return;
    setExporting(true);
    setExportError("");
    try {
      setArtifacts(await createRunExports(selectedRunId));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="pageGrid runGrid">
      <section className="toolPanel">
        <h2>Analysis / Export</h2>
        <dl className="metricGrid compact">
          <Metric label="Run" value={selectedRunId ?? "No run selected"} />
          <Metric label="Latest probe" value={probe?.detection_result.distance_px ? `${probe.detection_result.distance_px.toFixed(2)} px` : "None"} />
          <Metric label="Formal temp-distance points" value={analysis?.temperature_distance.length ?? 0} />
          <Metric label="AFAS status" value={readAfasStatus(analysis)} />
        </dl>
        <button
          className="primaryButton spaced"
          disabled={!selectedRunId || exporting}
          onClick={exportCurrentRun}
          type="button"
        >
          <Download size={16} aria-hidden="true" />
          {exporting ? "Exporting" : "Export"}
        </button>
        {exportError ? <div className="inlineError">{exportError}</div> : null}
        {artifacts.length ? (
          <div className="artifactList">
            {artifacts.map((artifact) => (
              <a href={artifactDownloadUrl(artifact)} key={artifact.artifact_id}>
                {artifact.artifact_type}
              </a>
            ))}
          </div>
        ) : null}
      </section>
      {analysis ? (
        <section className="toolPanel">
          <h2>{selectedRunId ? `Analysis · ${selectedRunId}` : "Analysis"}</h2>
          <AfasResultPanel analysis={analysis} />
          <AfasParameterPanel
            analysis={analysis}
            runId={selectedRunId}
            onAnalysisUpdated={setAnalysisOverride}
          />
          <CurveGrid analysis={analysis} variant="analysis" />
        </section>
      ) : null}
    </div>
  );
}

function AfasResultPanel({ analysis }: { analysis: AnalysisResult }) {
  const afas = analysis.afas_analysis ?? {};
  const result = readRecord(afas.result);
  const fit = readRecord(afas.fit);
  const status = typeof afas.result_status === "string" ? afas.result_status : "unavailable";
  return (
    <dl className="metricGrid compact afasResultGrid">
      <Metric label="Status" value={status} />
      <Metric label="As" value={formatOptionalNumber(result.As, " °C")} />
      <Metric label="Af-tan" value={formatOptionalNumber(result.Af_tan, " °C")} />
      <Metric label="ΔT" value={formatDeltaT(result.As, result.Af_tan)} />
      <Metric label="Max slope" value={formatOptionalNumber(result.max_slope_temp, " °C")} />
      <Metric label="Outliers" value={typeof afas.outlier_count === "number" ? afas.outlier_count : "None"} />
      <Metric label="Low range" value={formatRange(readRecord(afas.parameters).resolved_low_range_celsius)} />
      <Metric label="High range" value={formatRange(readRecord(afas.parameters).resolved_high_range_celsius)} />
      <Metric label="Tangent slope" value={formatOptionalNumber(readRecord(fit.tangent).slope, " px/°C")} />
    </dl>
  );
}

function AfasParameterPanel({
  analysis,
  runId,
  onAnalysisUpdated
}: {
  analysis: AnalysisResult;
  runId: string | null;
  onAnalysisUpdated: (analysis: AnalysisResult) => void;
}) {
  const [preprocessing, setPreprocessing] = useState<AfasPreprocessingParameters>(() =>
    readAfasPreprocessingParameters(analysis)
  );
  const [tangent, setTangent] = useState<AfasAnalysisFormState>(() => readAfasAnalysisForm(analysis));
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState("");
  const preprocessingPayload = readRecord(analysis.afas_preprocessing);
  const smoothed = readRecord(preprocessingPayload.smoothed);
  const outlierRepair = readRecord(preprocessingPayload.outlier_repair);
  const warnings = readAfasWarnings(analysis);

  useEffect(() => {
    setPreprocessing(readAfasPreprocessingParameters(analysis));
    setTangent(readAfasAnalysisForm(analysis));
    setError("");
  }, [analysis]);

  function patchPreprocessing(patch: Partial<AfasPreprocessingParameters>) {
    setPreprocessing((current) => ({ ...current, ...patch }));
  }

  function patchRange(
    key: "low_range_celsius" | "high_range_celsius",
    index: 0 | 1,
    value: number | null
  ) {
    setTangent((current) => {
      const nextRange: [number | null, number | null] = [current[key][0], current[key][1]];
      nextRange[index] = value;
      return { ...current, [key]: nextRange };
    });
  }

  async function recalculateAnalysis() {
    if (!runId) return;
    setRecalculating(true);
    setError("");
    try {
      const nextPreprocessing = normalizeAfasPreprocessingParameters(preprocessing);
      const nextTangent = normalizeAfasAnalysisParameters(tangent);
      const nextAnalysis = await recomputeRunAnalysis(runId, {
        afas_preprocessing_parameters: nextPreprocessing,
        afas_analysis_parameters: nextTangent
      });
      onAnalysisUpdated(nextAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div className="analysisParameterPanel">
      <div className="analysisParameterHeader">
        <h3>
          <Settings size={15} aria-hidden="true" />
          AFAS Parameters
        </h3>
        <button
          className="secondaryButton analysisRecalculateButton"
          disabled={!runId || recalculating}
          onClick={recalculateAnalysis}
          type="button"
        >
          <RefreshCcw size={15} aria-hidden="true" />
          {recalculating ? "Recalculating" : "Recalculate"}
        </button>
      </div>
      <div className="analysisControlGrid">
        <fieldset>
          <legend>Preprocessing</legend>
          <label className="field checkboxField">
            <input
              checked={preprocessing.group_by_temperature}
              onChange={(event) => patchPreprocessing({ group_by_temperature: event.target.checked })}
              type="checkbox"
            />
            <span>Group by temperature</span>
          </label>
          <div className="twoColumnControls">
            <NumberField
              label="Outlier window"
              min={3}
              value={preprocessing.outlier_window}
              onChange={(value) => patchPreprocessing({ outlier_window: Math.max(3, Math.round(value)) })}
            />
            <NumberField
              label="Outlier threshold"
              min={0}
              step={0.1}
              value={preprocessing.outlier_threshold}
              onChange={(value) => patchPreprocessing({ outlier_threshold: Math.max(0, value) })}
            />
            <NumberField
              label="Outlier iterations"
              min={0}
              value={preprocessing.outlier_max_iterations}
              onChange={(value) => patchPreprocessing({ outlier_max_iterations: Math.max(0, Math.round(value)) })}
            />
            <NumberField
              label="Savgol window"
              min={3}
              value={preprocessing.savgol_window_length}
              onChange={(value) => patchPreprocessing({ savgol_window_length: Math.max(3, Math.round(value)) })}
            />
            <NumberField
              label="Savgol polyorder"
              min={1}
              value={preprocessing.savgol_polyorder}
              onChange={(value) => patchPreprocessing({ savgol_polyorder: Math.max(1, Math.round(value)) })}
            />
          </div>
        </fieldset>
        <fieldset>
          <legend>Tangent</legend>
          <div className="twoColumnControls">
            <NullableNumberField
              label="Low start °C"
              step={0.1}
              value={tangent.low_range_celsius[0]}
              onChange={(value) => patchRange("low_range_celsius", 0, value)}
            />
            <NullableNumberField
              label="Low end °C"
              step={0.1}
              value={tangent.low_range_celsius[1]}
              onChange={(value) => patchRange("low_range_celsius", 1, value)}
            />
            <NullableNumberField
              label="High start °C"
              step={0.1}
              value={tangent.high_range_celsius[0]}
              onChange={(value) => patchRange("high_range_celsius", 0, value)}
            />
            <NullableNumberField
              label="High end °C"
              step={0.1}
              value={tangent.high_range_celsius[1]}
              onChange={(value) => patchRange("high_range_celsius", 1, value)}
            />
            <NumberField
              label="Tangent offset"
              value={tangent.tangent_offset}
              onChange={(value) => setTangent((current) => ({ ...current, tangent_offset: Math.round(value) }))}
            />
          </div>
        </fieldset>
      </div>
      <dl className="metricGrid compact analysisParameterMetrics">
        <Metric label="Effective Savgol window" value={formatOptionalInteger(smoothed.effective_savgol_window_length)} />
        <Metric label="Smoothed points" value={formatArrayCount(smoothed.temperature_celsius)} />
        <Metric label="Outlier count" value={formatOptionalInteger(outlierRepair.outlier_count)} />
      </dl>
      {warnings.length ? (
        <ul className="analysisWarningList">
          {warnings.map((warning, index) => (
            <li key={`${warning}-${index}`}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {error ? <div className="inlineError">{error}</div> : null}
    </div>
  );
}

function CurveGrid({ analysis, variant }: { analysis: AnalysisResult; variant: "run" | "analysis" }) {
  const specs = variant === "run" ? buildRunCurveSpecs(analysis) : buildAnalysisCurveSpecs(analysis);
  return (
    <div className={`curveGrid ${variant === "run" ? "curveGridTwo" : "curveGridAnalysis"}`}>
      {specs.map((spec) => (
        <CurveView key={spec.key} spec={spec} />
      ))}
    </div>
  );
}

function CurveView({ spec }: { spec: CurveSpec }) {
  const width = 360;
  const height = 220;
  const model = buildCurveViewModel(spec, width, height);
  const titleId = `curve-title-${spec.key}`;
  return (
    <figure className="curveView">
      <figcaption id={titleId}>{spec.title}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}>
        <rect className="curveFrame" x={0} y={0} width={width} height={height} rx={6} />
        {model.xTicks.map((tick, index) => (
          <line
            className="curveGridLine"
            key={`x-grid-${index}-${tick.value}`}
            x1={tick.position}
            x2={tick.position}
            y1={model.plot.top}
            y2={model.plot.bottom}
          />
        ))}
        {model.yTicks.map((tick, index) => (
          <line
            className="curveGridLine"
            key={`y-grid-${index}-${tick.value}`}
            x1={model.plot.left}
            x2={model.plot.right}
            y1={tick.position}
            y2={tick.position}
          />
        ))}
        <line className="curveAxis" x1={model.plot.left} x2={model.plot.right} y1={model.plot.bottom} y2={model.plot.bottom} />
        <line className="curveAxis" x1={model.plot.left} x2={model.plot.left} y1={model.plot.top} y2={model.plot.bottom} />
        {model.xTicks.map((tick, index) => (
          <g key={`x-tick-${index}-${tick.value}`}>
            <line className="curveTick" x1={tick.position} x2={tick.position} y1={model.plot.bottom} y2={model.plot.bottom + 5} />
            <text className="curveTickLabel" x={tick.position} y={model.plot.bottom + 19} textAnchor="middle">
              {tick.label}
            </text>
          </g>
        ))}
        {model.yTicks.map((tick, index) => (
          <g key={`y-tick-${index}-${tick.value}`}>
            <line className="curveTick" x1={model.plot.left - 5} x2={model.plot.left} y1={tick.position} y2={tick.position} />
            <text className="curveTickLabel" x={model.plot.left - 9} y={tick.position + 4} textAnchor="end">
              {tick.label}
            </text>
          </g>
        ))}
        <text className="curveAxisLabel" x={(model.plot.left + model.plot.right) / 2} y={height - 9} textAnchor="middle">
          {model.xAxisLabel}
        </text>
        <text
          className="curveAxisLabel"
          x={-(model.plot.top + model.plot.bottom) / 2}
          y={15}
          textAnchor="middle"
          transform="rotate(-90)"
        >
          {model.yAxisLabel}
        </text>
        {model.referencePoints.map((point, index) => (
          <circle
            className="curveReferencePoint"
            cx={point.x}
            cy={point.y}
            key={`reference-${index}`}
            r={2}
          />
        ))}
        {model.overlayLines.map((line) => (
          <line
            className={`curveOverlayLine curveOverlayLine--${line.kind}`}
            key={`overlay-line-${line.kind}`}
            x1={line.x1}
            x2={line.x2}
            y1={line.y1}
            y2={line.y2}
          />
        ))}
        {model.hasPoints ? (
          <polyline className="curveLine" points={model.polyline} style={{ stroke: spec.color }} />
        ) : (
          <text className="curveEmptyText" x={(model.plot.left + model.plot.right) / 2} y={(model.plot.top + model.plot.bottom) / 2} textAnchor="middle">
            No data
          </text>
        )}
        {model.overlayMarkers.map((marker) => {
          const labelX = marker.x > model.plot.right - 56 ? marker.x - 6 : marker.x + 6;
          const labelY = marker.y < model.plot.top + 12 ? marker.y + 14 : marker.y - 5;
          return (
            <g className={`curveMarker curveMarker--${marker.kind}`} key={`marker-${marker.kind}`}>
              <line x1={marker.x} x2={marker.x} y1={model.plot.top} y2={model.plot.bottom} />
              <circle cx={marker.x} cy={marker.y} r={4} />
              <text x={labelX} y={labelY} textAnchor={labelX < marker.x ? "end" : "start"}>
                {marker.label}
              </text>
            </g>
          );
        })}
      </svg>
      {model.referencePoints.length || model.overlayLines.length || model.overlayMarkers.length ? (
        <div className="curveLegend">
          {model.referencePoints.length ? <span className="curveLegendItem curveLegendItem--raw">Raw</span> : null}
          <span className="curveLegendItem curveLegendItem--smooth">Smoothed</span>
          {model.overlayLines.map((line) => (
            <span className={`curveLegendItem curveLegendItem--${line.kind}`} key={`legend-${line.kind}`}>
              {line.label}
            </span>
          ))}
        </div>
      ) : null}
    </figure>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function createDefaultMeasurement(
  dataset: OfflineDatasetListItem,
  shape: number[]
): MeasurementDefinition {
  const height = shape[0] ?? 1;
  const width = shape[1] ?? 1;
  return {
    measurement_id: `${dataset.id}-default`,
    object_class: dataset.object_class,
    detector: dataset.default_detector,
    width_mode: "max_width",
    measurement_coordinates: "source_pixel",
    roi: {
      type: "rotated_rect",
      center_x: width / 2,
      center_y: height / 2,
      width: width * 0.62,
      height: height * 0.28,
      angle_deg: 0
    },
    detector_config: DEFAULT_CONFIG
  };
}

function createInitialLiveRun(datasetId: string, startFrame: number, frameCount: number): LiveRunState {
  const totalFrames = Math.max(1, frameCount - startFrame + 1);
  const runId = `pending-${datasetId}-${Date.now()}`;
  return {
    runId,
    datasetId,
    status: "running",
    frameIndex: startFrame,
    frameUrl: frameIndexImageUrl(datasetId, startFrame, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH }),
    frameCount,
    totalFrames,
    processedFrames: 0,
    detectionResult: null,
    analysis: emptyAnalysis(runId)
  };
}

function updateLiveRunFromFrame(current: LiveRunState | null, event: LiveOfflineFrameEvent): LiveRunState {
  const runId = event.run_id;
  const previous = current ?? {
    runId,
    datasetId: event.dataset_id,
    status: "running" as const,
    frameIndex: event.frame_index,
    frameUrl: apiUrlFromPath(event.frame_url, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH }),
    frameCount: event.frame_count,
    totalFrames: event.total_frames,
    processedFrames: 0,
    detectionResult: null,
    analysis: emptyAnalysis(runId)
  };
  const analysis = appendLiveAnalysis(
    previous.analysis,
    event.detection_result,
    event.curve_points,
    event.afas_preprocessing,
    event.afas_analysis,
    runId
  );
  return {
    ...previous,
    runId,
    datasetId: event.dataset_id,
    status: "running",
    frameIndex: event.frame_index,
    frameUrl: apiUrlFromPath(event.frame_url, { maxWidth: LIVE_FRAME_DISPLAY_MAX_WIDTH }),
    frameCount: event.frame_count,
    totalFrames: event.total_frames,
    processedFrames: event.processed_frames,
    detectionResult: event.detection_result,
    analysis
  };
}

function emptyAnalysis(runId: string): AnalysisResult {
  return {
    analysis_id: `${runId}-live-preview`,
    run_id: runId,
    all_frames: [],
    distance_time: [],
    temperature_time: [],
    temperature_distance: [],
    afas_preprocessing: {},
    afas_analysis: {},
    export_artifacts: [],
    created_at: new Date().toISOString()
  };
}

function appendLiveAnalysis(
  analysis: AnalysisResult,
  detection: DetectionResult,
  curvePoints: LiveOfflineFrameEvent["curve_points"],
  afasPreprocessing: LiveOfflineFrameEvent["afas_preprocessing"],
  afasAnalysis: LiveOfflineFrameEvent["afas_analysis"],
  runId: string
): AnalysisResult {
  return {
    ...analysis,
    run_id: runId,
    analysis_id: `${runId}-live-preview`,
    all_frames: [...analysis.all_frames, detection],
    distance_time: appendCurvePoint(analysis.distance_time, curvePoints.distance_time),
    temperature_time: appendCurvePoint(analysis.temperature_time, curvePoints.temperature_time),
    temperature_distance: appendCurvePoint(analysis.temperature_distance, curvePoints.temperature_distance),
    afas_preprocessing: mergeLiveAfasPreprocessing(analysis.afas_preprocessing, afasPreprocessing),
    afas_analysis: afasAnalysis
  };
}

function appendCurvePoint(points: CurvePoint[], point: CurvePoint | null): CurvePoint[] {
  return point ? [...points, point] : points;
}

function mergeLiveAfasPreprocessing(
  previous: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const incomingRecord = readRecord(incoming);
  if (Object.keys(readRecord(incomingRecord.smoothed)).length > 0) {
    return incomingRecord;
  }

  const previousRecord = readRecord(previous);
  if (Object.keys(readRecord(previousRecord.smoothed)).length === 0) {
    return incomingRecord;
  }

  return {
    ...previousRecord,
    preview_status: incomingRecord.preview_status ?? previousRecord.preview_status,
    point_count: incomingRecord.point_count ?? previousRecord.point_count,
    temperature_distance_point_count:
      incomingRecord.temperature_distance_point_count ?? previousRecord.temperature_distance_point_count,
    preview_interval_frames: incomingRecord.preview_interval_frames ?? previousRecord.preview_interval_frames
  };
}

function formatDistance(result: DetectionResult | null): string {
  return result?.distance_px == null ? "None" : `${result.distance_px.toFixed(2)} px`;
}

function formatTemperature(result: DetectionResult | null): string {
  return result?.temperature_celsius == null ? "None" : `${result.temperature_celsius.toFixed(2)} °C`;
}

function formatTemperatureValue(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "None" : `${value.toFixed(2)} °C`;
}

function formatTemperatureStatus(status: TemperatureStatusResponse | null): string {
  const value = status?.reading.celsius;
  return value == null || !Number.isFinite(value) ? "" : `${value.toFixed(2)} °C`;
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.max(low, Math.min(high, value));
}

async function waitForStoppedRun(runId: string): Promise<RunResponse> {
  let lastError: unknown = null;
  await sleep(600);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const availability = await getRunAvailability(runId);
      if (availability.exists) {
        return await getRun(runId);
      }
      lastError = new Error(`Run is not available yet: ${runId}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(250);
  }
  throw lastError instanceof Error ? lastError : new Error(`Run not available after stop: ${runId}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readAfasStatus(analysis: AnalysisResult | null): string {
  if (!analysis) return "None";
  const status = analysis.afas_analysis.result_status;
  return typeof status === "string" ? status : "unavailable";
}

function readAfasPreprocessingParameters(analysis: AnalysisResult): AfasPreprocessingParameters {
  const preprocessing = readRecord(analysis.afas_preprocessing);
  const parameters = readRecord(preprocessing.parameters);
  return normalizeAfasPreprocessingParameters({
    group_by_temperature: readBoolean(parameters.group_by_temperature, DEFAULT_AFAS_PREPROCESSING_PARAMETERS.group_by_temperature),
    outlier_window: readNumber(parameters.outlier_window, DEFAULT_AFAS_PREPROCESSING_PARAMETERS.outlier_window),
    outlier_threshold: readNumber(parameters.outlier_threshold, DEFAULT_AFAS_PREPROCESSING_PARAMETERS.outlier_threshold),
    outlier_max_iterations: readNumber(parameters.outlier_max_iterations, DEFAULT_AFAS_PREPROCESSING_PARAMETERS.outlier_max_iterations),
    savgol_window_length: readNumber(parameters.savgol_window_length, DEFAULT_AFAS_PREPROCESSING_PARAMETERS.savgol_window_length),
    savgol_polyorder: readNumber(parameters.savgol_polyorder, DEFAULT_AFAS_PREPROCESSING_PARAMETERS.savgol_polyorder)
  });
}

function readAfasAnalysisForm(analysis: AnalysisResult): AfasAnalysisFormState {
  const afas = readRecord(analysis.afas_analysis);
  const parameters = readRecord(afas.parameters);
  return {
    low_range_celsius: readNullableRange(parameters.low_range_celsius),
    high_range_celsius: readNullableRange(parameters.high_range_celsius),
    tangent_offset: readNumber(parameters.tangent_offset, DEFAULT_AFAS_ANALYSIS_FORM.tangent_offset)
  };
}

function normalizeAfasPreprocessingParameters(parameters: AfasPreprocessingParameters): AfasPreprocessingParameters {
  return {
    group_by_temperature: parameters.group_by_temperature,
    outlier_window: Math.max(3, Math.round(parameters.outlier_window)),
    outlier_threshold: Math.max(0, Number(parameters.outlier_threshold)),
    outlier_max_iterations: Math.max(0, Math.round(parameters.outlier_max_iterations)),
    savgol_window_length: Math.max(3, Math.round(parameters.savgol_window_length)),
    savgol_polyorder: Math.max(1, Math.round(parameters.savgol_polyorder))
  };
}

function normalizeAfasAnalysisParameters(parameters: AfasAnalysisFormState): AfasAnalysisParameters {
  return {
    low_range_celsius: completeRange(parameters.low_range_celsius),
    high_range_celsius: completeRange(parameters.high_range_celsius),
    tangent_offset: Math.round(parameters.tangent_offset)
  };
}

function completeRange(range: [number | null, number | null]): [number, number] | null {
  const [start, end] = range;
  if (start == null || end == null || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  return start <= end ? [start, end] : [end, start];
}

function readNullableRange(value: unknown): [number | null, number | null] {
  if (!Array.isArray(value) || value.length !== 2) return [null, null];
  const start = typeof value[0] === "number" && Number.isFinite(value[0]) ? value[0] : null;
  const end = typeof value[1] === "number" && Number.isFinite(value[1]) ? value[1] : null;
  return [start, end];
}

function readAfasWarnings(analysis: AnalysisResult): string[] {
  const preprocessing = readRecord(analysis.afas_preprocessing);
  const afas = readRecord(analysis.afas_analysis);
  return [...readStringArray(preprocessing.warnings), ...readStringArray(afas.warnings)];
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function formatOptionalNumber(value: unknown, suffix = ""): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}${suffix}` : "None";
}

function formatOptionalInteger(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}` : "None";
}

function formatArrayCount(value: unknown): string {
  return Array.isArray(value) ? value.length.toLocaleString() : "0";
}

function formatDeltaT(start: unknown, end: unknown): string {
  if (typeof start !== "number" || typeof end !== "number") return "None";
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "None";
  return `${(end - start).toFixed(2)} °C`;
}

function formatRange(value: unknown): string {
  if (!Array.isArray(value) || value.length !== 2) return "None";
  const [start, end] = value;
  if (typeof start !== "number" || typeof end !== "number") return "None";
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "None";
  return `${start.toFixed(2)}-${end.toFixed(2)} °C`;
}

function roundForInput(value: number): number {
  return Math.round(value * 100) / 100;
}

createRoot(document.getElementById("root")!).render(<App />);
