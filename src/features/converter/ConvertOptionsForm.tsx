import { Slider } from "../../shared/ui/Slider";
import type { ConvertOptions, ConvertPreset } from "./convertApi";
import { matchingPreset, PRESETS } from "./convertApi";
import clsx from "clsx";

interface Props {
  options: ConvertOptions;
  disabled?: boolean;
  onChange: (opts: ConvertOptions) => void;
}

const PRESET_LABELS: Record<ConvertPreset, string> = {
  logo: "Logo / flat",
  photo: "Photo",
  line: "Line art",
  pixel: "Pixel",
};

export function ConvertOptionsForm({ options, disabled, onChange }: Props) {
  const preset = matchingPreset(options);
  const set = <K extends keyof ConvertOptions>(key: K, value: ConvertOptions[K]) =>
    onChange({ ...options, [key]: value });

  return (
    <div className={`opts ${disabled ? "disabled" : ""}`}>
      <div className="opts__presets" role="group" aria-label="Trace presets">
        {(Object.keys(PRESET_LABELS) as ConvertPreset[]).map((p) => (
          <button
            key={p}
            type="button"
            className={clsx(preset === p && "active")}
            aria-pressed={preset === p}
            disabled={disabled}
            onClick={() => onChange({ ...PRESETS[p] })}
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
        {preset === "custom" && (
          <button type="button" className="active" aria-pressed="true" disabled>
            Custom
          </button>
        )}
      </div>
      {preset === "custom" && (
        <p className="opts__custom">Options no longer match a named preset.</p>
      )}
      <Slider
        label="Color precision"
        min={1}
        max={8}
        value={options.color_precision}
        onChange={(v) => set("color_precision", v)}
      />
      <Slider
        label="Filter speckle"
        min={0}
        max={16}
        value={options.filter_speckle}
        onChange={(v) => set("filter_speckle", v)}
      />
      <Slider
        label="Corner threshold"
        min={0}
        max={180}
        value={options.corner_threshold}
        onChange={(v) => set("corner_threshold", v)}
      />
      <Slider
        label="Path precision"
        min={0}
        max={4}
        value={options.path_precision}
        onChange={(v) => set("path_precision", v)}
      />
      <label className="field">
        Mode
        <select
          value={options.mode}
          disabled={disabled}
          onChange={(e) => set("mode", e.target.value)}
        >
          <option value="spline">Spline</option>
          <option value="polygon">Polygon</option>
          <option value="pixel">Pixel</option>
        </select>
      </label>
      <style>{`
        .opts {
          display: grid;
          gap: 0.85rem;
        }
        .opts.disabled {
          pointer-events: none;
        }
        .opts.disabled button:not(.active),
        .opts.disabled .field {
          color: var(--fg-disabled);
        }
        .opts__presets {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.4rem;
        }
        .opts__presets button {
          border: 1px solid var(--border);
          background: var(--bg-2);
          border-radius: 8px;
          padding: 0.45rem 0.5rem;
          font-size: 0.78rem;
        }
        .opts__presets button.active {
          border-color: rgba(184,255,60,0.5);
          background: var(--selection-fill);
          color: var(--selection-fg);
        }
        .opts__custom {
          margin: 0;
          font-size: var(--text-xs);
          color: var(--warn);
        }
        .field {
          display: grid;
          gap: 0.3rem;
          font-size: 0.82rem;
          color: var(--fg-1);
        }
        .field select {
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.4rem 0.5rem;
        }
      `}</style>
    </div>
  );
}
