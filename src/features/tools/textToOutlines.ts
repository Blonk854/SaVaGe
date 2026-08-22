import { nanoid } from "nanoid";
import {
  defaultStroke,
  defaultTransform,
  type PathNode,
  type TextNode,
} from "../../shared/document/types";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";

/** Convert live text to path outlines using TrueType/CFF glyph extraction. */
export async function convertTextToOutlines(id: string) {
  const store = useDocumentStore.getState();
  const node = store.doc.nodes[id];
  if (!node || node.type !== "text") {
    throw new Error("Select a text object to convert to outlines");
  }
  const { textToGlyphSubpaths } = await import("./fontOutlines");
  const text = node as TextNode;
  const content = text.content || " ";
  const subpaths = await textToGlyphSubpaths(
    content,
    text.fontFamily,
    text.fontSize,
    text.fontWeight,
    text.letterSpacing,
  );

  const path: PathNode = {
    id: nanoid(10),
    name: `${text.name} outlines`,
    type: "path",
    visible: true,
    locked: false,
    opacity: text.opacity,
    blendMode: text.blendMode,
    transform: defaultTransform(text.transform.x, text.transform.y),
    effects: text.effects,
    subpaths,
    fill: structuredClone(text.fill),
    stroke: text.stroke.width > 0 ? structuredClone(text.stroke) : defaultStroke("#000000", 0),
    fillRule: "nonzero",
  };
  path.transform.rotation = text.transform.rotation;
  path.transform.scaleX = text.transform.scaleX;
  path.transform.scaleY = text.transform.scaleY;
  if (path.stroke.width === 0) path.stroke.paint = { type: "none" };

  store.deleteNodes([id]);
  store.addNode(path);
  useUiStore.getState().markDirty();
}
