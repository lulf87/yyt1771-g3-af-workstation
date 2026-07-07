import type { SourceProvenance } from "../../api/client";
import { uiText, type UiLanguage } from "../../i18n";

export function SourceProvenanceBadge({
  provenance,
  language,
  compact = false,
  warning
}: {
  provenance: SourceProvenance | null | undefined;
  language: UiLanguage;
  compact?: boolean;
  warning?: string;
}) {
  const resolved = provenance ?? null;
  const kind = resolved?.overall_kind ?? "unknown";
  const label = provenanceLabel(resolved, language);
  const details = provenanceDetails(resolved, language);
  return (
    <div className={compact ? "sourceProvenanceBadge compact" : "sourceProvenanceBadge"} data-kind={kind}>
      <span className="sourceProvenanceKind">{label}</span>
      {details ? <span className="sourceProvenanceDetails">{details}</span> : null}
      {warning ? <span className="sourceProvenanceWarning">{warning}</span> : null}
    </div>
  );
}

export function provenanceLabel(
  provenance: SourceProvenance | null | undefined,
  language: UiLanguage
): string {
  if (!provenance) return uiText(language, "Unknown source");
  const label = language === "zh" ? provenance.display_label_zh : provenance.display_label_en;
  return label || uiText(language, "Unknown source");
}

export function provenanceNeedsSimulatedWarning(
  provenance: SourceProvenance | null | undefined
): boolean {
  if (!provenance) return false;
  return (
    provenance.overall_kind === "offline" ||
    provenance.overall_kind === "simulated" ||
    provenance.overall_kind === "mixed" ||
    provenance.camera_is_simulated ||
    provenance.temperature_is_simulated ||
    provenanceNeedsSimulatedWarning(provenance.imported_from_provenance)
  );
}

function provenanceDetails(
  provenance: SourceProvenance | null | undefined,
  language: UiLanguage
): string {
  if (!provenance) return "";
  const parts = [
    provenance.camera_label || provenance.camera_backend,
    provenance.camera_serial,
    provenance.simulated_dataset_id
  ].filter(Boolean);
  if (!parts.length) return uiText(language, provenance.overall_kind || "unknown");
  return parts.join(" · ");
}
