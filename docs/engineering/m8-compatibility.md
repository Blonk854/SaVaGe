# M8.3 Format Compatibility

Recorded: 2026-09-17

This slice is the reader/writer matrix for `.savage` schema 1, recovery envelopes, and
the supported SVG subset. There is no schema 2 writer. Migrations, if they are ever
needed, happen in memory; source files are not rewritten on Open. Staged rollout of
a tagged NSIS artifact is [M8.4](m8-rollout.md). Rollback after a prior binary is
[M8.6](m8-rollback.md).

Fixtures live in `fixtures/compatibility/` and tests copy them before parsing so a
failed reader cannot hide a write-back to the corpus.

## Project reader/writer matrix

| Format | This reader (0.1.3) | This writer | Rule |
|---|---|---|---|
| `.savage` schema 1 | Read | Write | Native lossless. Open a **copy** of corpus files. |
| `.savage` schema ≥2 | Reject | None | Actionable error. Original bytes unchanged. Newer SaVaGe must Save As a v1 copy if a downgrade is required. |
| Missing/invalid JSON | Reject | — | "Unrecognized" / "not valid JSON". No file write. |
| Recovery envelope 1 + schema 1 | Offer Recover | Checkpoint | Recover as Unsaved. Open Original does not apply recovered edits. |
| Recovery format ≥2 or schema ≥2 | Reject | None | File left in place (not quarantined, not overwritten). |
| Corrupt recovery JSON | Reject | — | Quarantine by renaming to `.quarantine`. Contents are not repaired. |

Older binaries need not read a future format. That limitation is explicit: 0.1.x only
understands schema 1 / recovery format 1.

## SVG support (release notes)

| Feature | Import | Export | Notes |
|---|---|---|---|
| Paths M/L/H/V/C/S/Q/T/Z | Lossless | Lossless | Native subset |
| Elliptical arcs A | Bounded | Not emitted | Import flattens to line segments |
| translate / rotate / scale | Bounded | Lossless | Import reads one of each from `transform` |
| skew / matrix() / transform lists | Not parsed | Lossless from native | Keep `.savage` for skew |
| Solid, linear, radial, mesh paint | Lossless | Lossless | Mesh is SVG 2; browsers may skip it |
| Text | Bounded | Bounded | Bundled DM Sans / Syne outlines |
| clipPath / symbol / use | Not imported as scene | Native clips/symbols export | Re-open SVG will not rebuild symbols |
| `<image>` rasters | Dropped | Bounded `data:image` only | Convert rasters instead. Remote hrefs are omitted. |
| script, foreignObject, SMIL, iframe | Dropped | Not written | Hostile markup is not round-tripped |
| Event handlers, remote url()/javascript: paint | Dropped | Not written | Local hex/rgb/hsl/keywords only |
| DOCTYPE / ENTITY / xml-stylesheet | Reject | Not written | No entity expansion or external sheets |
| `<image>` href on export | Dropped on import | Bounded data: only | Remote or `javascript:` hrefs are omitted |

Do not claim exact SVG round trips for every file. Native project save/reopen is the
fidelity path.

## Tests

- `src/shared/document/compatibility.test.ts` — copies of legacy, skew, future, and
  unsupported SVG fixtures; original bytes unchanged.
- `parseSavageDocument` — future version message.
- `openFile` — future version does not invoke a writer.
- Native `recovery` — unsupported envelopes stay on disk; writes refuse to replace them.

## Revert

Removing the future-version error must not be replaced with a silent coerce-to-1
parser. Do not add a schema 2 writer without a Save As / original-copy path.
