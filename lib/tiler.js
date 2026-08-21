/**
 * Pure image-tiling core for dsh-image-tiler.
 *
 * Slices one image into labeled tiles of a target size (with optional
 * overlap), writes them under an output directory, and also writes a
 * downscaled overview plus a manifest. This module is intentionally free of
 * DSH imports so it can be unit-tested with plain Node.
 * @module @dsh-external/dsh-image-tiler/tiler
 */

import { mkdir, realpath, stat, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import sharp from 'sharp'

/** Built-in defaults; every field can be overridden per tool call. */
export const DEFAULTS = Object.freeze({
  tileSize: 800,
  overlap: 40,
  overviewSize: 1200,
  maxTiles: 64,
  format: 'png',
  label: true,
  outputDir: 'tiles',
})

/** Output formats accepted by the tool. */
export const FORMATS = Object.freeze(['png', 'jpeg', 'webp'])

/** File extension for each accepted output format. */
const EXTENSIONS = Object.freeze({ png: 'png', jpeg: 'jpg', webp: 'webp' })

/** Formats sharp can decode for tiling (GIF is handled as its first frame). */
const INPUT_FORMATS = new Set(['png', 'jpeg', 'gif', 'webp'])

/**
 * Clamp an integer argument to a range.
 * @param value - candidate value; undefined or invalid uses the fallback.
 * @param fallback - value used when `value` is not a safe integer.
 * @param min - inclusive minimum.
 * @param max - inclusive maximum.
 * @returns the clamped integer.
 */
export function clampInt(value, fallback, min, max) {
  if (!Number.isSafeInteger(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/**
 * Verify that `candidate` is `root` or a descendant of it.
 * @param root - canonical workspace root.
 * @param candidate - absolute path to test.
 * @throws when the candidate escapes the root.
 */
export function ensureInside(root, candidate) {
  const rel = relative(root, candidate)
  if (rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))) return
  throw new Error(`output path must stay inside the session workspace: ${candidate}`)
}

/**
 * Make a path safe for use as a filename stem.
 * @param value - raw stem.
 * @returns a filesystem-safe stem.
 */
export function sanitizeName(value) {
  const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || 'image'
}

/**
 * Compute the tiling grid for an image.
 * @param width - source width in pixels.
 * @param height - source height in pixels.
 * @param tileSize - target tile side in pixels.
 * @param overlap - overlap between neighboring tiles in pixels.
 * @returns the grid dimensions and per-tile rectangles.
 */
export function tileLayout(width, height, tileSize, overlap) {
  const stepX = Math.max(1, tileSize - overlap)
  const stepY = Math.max(1, tileSize - overlap)
  const cols = Math.max(1, Math.ceil((width - tileSize) / stepX) + 1)
  const rows = Math.max(1, Math.ceil((height - tileSize) / stepY) + 1)
  const tiles = []
  for (let row = 0; row < rows; row += 1) {
    const y = Math.min(height - 1, row * stepY)
    const th = Math.min(tileSize, height - y)
    for (let col = 0; col < cols; col += 1) {
      const x = Math.min(width - 1, col * stepX)
      const tw = Math.min(tileSize, width - x)
      tiles.push({ row, col, x, y, width: tw, height: th })
    }
  }
  return { cols, rows, tiles }
}

/**
 * Build the coordinate-label overlay for one tile.
 * @param width - tile width.
 * @param height - tile height.
 * @param row - zero-based row index.
 * @param col - zero-based column index.
 * @param x - source-left offset.
 * @param y - source-top offset.
 * @returns an SVG string sized to the tile.
 */
export function labelSvg(width, height, row, col, x, y) {
  const barHeight = Math.max(20, Math.min(30, Math.round(height * 0.08)))
  const fontSize = Math.max(10, Math.min(16, Math.round(barHeight * 0.62)))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect x="0" y="0" width="${width}" height="${barHeight}" rx="6" fill="rgba(0,0,0,0.55)"/>
  <text x="8" y="${barHeight - Math.round(barHeight * 0.24)}" font-family="sans-serif" font-size="${fontSize}" fill="#ffffff">r${row + 1}c${col + 1} · ${x},${y} (${width}×${height})</text>
</svg>`
}

/**
 * Slice one image into labeled tiles, an overview, and a manifest.
 * @param inputAbs - absolute path of the source image.
 * @param options - tiling options (see DEFAULTS).
 * @returns absolute paths plus layout metadata; caller maps to display paths.
 */
export async function tileImage(inputAbs, options = {}) {
  const tileSize = clampInt(options.tileSize, DEFAULTS.tileSize, 64, 4096)
  const overlap = clampInt(options.overlap, DEFAULTS.overlap, 0, Math.floor(tileSize / 2))
  const overviewSize = clampInt(options.overviewSize, DEFAULTS.overviewSize, 128, 4096)
  const maxTiles = clampInt(options.maxTiles, DEFAULTS.maxTiles, 1, 600)
  const format = FORMATS.includes(options.format) ? options.format : DEFAULTS.format
  const label = options.label !== false
  const outputDir = resolve(options.outputDirAbs)
  const ext = EXTENSIONS[format]

  await mkdir(outputDir, { recursive: true })
  const inputReal = await realpath(inputAbs)
  if (options.workspaceRoot !== undefined) ensureInside(resolve(options.workspaceRoot), inputReal)
  const info = await stat(inputReal)
  if (!info.isFile()) throw new Error(`source is not a regular file: ${inputReal}`)

  const meta = await sharp(inputReal, { failOn: 'none' }).metadata()
  const width = meta.width
  const height = meta.height
  if (!width || !height) throw new Error(`cannot read image dimensions: ${inputReal}`)
  if (!INPUT_FORMATS.has(meta.format)) {
    throw new Error(`unsupported image format "${meta.format}"; use PNG, JPEG, GIF, or WebP`)
  }

  const layout = tileLayout(width, height, tileSize, overlap)
  const count = layout.rows * layout.cols
  if (count > maxTiles) {
    throw new Error(`image requires ${count} tiles but max_tiles is ${maxTiles}; increase tile_size or max_tiles`)
  }

  const base = sanitizeName(basename(inputReal, extname(inputReal)))
  const tilePaths = []
  for (const tile of layout.tiles) {
    const name = `${base}-r${tile.row + 1}c${tile.col + 1}-x${tile.x}-y${tile.y}.${ext}`
    const tilePath = join(outputDir, name)
    let pipeline = sharp(inputReal, { failOn: 'none' }).extract({
      left: tile.x,
      top: tile.y,
      width: tile.width,
      height: tile.height,
    })
    if (label) {
      pipeline = pipeline.composite([{
        input: Buffer.from(labelSvg(tile.width, tile.height, tile.row, tile.col, tile.x, tile.y)),
        top: 0,
        left: 0,
      }])
    }
    if (format === 'jpeg') pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 92 })
    else if (format === 'webp') pipeline = pipeline.webp({ quality: 92 })
    else pipeline = pipeline.png({ compressionLevel: 9 })
    await pipeline.toFile(tilePath)
    tilePaths.push({ ...tile, path: tilePath })
  }

  const overviewName = `${base}-overview.${ext}`
  const overviewPath = join(outputDir, overviewName)
  let overview = sharp(inputReal, { failOn: 'none' }).resize({
    width: overviewSize,
    height: overviewSize,
    fit: 'inside',
    withoutEnlargement: true,
  })
  if (format === 'jpeg') overview = overview.flatten({ background: '#ffffff' }).jpeg({ quality: 92 })
  else if (format === 'webp') overview = overview.webp({ quality: 92 })
  else overview = overview.png({ compressionLevel: 9 })
  await overview.toFile(overviewPath)
  const overviewMeta = await sharp(overviewPath).metadata()

  const manifestRoot = options.workspaceRoot !== undefined ? resolve(options.workspaceRoot) : outputDir
  const manifestPathOf = (p) => relative(manifestRoot, p).split(sep).join('/')
  const manifestPath = join(outputDir, 'manifest.json')
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: { path: manifestPathOf(inputReal), width, height },
    tileSize,
    overlap,
    cols: layout.cols,
    rows: layout.rows,
    count,
    format,
    label,
    overview: {
      path: manifestPathOf(overviewPath),
      width: overviewMeta.width,
      height: overviewMeta.height,
    },
    tiles: tilePaths.map((tile) => ({
      path: manifestPathOf(tile.path),
      row: tile.row + 1,
      col: tile.col + 1,
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
    })),
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2))

  return {
    source: { path: inputReal, width, height },
    outputDir,
    tileSize,
    overlap,
    cols: layout.cols,
    rows: layout.rows,
    count,
    overview: {
      path: overviewPath,
      width: overviewMeta.width,
      height: overviewMeta.height,
    },
    tiles: tilePaths.map((tile) => ({
      path: tile.path,
      row: tile.row + 1,
      col: tile.col + 1,
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
    })),
    manifest: manifestPath,
  }
}
