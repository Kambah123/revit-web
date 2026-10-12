import type { ViewTab } from "./ProjectBrowser";

interface ViewTabsProps {
  tabs: ViewTab[];
  activeId: string;
  onActivate(id: string): void;
  onClose(id: string): void;
}

/** Document-style tabs for the open views. At least one tab always stays open. */
export function ViewTabs({ tabs, activeId, onActivate, onClose }: ViewTabsProps) {
  return (
    <div className="view-tabs" role="tablist" aria-label="Open views">
      {tabs.map((t) => (
        <div key={t.id} className={`view-tab ${t.id === activeId ? "active" : ""}`}>
          <button role="tab" aria-selected={t.id === activeId} onClick={() => onActivate(t.id)} title={t.title}>
            {t.title}
          </button>
          {tabs.length > 1 && (
            <button
              className="view-tab-close"
              aria-label={`Close ${t.title}`}
              title={`Close ${t.title}`}
              onClick={() => onClose(t.id)}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
