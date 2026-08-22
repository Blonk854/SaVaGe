import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useDocumentStore } from "../../shared/stores/documentStore";
import { useUiStore } from "../../shared/stores/uiStore";
import { documentToSvgString } from "../../shared/document/serialize";
import { svgStringToDocument } from "../../shared/document/deserialize";
import { parseSavageDocument } from "../../shared/document/parseSavage";

import { isRasterPath, RASTER_EXTENSIONS } from "../converter/rasterFiles";

export async function openFile() {
  const selected = await open({
    multiple: false,
    filters: [
      { name: "SaVaGe / SVG / Images", extensions: ["savage", "svg", ...RASTER_EXTENSIONS] },
    ],
  });
  if (typeof selected !== "string") return;

  if (isRasterPath(selected)) {
    const ui = useUiStore.getState();
    ui.setPendingConvertPath(selected);
    ui.setMode("convert");
    return selected;
  }

  const text = await invoke<string>("read_text_file", { path: selected });
  if (selected.toLowerCase().endsWith(".savage")) {
    useDocumentStore.getState().loadDocument(parseSavageDocument(text));
  } else {
    useDocumentStore.getState().loadDocument(svgStringToDocument(text));
  }
  useUiStore.getState().setMode("edit");
  return selected;
}

export async function saveProject() {
  const path = await save({
    filters: [{ name: "SaVaGe Project", extensions: ["savage"] }],
    defaultPath: "untitled.savage",
  });
  if (!path) return;
  const doc = useDocumentStore.getState().doc;
  await invoke("write_text_file", {
    path,
    contents: JSON.stringify(doc, null, 2),
  });
}

export async function exportSvg() {
  const path = await save({
    filters: [{ name: "SVG", extensions: ["svg"] }],
    defaultPath: `${useDocumentStore.getState().doc.name || "export"}.svg`,
  });
  if (!path) return;
  const svg = documentToSvgString(useDocumentStore.getState().doc);
  await invoke("write_text_file", { path, contents: svg });
}

export async function exportPng(scale = 2) {
  const path = await save({
    filters: [{ name: "PNG", extensions: ["png"] }],
    defaultPath: `${useDocumentStore.getState().doc.name || "export"}.png`,
  });
  if (!path) return;
  const svg = documentToSvgString(useDocumentStore.getState().doc);
  await invoke("export_png", { path, svg, scale });
}
