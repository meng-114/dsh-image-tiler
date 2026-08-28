/**
 * Host tool plugin: tile_image.
 *
 * Registers one model-facing tool that slices a large image into labeled
 * ~800x800 tiles plus an overview thumbnail, so a vision model can read the
 * tiles instead of receiving a single downscaled image.
 *
 * A settings namespace (`image-tiler`) supplies user-adjustable defaults for
 * the tiling parameters, and the `autoTile` flag decides whether the tool
 * description guides the model to tile large images automatically.
 * @module @mengli114/dsh-image-tiler
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { DEFAULTS, tileImage, ensureInside, selectTiles } from './tiler.js'

/** Stable Cordis plugin name. */
export const name = 'image-tiler'

/** Host services required by the tool registry. */
export const inject = ['tools', 'timer']

/** Settings namespace holding user-adjustable tiling defaults. */
export const SETTINGS_NS = 'image-tiler'

/** Schema for the image-tiler settings section (schemastery). */
export const SETTINGS_SCHEMA = z.object({
  autoTile: z.boolean().default(false)
    .description('用户提供大图（附件或路径）时，引导模型先调用 tile_image 切片再逐张读取，而不是读被缩小的原图'),
  tileSize: z.number().min(64).max(4096).default(800)
    .description('目标切片边长（像素）；越大片数越少，越小细节预算越高'),
  overlap: z.number().min(0).max(2048).default(40)
    .description('相邻切片之间的重叠像素数，避免文字/线条正好切在边缘'),
  format: z.union(['png', 'jpeg', 'webp']).default('png')
    .description('切片与缩略图的输出格式'),
  maxTiles: z.number().min(1).max(600).default(64)
    .description('单次切片数量上限（DeepSeek 官方 API 上限为 600 张）'),
  overviewSize: z.number().min(128).max(4096).default(1200)
    .description('全局缩略图最长边（像素）'),
  label: z.boolean().default(true)
    .description('在每个切片顶部绘制 r/c 坐标与源图位置标注'),
  outputDir: z.string().pattern(/^[A-Za-z0-9._/-]*$/).default('tiles')
    .description('切片输出目录（会话工作区相对路径）'),
})

/** Display path relative to the session workspace, with forward slashes. */
function displayPath(cwd, absolutePath) {
  const rel = relative(cwd, absolutePath)
  return rel.split(sep).join('/')
}

/** Human-readable model-facing summary of a tiling result. */
function renderResult(value) {
  const lines = [
    `<tile_image>`,
    `source: ${value.source.path} (${value.source.width}×${value.source.height})`,
    `layout: ${value.rows} rows × ${value.cols} cols = ${value.count} tiles (${value.tileSize}px, overlap ${value.overlap}px)`,
    `outputDir: ${value.outputDir}`,
    `overview: ${value.overview.path} (${value.overview.width}×${value.overview.height})`,
    `manifest: ${value.manifest}`,
    `tiles:`,
  ]
  for (const tile of value.tiles) {
    lines.push(
      `- ${tile.path} [r${tile.row}c${tile.col} x=${tile.x} y=${tile.y} ${tile.width}×${tile.height}]`,
    )
  }
  lines.push('</tile_image>')
  return lines.join('\n')
}

/** Tool description; the autoTile flag adds the automatic-tiling guidance. */
function buildDescription(autoTile) {
  const base = 'Slice a large image into labeled ~800x800 tiles plus an overview thumbnail, preserving detail for vision models. Returns tile paths, the overview path, and a manifest; read the tiles with read_image to inspect detail.'
  if (!autoTile) return base
  return base + ' When the user provides a large image (attachment or workspace path), automatically tile it first and read the overview plus the tiles instead of the downscaled original.'
}

/**
 * Build the tool execute body bound to the settings resolver.
 * @param resolveCfg - reads the current resolved settings (or DEFAULTS).
 * @returns the async execute function.
 */
