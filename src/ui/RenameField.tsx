import { useEffect, useState } from "react";

interface RenameFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}

/** A text input that commits on Enter or blur, and reverts when left empty. */
export function RenameField({ label, value, onCommit }: RenameFieldProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value);
      return;
    }
    onCommit(trimmed);
  };

  return (
    <input
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
