import type { CommandSpec } from "../app/ribbon";

interface ShortcutsDialogProps {
  commands: CommandSpec[];
  extra: [string, string][];
  onClose(): void;
}

/** The keyboard shortcut map, gathered from the command registry plus raw UI shortcuts. */
export function ShortcutsDialog({ commands, extra, onClose }: ShortcutsDialogProps) {
  const rows = commands
    .filter((c) => c.shortcut)
    .map((c) => [c.shortcut!, c.title] as [string, string])
    .concat(extra)
    .sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div
      className="launcher-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-label="Keyboard shortcuts">
        <h2>Keyboard shortcuts</h2>
        <table className="shortcut-table">
          <tbody>
            {rows.map(([keys, action]) => (
              <tr key={keys + action}>
                <td>
                  <kbd>{keys}</kbd>
                </td>
                <td>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="wide" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