function buildExecute(resolveCfg) {
  return async function execute(args, exec) {
    const cfg = resolveCfg()
    const cwd = exec.agent?.session?.header?.cwd
    if (!cwd) throw new Error('tile_image requires a session workspace (session cwd)')
    const inputAbs = resolve(cwd, args.file_path)
    ensureInside(cwd, inputAbs)
    const outputDir = resolve(cwd, args.output_dir ?? cfg.outputDir)
    ensureInside(cwd, outputDir)

    const result = await tileImage(inputAbs, {
      outputDirAbs: outputDir,
      workspaceRoot: cwd,
      tileSize: args.tile_size ?? cfg.tileSize,
      overlap: args.overlap ?? cfg.overlap,
      format: args.format ?? cfg.format,
      label: args.label ?? cfg.label,
      overviewSize: args.overview_size ?? cfg.overviewSize,
      maxTiles: args.max_tiles ?? cfg.maxTiles,
    })

    return {
      source: {
        path: displayPath(cwd, result.source.path),
        width: result.source.width,
        height: result.source.height,
      },
      outputDir: displayPath(cwd, result.outputDir),
      tileSize: result.tileSize,
      overlap: result.overlap,
      cols: result.cols,
      rows: result.rows,
      count: result.count,
      overview: {
        path: displayPath(cwd, result.overview.path),
        width: result.overview.width,
        height: result.overview.height,
      },
      tiles: result.tiles.map((tile) => ({
        path: displayPath(cwd, tile.path),
        row: tile.row,
        col: tile.col,
        x: tile.x,
        y: tile.y,
        width: tile.width,
        height: tile.height,
      })),
      manifest: displayPath(cwd, result.manifest),
    }
  }
}

/**
 * Register the tile_image tool and the image-tiler settings namespace.
 * @param ctx - host plugin context.
 */
