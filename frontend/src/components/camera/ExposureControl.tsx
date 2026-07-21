import { useEffect, useRef, useState } from "react";

import {
  readCameraExposure,
  updateCameraExposure,
  type CameraExposureIdentity,
  type CameraExposureState
} from "../../api/client";
import {
  cameraExposureIdentityKey,
  createCameraExposureReadSession,
  createExposureBusyTracker,
  createExposureCommitCoordinator,
  createExposureReadLifetime,
  scheduleExposureDraft,
  submitExposureDraft,
  type ExposureBusyTracker,
  type ExposureCommitCoordinator
} from "../../exposureControl";
import {
  createCameraBusyOwnerToken,
  type CameraBusyOwnerToken
} from "../../cameraOperationOwnership";
import { uiText, type UiLanguage } from "../../i18n";

export type ExposureControlProps = {
  camera: CameraExposureIdentity | null;
  disabled: boolean;
  runActive: boolean;
  language: UiLanguage;
  onBusyChange: (owner: CameraBusyOwnerToken, busy: boolean) => void;
  onReadSettled?: (readKey: string) => void;
  readKey?: string | null;
};

type ExposureStatus = "loading" | "idle" | "applying" | "saved" | "error";

type LoadedCapability = {
  cameraKey: string;
  value: CameraExposureState;
};

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function exposureValueInRange(value: number, capability: CameraExposureState): boolean {
  if (!Number.isFinite(value)) return false;
  if (capability.minimum_us !== null && value < capability.minimum_us) return false;
  if (capability.maximum_us !== null && value > capability.maximum_us) return false;
  return true;
}

