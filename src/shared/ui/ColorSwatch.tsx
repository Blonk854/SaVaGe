interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

export function ColorSwatch({ label, value, onChange }: Props) {
  return (
    <label className="sv-swatch">
      <span>{label}</span>
      <span className="sv-swatch__ctrl">
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      </span>
      <style>{`
        .sv-swatch {
          display: grid;
          gap: 0.3rem;
          font-size: 0.82rem;
          color: var(--fg-1);
        }
        .sv-swatch__ctrl {
          display: flex;
          gap: 0.4rem;
          align-items: center;
        }
        .sv-swatch input[type="color"] {
          width: 32px;
          height: 28px;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: transparent;
        }
        .sv-swatch input[type="text"] {
          flex: 1;
          background: var(--bg-2);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.3rem 0.45rem;
        }
      `}</style>
    </label>
  );
}
