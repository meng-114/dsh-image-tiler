# dsh-image-tiler

> **简体中文** | [English](./README.en.md)

A [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) host tool plugin: slices a large image into labeled ~800×800 tiles plus a downscaled overview, so a vision model can read the tiles instead of a single downscaled original. Includes a **visual slice workbench** and a **drop-to-workbench** flow.

## Features

- **`tile_image` tool** — slice a large image (`file_path`, `tile_size`, `overlap`, `format`, `label`, `overview_size`, `max_tiles`), or pass `cols`/`rows` to split an **even grid** (edge tiles absorb the remainder, no overlap).
- **`read_tiles` tool** — ROI selector: pick tiles by named region (`center`/`left`/`right`/`top`/`bottom`/`full`) or explicit ids (`r1c2,r2c3`) from a `tile_image` manifest. Called with **no arguments** it reads exactly the tiles the user confirmed in the visual picker.
- **Semantic targeting (`target`)** — ask for something by name ("the login button"): a vision model grounds its box on the overview, the box is scaled back to source pixels, and only the tiles covering it are returned (a box landing between tiles degrades to the nearest tile). Built purely on host services — `ctx.attachments` publishes the image, `ctx.llm` calls the routed vision model — so it needs **no extra key, no Python sidecar, and no new dependency**.
- **Visual slice workbench** — the `tile_image` tool card becomes an interactive editor: live grid overlay, draggable separators, numeric inputs, tile thumbnails with zoom, checkbox selection, pagination for huge grids.
- **Drop-to-workbench** — drag an image anywhere into the DSH Web UI: the plugin stages it under `.dsh-imgtiler/`, slices it automatically, and a composer-aligned bar appears with a "打开工作台" (open workbench) button opening a centered, draggable modal.
- **Selection-aware model guidance** — after you confirm a selection, every subsequent model turn is told to call `read_tiles` (no args), read the **overview thumbnail first**, then each selected tile — never answer from the downscaled original.
- **Transparent-edge cropping** — PNG/WebP images with fully transparent borders are auto-trimmed before slicing (disable with `cropEdges: false`).
- **Settings card** — 设置 → 插件 → image-tiler: `autoTile`, `tileSize`, `overlap` (default 0), `format`, `maxTiles`, `overviewSize`, `label`, `outputDir`, plus `visionProvider`/`visionModel` (route used by `target`; empty = the session model, which must declare image input) and `visionTimeoutMs`; live, no restart needed.
- **Path safety** — inputs and outputs are confined to the session workspace; workbench endpoints only serve image extensions; tasks are keyed per session (workspace switching never bleeds).

## Install

**npm (recommended)**:

```bash
dsh plugin add @mengli114/dsh-image-tiler
```

**GitHub source / local development**:

```bash
dsh plugin add github:meng-114/dsh-image-tiler
# or, for a local checkout:
dsh plugin --profile web add link:/path/to/dsh-image-tiler
```

The bundle's `cordis.patch.yml` is merged into the profile roster; **restart Web once** after installing.

## Compatibility

| DSH | Plugin |
|---|---|
| **0.1.7 line** (checked against 0.1.7-rc.2) | **0.4.0** — the settings card uses the `plugins.bundle.config` seat plus the `ctx.configForms` service |
| ≤ 0.1.6 line (old `settings.plugin.item` / `settingsScope`) | 0.3.1 and earlier |

The 0.1.7 line removed both `settings.plugin.item` and `ctx.settingsScope`, so **0.4.0 only runs on the newer DSH**; on an older host it does not error — the settings card simply never appears — which is why `package.json` now declares a `dsh.engines.dsh` floor. Evidence and full history: [CHANGELOG.md](./CHANGELOG.md).

## Usage

Give the model a large image (drop it in, or pass a workspace path) and it tiles it, or drive the workbench yourself:

1. Drop an image into the DSH Web UI (anywhere) — the plugin auto-slices with your settings and a bar appears above the composer.
2. Open the workbench (centered modal, drag its title bar anywhere).
3. Tune the grid live: type **列×行** (e.g. `2 × 1` for exactly two tiles), drag the separators, or type a pixel size (free-typing, clamped on blur/Enter).
4. Click **切片** to slice, then check the tiles you want the model to see and click **确认给模型看**.
5. The model's next turn is guided to call `read_tiles` (no arguments) → read the `overview` → read each selected tile — full context, no wasted tokens.

### Model-facing tools

```text
tile_image({ file_path: "big.png", tile_size: 800, overlap: 0, cols: 2, rows: 1 })
read_tiles({ manifest: "tiles/manifest.json", region: "center" })   # or { tiles: "r1c2,r2c3" }
read_tiles({ target: "the login button" })                          # semantic targeting
read_tiles()                                                        # user's confirmed selection
```

When the target is not present the tool reports that explicitly instead of guessing.

## Architecture

| Part | Source | Notes |
|---|---|---|
| Host half | `lib/index.js` | tools, settings namespace (`image-tiler`), workbench HTTP endpoints (`/dsh-imgtiler/*`: state/preview/slice/select/img/import), sandbox-safe retry wiring (no `ctx.inject`), per-session tasks |
| Tiling core | `lib/tiler.js` | pure functions (`tileLayout`/`tileGrid`/`regionWindow`/`selectTiles`/`tilesForBox`/`labelSvg`), sharp pipeline, transparent-edge cropping, workspace-relative manifests |
| Grounding bridge | `lib/vision.js` | `buildGroundingPrompt`/`parseGrounding`/`runGrounding`: publishes the overview through `attachments`, streams one call through `llm`, parses a tolerance-heavy reply into a **normalized** box (fractions, so adapter-side resizing cannot skew it) |
| Browser half | `lib/client.js` | `window.__ModuleLoader__.load` bundle — settings card (`settings.plugin.item`), workbench tool view (`tool.call.toolview` key `tile_image`), composer dock (`conversation.input.dock`), drop capture, modal + zoom portals |

## Development

```bash
npm install
npm test        # node:test suite (51 tests: layout math, guards, alpha crop,
                # grid mode, box->tile mapping, grounding parse, per-session
                # wiring; CI runs on push/PR)
npm run bench   # tiling benchmark (3000x2000 -> 12 tiles)
```

Requires Node 22.19+ / 24+.

The tiling core decodes the source **once** (raw pixel reuse) and writes tiles with bounded concurrency: a 5000×4000 image slices into 35 tiles in ~0.2s.

## Limitations

- Input formats: PNG / JPEG / GIF / WebP / AVIF / HEIF / TIFF (GIF = first frame).
- Up to 600 tiles per run (tool default 64), matching the DeepSeek API ceiling.
- Outputs land in the session workspace (`tiles/` by default; dropped images stage under `.dsh-imgtiler/`).
- `target` quality depends on the vision model: it may answer "not present" (reported, never guessed) or return a loose box (a tile or two extra). Grounding runs on the **overview**, so the box resolution is capped by `overview_size` — raise it for small targets.
- With both `tiles` and `target`, explicit ids win; `target` wins over a workbench selection.

## License

MIT
