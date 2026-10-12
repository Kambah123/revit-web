import type { CommandSpec, RibbonGroup, RibbonTab, RibbonTabId } from "../app/ribbon";

interface RibbonProps {
  tabs: RibbonTab[];
  commands: Map<string, CommandSpec>;
  activeTab: RibbonTabId;
  onTabChange(id: RibbonTabId): void;
  /** Contextual tab shown while something is selected (e.g. "Modify | Wall"). */
  contextual: { title: string; commandIds: string[] } | null;
  contextualActive: boolean;
  onContextualActivate(): void;
}

/** Original minimal glyph per command group; drawn from simple shapes, not external assets. */
function Glyph({ commandId }: { commandId: string }) {
  const stroke = "currentColor";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      {commandId.startsWith("tool.wall") && <rect x="1" y="6" width="14" height="4" fill="none" stroke={stroke} />}
      {commandId.startsWith("tool.door") && (
        <g fill="none" stroke={stroke}>
          <rect x="2" y="2" width="4" height="12" />
          <path d="M6 14 A8 8 0 0 1 14 6" strokeDasharray="2 2" />
        </g>
      )}
      {commandId.startsWith("tool.window") && (
        <g fill="none" stroke={stroke}>
          <rect x="1" y="5" width="14" height="6" />
          <line x1="8" y1="5" x2="8" y2="11" />
        </g>
      )}
      {commandId.startsWith("tool.floor") && <polygon points="2,12 8,2 14,12" fill="none" stroke={stroke} />}
      {commandId.startsWith("tool.room") && (
        <g fill="none" stroke={stroke}>
          <rect x="2" y="2" width="12" height="12" />
          <line x1="2" y1="8" x2="14" y2="8" strokeDasharray="2 2" />
        </g>
      )}
      {commandId.startsWith("tool.column") && (
        <g fill="none" stroke={stroke}>
          <rect x="5" y="2" width="6" height="12" />
          <line x1="5" y1="2" x2="11" y2="2" />
        </g>
      )}
      {(commandId.startsWith("level.") || commandId.startsWith("view.")) && (
        <g fill="none" stroke={stroke}>
          <line x1="1" y1="11" x2="15" y2="11" />
          <line x1="3" y1="7" x2="13" y2="7" strokeDasharray="2 2" />
        </g>
      )}
      {!/^(tool\.|level\.|view\.)/.test(commandId) && <circle cx="8" cy="8" r="5" fill="none" stroke={stroke} />}
    </svg>
  );
}

export function Ribbon({ tabs, commands, activeTab, onTabChange, contextual, contextualActive, onContextualActivate }: RibbonProps) {
  const renderCommand = (id: string, large: boolean) => {
    const command = commands.get(id);
    if (!command) return null;
    const usable = command.implemented && (command.enabled?.() ?? true);
    const why = !command.implemented
      ? `${command.description} Not implemented yet.`
      : command.description;
    return (
      <button
        key={id}
        className={`ribbon-cmd ${large ? "large" : "small"} ${command.implemented ? "" : "unimplemented"} ${command.isActive?.() ? "active" : ""}`}
        disabled={!usable}
        title={command.shortcut ? `${why} (${command.shortcut})` : why}
        onClick={() => command.run()}
      >
        <Glyph commandId={id} />
        <span>{command.title}</span>
      </button>
    );
  };

  const renderGroup = (group: RibbonGroup) => (
    <div className="ribbon-group" key={group.id + group.title}>
      <div className="ribbon-group-cmds">{group.commands.map((id) => renderCommand(id, true))}</div>
      <div className="ribbon-group-title">{group.title}</div>
    </div>
  );

  const tab = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  return (
    <div className="ribbon">
      <div className="ribbon-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={!contextualActive && t.id === activeTab}
            className={!contextualActive && t.id === activeTab ? "active" : ""}
            onClick={() => onTabChange(t.id)}
          >
            {t.title}
          </button>
        ))}
        {contextual && (
          <button
            role="tab"
            aria-selected={contextualActive}
            className={`contextual ${contextualActive ? "active" : ""}`}
            onClick={onContextualActivate}
          >
            {contextual.title}
          </button>
        )}
      </div>
      <div className="ribbon-body" role="tabpanel">
        {contextualActive && contextual ? (
          <div className="ribbon-group">
            <div className="ribbon-group-cmds">{contextual.commandIds.map((id) => renderCommand(id, true))}</div>
            <div className="ribbon-group-title">Modify</div>
          </div>
        ) : (
          tab.groups.map(renderGroup)
        )}
      </div>
    </div>
  );
}
