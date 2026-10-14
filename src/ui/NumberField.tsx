import { useEffect, useState } from "react";

interface NumberFieldProps {
  label: string;
  value: number;
  step?: number;
  min?: number;
  /** When true, committed values are rounded to whole numbers (used for millimetre fields). */
  integer?: boolean;
  onCommit: (value: number) => void | boolean;
  disabled?: boolean;
}

/** A numeric input that commits on Enter or blur, and reverts invalid drafts. */
export function NumberField({ label, value, step = 0.1, min, integer = false, onCommit, disabled }: NumberFieldProps) {
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
    const committed = integer ? Math.round(parsed) : parsed;
    if (committed !== value && onCommit(committed) === false) setDraft(String(value));
  };

  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
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
