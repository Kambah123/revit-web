import { useEffect, useState } from "react";

interface NumberFieldProps {
  label: string;
  value: number;
  step?: number;
  min?: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}

/** A numeric input that commits on Enter or blur, and reverts invalid drafts. */
export function NumberField({ label, value, step = 0.1, min, onCommit, disabled }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed) || (min !== undefined && parsed < min)) {
      setDraft(String(value));
      return;
    }
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}
