import { useEffect, useMemo, useRef, useState } from "react";
import type { CommandSpec } from "../app/ribbon";

interface CommandLauncherProps {
  commands: CommandSpec[];
  onRun(id: string): void;
  onClose(): void;
}

/**
 * Searchable command launcher (Ctrl+K). Searches every registered command, including ones the
 * ribbon does not show; unimplemented commands are listed as unavailable rather than hidden.
 */
export function CommandLauncher({ commands, onRun, onClose }: CommandLauncherProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scored = commands
      .map((c) => {
        const title = c.title.toLowerCase();
        const id = c.id.toLowerCase();
        let score = q === "" ? 1 : title.startsWith(q) ? 3 : title.includes(q) ? 2 : id.includes(q) ? 1 : 0;
        if (!c.implemented && score > 0) score -= 0.5;
        return { c, score };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score || a.c.title.localeCompare(b.c.title));
    return scored.slice(0, 12).map((m) => m.c);
  }, [commands, query]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  return (
    <div
      className="launcher-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="launcher" role="dialog" aria-label="Command launcher">
        <input
          ref={inputRef}
          value={query}
          placeholder="Search commands… (Esc closes)"
          aria-label="Search commands"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              const command = matches[index];
              if (command?.implemented) {
                onRun(command.id);
                onClose();
              }
            }
          }}
        />
        <ul className="launcher-list">
          {matches.length === 0 && <li className="muted">No commands match.</li>}
          {matches.map((c, i) => (
            <li key={c.id}>
              <button
                className={`launcher-item ${i === index ? "active" : ""} ${c.implemented ? "" : "unimplemented"}`}
                disabled={!c.implemented}
                title={c.description}
                onMouseEnter={() => setIndex(i)}
                onClick={() => {
                  onRun(c.id);
                  onClose();
                }}
              >
                <span>{c.title}</span>
                <span className="muted">{c.shortcut ?? ""}</span>
                {!c.implemented && <span className="muted">not implemented</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
