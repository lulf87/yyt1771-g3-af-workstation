import { useEffect, useRef, useState } from "react";

import {
  readCameraExposure,
  updateCameraExposure,
  type CameraExposureIdentity,
  type CameraExposureState
} from "../../api/client";
import {
  createExposureCommitCoordinator,
  scheduleExposureDraft,
  submitExposureDraft,
  type ExposureCommitCoordinator
} from "../../exposureControl";
import { uiText, type UiLanguage } from "../../i18n";

export type ExposureControlProps = {
  camera: CameraExposureIdentity | null;
  disabled: boolean;
  runActive: boolean;
  language: UiLanguage;
};

type ExposureStatus = "loading" | "idle" | "applying" | "saved" | "error";

type LoadedCapability = {
  cameraKey: string;
  value: CameraExposureState;
};

function cameraIdentityKey(camera: CameraExposureIdentity | null): string {
  return camera
    ? JSON.stringify([
        camera.backend,
        camera.transport,
        camera.model,
        camera.serial_number,
        camera.ip,
        camera.user_defined_name
      ])
    : "saved-camera";
}

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
  language
}: ExposureControlProps) {
  const cameraKey = cameraIdentityKey(camera);
  const [loadedCapability, setLoadedCapability] = useState<LoadedCapability | null>(null);
  const capability =
    !runActive && loadedCapability?.cameraKey === cameraKey ? loadedCapability.value : null;
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<ExposureStatus>("loading");
  const [error, setError] = useState("");
  const confirmedRef = useRef<number | null>(null);
  const latestIntentRef = useRef<number | null>(null);
  const lastRequestedRef = useRef<number | null>(null);
  const coordinatorRef = useRef<ExposureCommitCoordinator | null>(null);
  const t = (text: string) => uiText(language, text);

  useEffect(() => {
    if (runActive) {
      coordinatorRef.current = null;
      return;
    }

    const coordinator = createExposureCommitCoordinator({
      delayMs: 200,
      apply: (value, signal) => updateCameraExposure(value, camera, signal),
      onPending: (value) => {
        lastRequestedRef.current = value;
        setStatus("applying");
        setError("");
      },
      onSuccess: (actual, response) => {
        confirmedRef.current = actual;
        latestIntentRef.current = null;
        lastRequestedRef.current = null;
        setLoadedCapability({ cameraKey, value: response });
        setDraft(String(actual));
        setStatus("saved");
        setError("");
      },
      onError: (reason) => {
        latestIntentRef.current = null;
        lastRequestedRef.current = null;
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
  }, [cameraKey, runActive]);

  useEffect(() => {
    const controller = new AbortController();
    confirmedRef.current = null;
    latestIntentRef.current = null;
    lastRequestedRef.current = null;
    setError("");

    if (runActive) {
      setLoadedCapability(null);
      setDraft("");
      setStatus("idle");
      return () => controller.abort();
    }

    setLoadedCapability(null);
    setDraft("");
    setStatus("loading");
    readCameraExposure(camera, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        const actual =
          typeof next.actual_us === "number" && Number.isFinite(next.actual_us)
            ? next.actual_us
            : null;
        confirmedRef.current = actual;
        setLoadedCapability({ cameraKey, value: next });
        setDraft(actual === null ? "" : String(actual));
        setStatus("idle");
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setStatus("error");
        setError(errorMessage(reason));
      });

    return () => controller.abort();
  }, [cameraKey, runActive]);

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
      coordinator
    });
    if (result.kind === "rejected") {
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
      setDraft(String(result.value));
      setStatus("idle");
      setError("");
      return;
    }
    if (result.kind === "submitted") {
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
