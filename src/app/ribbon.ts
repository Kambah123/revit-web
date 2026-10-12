/**
 * The command registry is the single source of truth for every user-invokable action: the ribbon,
 * the searchable command launcher and the keyboard shortcuts all read from it. Commands that are
 * not yet implemented are listed as `implemented: false` and rendered disabled with an explanatory
 * tooltip — never as fake working buttons.
 */

export type CommandGroup =
  | "file"
  | "edit"
  | "tools"
  | "datum"
  | "build"
  | "circulation"
  | "room"
  | "structure"
  | "steel"
  | "insert"
  | "annotate"
  | "analyze"
  | "massing"
  | "collaborate"
  | "view"
  | "manage"
  | "addins"
  | "help";

export type RibbonTabId =
  | "architecture"
  | "structure"
  | "steel"
  | "insert"
  | "annotate"
  | "analyze"
  | "massing"
  | "collaborate"
  | "view"
  | "manage"
  | "addins";

export interface CommandSpec {
  id: string;
  title: string;
  /** Tooltip body; also explains why an unimplemented command is disabled. */
  description: string;
  /** Ribbon tab this command appears on; null = only in the launcher. */
  tab: RibbonTabId | null;
  group: CommandGroup;
  /** Shortcut label shown in the UI, e.g. "W" or "Ctrl+K". */
  shortcut?: string;
  implemented: boolean;
  /** Runs the command. Only called when `implemented` and enabled. */
  run(): void;
  /** Whether the command is currently available (e.g. Undo with empty history). */
  enabled?(): boolean;
  /** Whether the command is a currently active mode (e.g. the Wall tool). */
  isActive?(): boolean;
}

export interface RibbonGroup {
  id: CommandGroup;
  title: string;
  commands: string[];
}

export interface RibbonTab {
  id: RibbonTabId;
  title: string;
  groups: RibbonGroup[];
}

export const RIBBON_TABS: RibbonTab[] = [
  {
    id: "architecture",
    title: "Architecture",
    groups: [
      { id: "tools", title: "Tools", commands: ["tool.select"] },
      { id: "datum", title: "Datum", commands: ["level.add"] },
      {
        id: "build",
        title: "Build",
        commands: ["tool.wall", "tool.door", "tool.window", "tool.floor", "tool.room", "tool.column", "tool.ceiling", "tool.roof", "tool.stair"],
      },
      { id: "circulation", title: "Circulation", commands: ["tool.railing", "tool.ramp"] },
      { id: "room", title: "Room & Area", commands: ["tool.room", "annotate.roomTag"] },
    ] as RibbonGroup[],
  },
  {
    id: "structure",
    title: "Structure",
    groups: [
      { id: "structure", title: "Foundation", commands: ["struct.foundation", "struct.retainingWall"] },
      { id: "structure", title: "Structure", commands: ["tool.column", "struct.beam", "struct.brace", "struct.structuralFloor"] },
      { id: "structure", title: "Reinforcement", commands: ["struct.rebar"] },
    ] as RibbonGroup[],
  },
  {
    id: "steel",
    title: "Steel",
    groups: [
      { id: "steel", title: "Connection", commands: ["steel.connection", "steel.fabrication"] },
      { id: "steel", title: "Modification", commands: ["steel.cope", "steel.split"] },
    ] as RibbonGroup[],
  },
  {
    id: "insert",
    title: "Insert",
    groups: [
      { id: "insert", title: "Import", commands: ["import.dxf", "import.ifc", "import.glb"] },
      { id: "insert", title: "Load", commands: ["load.family"] },
    ] as RibbonGroup[],
  },
  {
    id: "annotate",
    title: "Annotate",
    groups: [
      { id: "annotate", title: "Dimension", commands: ["annotate.alignedDim", "annotate.angularDim"] },
      { id: "annotate", title: "Detail", commands: ["annotate.detailLine", "annotate.text"] },
      { id: "annotate", title: "Tag", commands: ["annotate.tag", "annotate.roomTag"] },
      { id: "annotate", title: "View", commands: ["view.section", "view.elevation", "view.callout"] },
    ] as RibbonGroup[],
  },
  {
    id: "analyze",
    title: "Analyze",
    groups: [
      { id: "analyze", title: "Spaces & Zones", commands: ["analyze.space", "analyze.zone"] },
      { id: "analyze", title: "Reports", commands: ["analyze.heatingLoad", "analyze.coolingLoad"] },
    ] as RibbonGroup[],
  },
  {
    id: "massing",
    title: "Massing & Site",
    groups: [
      { id: "massing", title: "Conceptual Mass", commands: ["mass.conceptual"] },
      { id: "massing", title: "Model by Face", commands: ["mass.wall", "mass.floor"] },
      { id: "massing", title: "Site", commands: ["site.toposurface", "site.component"] },
    ] as RibbonGroup[],
  },
  {
    id: "collaborate",
    title: "Collaborate",
    groups: [
      { id: "collaborate", title: "Manage Collaboration", commands: ["collab.worksets", "collab.sync"] },
      { id: "collaborate", title: "Coordinate", commands: ["collab.interferenceCheck", "collab.publish"] },
    ] as RibbonGroup[],
  },
  {
    id: "view",
    title: "View",
    groups: [
      { id: "view", title: "Create", commands: ["view.plan", "view.3d"] },
      { id: "view", title: "Graphics", commands: ["view.wireframe", "view.hiddenLine", "view.shaded"] },
      { id: "view", title: "Windows", commands: ["view.resetCamera", "view.zoomFit"] },
    ] as RibbonGroup[],
  },
  {
    id: "manage",
    title: "Manage",
    groups: [
      { id: "manage", title: "Settings", commands: ["manage.projectUnits", "manage.snaps"] },
      { id: "manage", title: "Project", commands: ["manage.materials", "manage.phases"] },
    ] as RibbonGroup[],
  },
  {
    id: "addins",
    title: "Add-Ins",
    groups: [{ id: "addins", title: "External", commands: ["addins.extensionManager"] }] as RibbonGroup[],
  },
];

/** Groups that are not attached to a tab but keep their commands findable in the launcher. */
export const LAUNCHER_ONLY_GROUPS: CommandGroup[] = ["file", "edit", "tools", "help"];
