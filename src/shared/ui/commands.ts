export interface CommandSpec {
  id: string;
  label: string;
  group: "File" | "Edit" | "View" | "Tools" | "Help";
  shortcut?: string;
  keywords: string;
  tool?: string;
}

export const APP_COMMANDS: CommandSpec[] = [
  { id: "new", label: "New document", group: "File", shortcut: "Ctrl+N", keywords: "blank project" },
  { id: "open", label: "Open project", group: "File", shortcut: "Ctrl+O", keywords: "import svg savage" },
  { id: "save", label: "Save", group: "File", shortcut: "Ctrl+S", keywords: "write project" },
  { id: "save-as", label: "Save As", group: "File", shortcut: "Ctrl+Shift+S", keywords: "copy destination" },
  { id: "export-svg", label: "Export SVG", group: "File", keywords: "vectors save" },
  { id: "export-png", label: "Export PNG", group: "File", keywords: "raster image" },
  { id: "convert", label: "Convert an image", group: "File", keywords: "trace vectorize" },
  { id: "undo", label: "Undo", group: "Edit", shortcut: "Ctrl+Z", keywords: "history" },
  { id: "redo", label: "Redo", group: "Edit", shortcut: "Ctrl+Y", keywords: "ctrl+shift+z history" },
  { id: "copy", label: "Copy", group: "Edit", shortcut: "Ctrl+C", keywords: "clipboard" },
  { id: "paste", label: "Paste", group: "Edit", shortcut: "Ctrl+V", keywords: "clipboard" },
  { id: "fit-artboard", label: "Fit artboard", group: "View", keywords: "zoom frame" },
  { id: "fit-selection", label: "Fit selection", group: "View", keywords: "zoom" },
  { id: "zoom-100", label: "Zoom 100%", group: "View", keywords: "actual size" },
  { id: "code", label: "Edit SVG code", group: "View", keywords: "source markup xml live preview" },
  { id: "select-tool", label: "Select", group: "Tools", shortcut: "V", keywords: "move", tool: "select" },
  { id: "direct-select", label: "Direct select", group: "Tools", shortcut: "A", keywords: "anchors points", tool: "directSelect" },
  { id: "rect-tool", label: "Rectangle", group: "Tools", shortcut: "R", keywords: "shape", tool: "rect" },
  { id: "ellipse-tool", label: "Ellipse", group: "Tools", shortcut: "O", keywords: "circle shape", tool: "ellipse" },
  { id: "pen-tool", label: "Pen", group: "Tools", shortcut: "P", keywords: "path bezier", tool: "pen" },
  { id: "text-tool", label: "Text", group: "Tools", shortcut: "T", keywords: "type", tool: "text" },
  { id: "shortcuts", label: "Keyboard shortcuts", group: "Help", keywords: "reference keys" },
  { id: "manual", label: "User manual", group: "Help", keywords: "pdf documentation" },
  { id: "welcome", label: "Show welcome tips", group: "Help", keywords: "first run guidance" },
];

export function filterCommands(commands: CommandSpec[], query: string): CommandSpec[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return commands;
  return commands.filter((command) => {
    const haystack = `${command.label} ${command.group} ${command.keywords} ${command.shortcut ?? ""}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}