export function ExposureControl({
  camera,
  disabled,
  runActive,
  language,
  onBusyChange,
  onReadSettled,
  readKey
}: ExposureControlProps) {
  const cameraKey = cameraExposureIdentityKey(camera);
  const [busyOwner] = useState(() => createCameraBusyOwnerToken());
  const [exposureReadSession] = useState(() => createCameraExposureReadSession());
  const [loadedCapability, setLoadedCapability] = useState<LoadedCapability | null>(null);
  const capability =
    !runActive && loadedCapability?.cameraKey === cameraKey ? loadedCapability.value : null;
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<ExposureStatus>("loading");
  const [error, setError] = useState("");
  const confirmedRef = useRef<number | null>(null);
  const latestIntentRef = useRef<number | null>(null);
  const lastRequestedRef = useRef<number | null>(null);
  const compensationPendingRef = useRef(false);
  const coordinatorRef = useRef<ExposureCommitCoordinator | null>(null);
  const onBusyChangeRef = useRef(onBusyChange);
  const onReadSettledRef = useRef(onReadSettled);
  const exposureBusyTrackerRef = useRef<ExposureBusyTracker | null>(null);
  if (exposureBusyTrackerRef.current === null) {
    exposureBusyTrackerRef.current = createExposureBusyTracker((busy) => {
      onBusyChangeRef.current(busyOwner, busy);
    });
  }
  const t = (text: string) => uiText(language, text);

  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  }, [onBusyChange]);

  useEffect(() => {
    onReadSettledRef.current = onReadSettled;
  }, [onReadSettled]);

  useEffect(() => {
    let finishWriteBusy: (() => void) | null = null;
    const coordinator = createExposureCommitCoordinator({
      delayMs: 200,
      apply: (value, signal) => updateCameraExposure(value, camera, signal),
      onBusyChange: (busy) => {
        if (busy && finishWriteBusy === null) {
          finishWriteBusy = exposureBusyTrackerRef.current!.begin();
        } else if (!busy && finishWriteBusy !== null) {
          finishWriteBusy();
          finishWriteBusy = null;
        }
      },
      onPending: (value) => {
        lastRequestedRef.current = value;
        setStatus("applying");
        setError("");
      },
      onSuccess: (actual, response, context) => {
        confirmedRef.current = actual;
        setLoadedCapability({ cameraKey, value: response });
        if (!context.isLatestIntent) return;
        latestIntentRef.current = null;
        lastRequestedRef.current = null;
        compensationPendingRef.current = false;
        setDraft(String(actual));
        setStatus("saved");
        setError("");
      },
      onError: (reason) => {
        latestIntentRef.current = null;
        lastRequestedRef.current = null;
        compensationPendingRef.current = false;
        setDraft(confirmedRef.current === null ? "" : String(confirmedRef.current));
        setStatus("error");
        setError(errorMessage(reason));
      },
      setTimer: (callback, delay) => setTimeout(callback, delay),
      clearTimer: (timer) => clearTimeout(timer)
    });
    coordinatorRef.current = coordinator;

    return () => {
      coordinator.dispose();
      if (coordinatorRef.current === coordinator) coordinatorRef.current = null;
    };
  }, [cameraKey]);

  useEffect(() => {
    if (!disabled && !runActive) return;
    coordinatorRef.current?.cancel();
  }, [disabled, runActive]);

  useEffect(() => {
    setError("");

    if (runActive) {
      setLoadedCapability(null);
      setDraft("");
      setStatus("idle");
      return;
    }
    if (disabled) return;

    confirmedRef.current = null;
    latestIntentRef.current = null;
    lastRequestedRef.current = null;
    compensationPendingRef.current = false;
    setLoadedCapability(null);
    setDraft("");
    setStatus("loading");
    const readLifetime = createExposureReadLifetime(exposureBusyTrackerRef.current!);
    const activeReadKey = readKey ?? cameraKey;
    void exposureReadSession
      .read(
        camera,
        (identity) => readCameraExposure(identity, readLifetime.signal),
        (result) => {
          if (result.status === "rejected") {
            setStatus("error");
            setError(errorMessage(result.reason));
            return;
          }
          const next = result.value;
          const actual =
            typeof next.actual_us === "number" && Number.isFinite(next.actual_us)
              ? next.actual_us
              : null;
          confirmedRef.current = actual;
          setLoadedCapability({ cameraKey, value: next });
          setDraft(actual === null ? "" : String(actual));
          setStatus("idle");
        },
        () => onReadSettledRef.current?.(activeReadKey)
      )
      .finally(readLifetime.dispose);

    return () => {
      exposureReadSession.invalidate();
      readLifetime.dispose();
    };
  }, [cameraKey, disabled, exposureReadSession, readKey, runActive]);

  const locked =
    disabled ||
    runActive ||
    capability === null ||
    !capability.supported ||
    capability.editable === false;

  function rejectDraft(message: string): void {
    setDraft(confirmedRef.current === null ? "" : String(confirmedRef.current));
    setStatus("error");
    setError(message);
  }

  function commitDraft(): void {
    if (locked || capability === null) return;
    const coordinator = coordinatorRef.current;
    if (coordinator === null) return;
    const result = submitExposureDraft({
      draft,
      minimumUs: capability.minimum_us,
      maximumUs: capability.maximum_us,
      confirmedUs: confirmedRef.current,
      latestIntentUs: latestIntentRef.current,
      lastRequestedUs: lastRequestedRef.current,
      compensationPending: compensationPendingRef.current,
      coordinator
    });
    if (
      result.kind === "rejected" ||
      result.kind === "cancelled" ||
      result.kind === "compensating" ||
      result.kind === "compensation_pending"
    ) {
      if (result.kind === "compensating") {
        compensationPendingRef.current = true;
        latestIntentRef.current = result.value;
      } else if (result.kind === "compensation_pending") {
        compensationPendingRef.current = true;
        latestIntentRef.current = result.value;
      } else {
        compensationPendingRef.current = false;
        latestIntentRef.current = null;
        lastRequestedRef.current = null;
      }
      rejectDraft(
        t(
          result.reason === "range"
            ? "Exposure is outside the camera range"
            : "Exposure must be a finite number"
        )
      );
      return;
    }
    if (result.kind === "unchanged") {
      compensationPendingRef.current = false;
      setDraft(String(result.value));
      setStatus("idle");
      setError("");
      return;
    }
    if (result.kind === "submitted") {
      compensationPendingRef.current = false;
      latestIntentRef.current = result.value;
    }
  }

  function statusMessage(): string {
    if (runActive) return t("Exposure locked during a formal run");
    if (status === "loading") return t("Loading exposure");
    if (capability && !capability.supported) {
      return t("Camera does not expose manual exposure control");
    }
    if (capability?.editable === false) {
      return capability.lock_reason || t("Exposure control is locked");
    }
    if (status === "applying") return t("Applying exposure");
    if (status === "saved") return t("Applied and saved");
    if (status === "error") {
      return error ? `${t("Exposure update failed")}: ${error}` : t("Exposure update failed");
    }
    return capability?.actual_us === null || capability?.actual_us === undefined
      ? t("No exposure value reported")
      : `${t("Current exposure")}: ${capability.actual_us} μs`;
  }

  return (
    <section className="cameraExposureControl" aria-label={t("Camera exposure")}>
      <div className="cameraExposureHeader">
        <strong>{t("Camera exposure")}</strong>
        {capability?.minimum_us !== null &&
        capability?.minimum_us !== undefined &&
        capability.maximum_us !== null ? (
          <small>
            {t("Camera range")}: {capability.minimum_us}–{capability.maximum_us} μs
          </small>
        ) : null}
      </div>
      {capability?.supported ? (
        <>
          <input
            aria-label={t("Camera exposure slider")}
            disabled={disabled || runActive || capability.editable === false}
            max={capability.maximum_us ?? undefined}
            min={capability.minimum_us ?? undefined}
            onChange={(event) => {
              const nextDraft = event.target.value;
              const value = Number(nextDraft);
              setDraft(nextDraft);
              if (exposureValueInRange(value, capability)) {
                const coordinator = coordinatorRef.current;
                if (coordinator !== null) {
                  scheduleExposureDraft({
                    value,
                    coordinator,
                    onIntent: (intent) => {
                      compensationPendingRef.current = false;
                      latestIntentRef.current = intent.latestIntentUs;
                      lastRequestedRef.current = intent.lastRequestedUs;
                    }
                  });
                }
              }
            }}
            step={capability.increment_us ?? "any"}
            type="range"
            value={draft}
          />
          <label className="cameraExposureNumber">
            <span>{t("Exposure (μs)")}</span>
            <input
              disabled={disabled || runActive || capability.editable === false}
              max={capability.maximum_us ?? undefined}
              min={capability.minimum_us ?? undefined}
              onBlur={commitDraft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitDraft();
                }
              }}
              step={capability.increment_us ?? "any"}
              type="number"
              value={draft}
            />
          </label>
        </>
      ) : null}
      <small
        className={`cameraExposureStatus cameraExposureStatus--${
          runActive ? "locked" : status
        }`}
        role={status === "error" ? "alert" : "status"}
      >
        {statusMessage()}
      </small>
    </section>
  );
}
