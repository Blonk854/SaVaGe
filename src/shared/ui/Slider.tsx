interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step = 1, onChange }: Props) {
  return (
    <label className="sv-slider">
      <span className="sv-slider__row">
        <span>{label}</span>
        <span className="muted">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <style>{`
        .sv-slider {
          display: grid;
          gap: 0.35rem;
          font-size: 0.82rem;
        }
        .sv-slider__row {
          display: flex;
          justify-content: space-between;
          color: var(--fg-1);
        }
        .sv-slider input[type="range"] {
          width: 100%;
          accent-color: var(--accent);
        }
      `}</style>
    </label>
  );
}
