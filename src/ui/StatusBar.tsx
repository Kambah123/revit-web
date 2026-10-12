interface StatusBarProps {
  selectionCount: number;
  toolLabel: string;
  snapStep: number;
  scale: number;
  projectName: string;
  revision: number;
}

/** Bottom status bar: selection, active tool, snap, scale and project identity. */
export function StatusBar(props: StatusBarProps) {
  return (
    <footer className="status-bar" role="status">
      <span>{props.selectionCount === 0 ? "Nothing selected" : `${props.selectionCount} selected`}</span>
      <span className="status-sep" />
      <span>Tool: {props.toolLabel}</span>
      <span className="status-sep" />
      <span>Snap: {props.snapStep === 0 ? "off" : `${props.snapStep} mm`}</span>
      <span className="status-sep" />
      <span>Scale: 1:{props.scale}</span>
      <span className="spacer" />
      <span className="muted">
        {props.projectName} · rev {props.revision}
      </span>
    </footer>
  );
}
