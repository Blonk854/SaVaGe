const TYPE_LABELS: Record<string, { one: string; many: string }> = {
  rect: { one: "rectangle", many: "rectangles" },
  ellipse: { one: "ellipse", many: "ellipses" },
  line: { one: "line", many: "lines" },
  path: { one: "path", many: "paths" },
  text: { one: "text object", many: "text objects" },
  group: { one: "group", many: "groups" },
  symbolInstance: { one: "symbol", many: "symbols" },
};

export function mixedSelectionSummary(
  nodes: Array<{ name: string; type: string } | undefined>,
): { title: string; detail: string } {
  const present = nodes.filter((node): node is { name: string; type: string } => Boolean(node));
  const types = [...new Set(present.map((node) => node.type))];
  const title = `${present.length} objects selected`;
  if (types.length === 1) {
    const label = TYPE_LABELS[types[0]] ?? { one: types[0], many: `${types[0]}s` };
    const noun = present.length === 1 ? label.one : label.many;
    return {
      title,
      detail: `These are ${noun}. Select one object to edit size, fill, and effects.`,
    };
  }
  const labels = types.map((type) => TYPE_LABELS[type]?.many ?? `${type}s`);
  return {
    title,
    detail: `Mixed types (${labels.join(", ")}). Select one object to edit size, fill, and effects.`,
  };
}