export function apply(ctx) {
  let scope

  const resolveCfg = () => (scope !== undefined ? scope.get() : DEFAULTS)

  let disposeTool
  const registerTool = () => {
    const cfg = resolveCfg()
    const dispose = ctx.tools.register(defineTool({
      name: 'tile_image',
      description: buildDescription(cfg.autoTile),
      parameters: {
        file_path: {
          type: 'string',
          required: true,
          description: 'Path to the image file, resolved against the session workspace.',
        },
        tile_size: {
          type: 'integer',
          description: 'Target tile side in pixels (default 800).',
        },
        overlap: {
          type: 'integer',
          description: 'Overlap between neighboring tiles in pixels (default 40).',
        },
        output_dir: {
          type: 'string',
          description: 'Output directory inside the session workspace (default "tiles").',
        },
        format: {
          type: 'string',
          enum: ['png', 'jpeg', 'webp'],
          description: 'Output format for tiles and overview (default png).',
        },
        label: {
          type: 'boolean',
          description: 'Draw row/col coordinate labels on each tile (default true).',
        },
        overview_size: {
          type: 'integer',
          description: 'Longest side of the overview thumbnail in pixels (default 1200).',
        },
        max_tiles: {
          type: 'integer',
          description: 'Maximum number of tiles to generate (default 64).',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            source: {
              type: 'object',
              additionalProperties: false,
              required: true,
              properties: {
                path: { type: 'string', required: true },
                width: { type: 'integer', required: true },
                height: { type: 'integer', required: true },
              },
            },
            outputDir: { type: 'string', required: true },
            tileSize: { type: 'integer', required: true },
            overlap: { type: 'integer', required: true },
            cols: { type: 'integer', required: true },
            rows: { type: 'integer', required: true },
            count: { type: 'integer', required: true },
            overview: {
              type: 'object',
              additionalProperties: false,
              required: true,
              properties: {
                path: { type: 'string', required: true },
                width: { type: 'integer', required: true },
                height: { type: 'integer', required: true },
              },
            },
            tiles: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  path: { type: 'string', required: true },
                  row: { type: 'integer', required: true },
                  col: { type: 'integer', required: true },
                  x: { type: 'integer', required: true },
                  y: { type: 'integer', required: true },
                  width: { type: 'integer', required: true },
                  height: { type: 'integer', required: true },
                },
              },
            },
            manifest: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{ type: 'text', text: renderResult(value) }],
      },
      timeoutMs: 120000,
      isConcurrencySafe: () => false,
      execute: buildExecute(resolveCfg),
      presentCall(args) {
        return {
          card: 'generic',
          title: `Tile image ${args.file_path}`,
          kind: 'read',
          locations: [{ path: args.file_path }],
        }
      },
    }))
    if (disposeTool !== undefined) disposeTool()
    disposeTool = dispose
  }

  registerTool()

  // The settings service may mount after this plugin's apply (activation order
  // is not guaranteed), and the sandbox ctx withholds ctx.inject, so register
  // the namespace immediately and retry on a short timer until the service
  // appears; live changes re-register the tool so the autoTile description
  // follows.
  let failed = false
  const tryRegister = () => {
    if (scope !== undefined || failed) return
    const settings = ctx.get('settings')
    if (settings === undefined) return
    try {
      scope = settings.register(SETTINGS_NS, SETTINGS_SCHEMA, { applies: 'live' })
      ctx.effect(() => scope.watch(() => registerTool()))
      registerTool()
    } catch (error) {
      failed = true
      console.error('image-tiler: settings register failed', error && error.message)
    }
  }
  tryRegister()
  if (scope === undefined) {
    ctx.effect(() => {
      let stopped = false
      const tick = () => {
        if (stopped || scope !== undefined || failed) return
        tryRegister()
        if (scope === undefined && !failed) ctx.timeout(tick, 500)
      }
      tick()
      return () => { stopped = true }
    })
  }

  // Read-only companion: pick the tiles intersecting a named region of a
  // previously tiled image, so the model reads only what it needs.
  ctx.tools.register(defineTool({
    name: 'read_tiles',
    description: 'Pick the tiles of a previously tiled image that intersect a region, so you read only the tiles you need. Pass the manifest path returned by tile_image, then read each returned tile with read_image (start with the ones you need, not all of them).',
    parameters: {
      manifest: {
        type: 'string',
        required: true,
        description: 'Path of the manifest.json returned by tile_image, resolved against the session workspace.',
      },
      region: {
        type: 'string',
        enum: ['center', 'left', 'right', 'top', 'bottom', 'full'],
        description: 'Named region of the source image to read (default center); full selects every tile.',
      },
      tiles: {
        type: 'string',
        description: 'Explicit comma-separated tile ids (e.g. "r1c2,r2c3") instead of a region; takes precedence when present.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          overview: { type: 'string', required: true },
          region: { type: 'string', required: true },
          selected: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                row: { type: 'integer', required: true },
                col: { type: 'integer', required: true },
                x: { type: 'integer', required: true },
                y: { type: 'integer', required: true },
                width: { type: 'integer', required: true },
                height: { type: 'integer', required: true },
              },
            },
          },
          count: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `<read_tiles>`,
          `region: ${value.region}`,
          `overview: ${value.overview}`,
          `count: ${value.count}`,
          `selected:`,
          ...value.selected.map((tile) => `- ${tile.path} [r${tile.row}c${tile.col} x=${tile.x} y=${tile.y} ${tile.width}×${tile.height}]`),
          `</read_tiles>`,
        ].join('\n'),
      }],
    },
    timeoutMs: 30000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const cwd = exec.agent?.session?.header?.cwd
      if (!cwd) throw new Error('read_tiles requires a session workspace (session cwd)')
      const manifestAbs = resolve(cwd, args.manifest)
      ensureInside(cwd, manifestAbs)
      let manifest
      try {
        manifest = JSON.parse(await readFile(manifestAbs, 'utf8'))
      } catch (error) {
        throw new Error(`cannot read manifest ${args.manifest}: ${error && error.message}`)
      }
      if (!Array.isArray(manifest?.tiles) || !manifest?.source) {
        throw new Error(`manifest is malformed or not produced by tile_image: ${args.manifest}`)
      }

      let selected
      let region
      if (typeof args.tiles === 'string' && args.tiles.trim().length > 0) {
        const ids = new Set(args.tiles.split(',').map((s) => s.trim()).filter(Boolean))
        selected = manifest.tiles.filter((tile) => ids.has(`r${tile.row}c${tile.col}`))
        region = `r-ids: ${[...ids].join(',')}`
        if (selected.length === 0) throw new Error(`no tiles match "${args.tiles}"`)
      } else {
        region = args.region ?? 'center'
        selected = selectTiles(manifest, region).tiles
        if (selected.length === 0) throw new Error(`region "${region}" selects no tiles`)
      }

      const resolveSafe = (rel) => {
        const abs = resolve(cwd, rel)
        ensureInside(cwd, abs)
        return abs
      }
      return {
        overview: displayPath(cwd, resolveSafe(manifest.overview.path)),
        region,
        selected: selected.map((tile) => ({
          path: displayPath(cwd, resolveSafe(tile.path)),
          row: tile.row,
          col: tile.col,
          x: tile.x,
          y: tile.y,
          width: tile.width,
          height: tile.height,
        })),
        count: selected.length,
      }
    },
    presentCall(args) {
      return {
        card: 'generic',
        title: `Read tiles from ${args.manifest}`,
        kind: 'read',
        locations: [{ path: args.manifest }],
      }
    },
  }))
}
