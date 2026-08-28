/**
 * Unit + integration tests for the tiling core (pure Node, node:test).
 * Run with: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { tileLayout, tileImage, ensureInside, clampInt, sanitizeName, labelSvg } from '../lib/tiler.js'

const OUT = join(process.cwd(), '.test-out')
test.beforeEach(async () => {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })
})
test.after(async () => {
  await rm(OUT, { recursive: true, force: true })
})

test('tileLayout: 3x2 grid on 2000x1500 @800/40', () => {
  const layout = tileLayout(2000, 1500, 800, 40)
  assert.equal(layout.cols, 3)
  assert.equal(layout.rows, 2)
  assert.equal(layout.tiles.length, 6)
  const last = layout.tiles[5]
  assert.equal(last.x, 1520)
  assert.equal(last.y, 760)
  assert.equal(last.width, 480)
  assert.equal(last.height, 740)
})

test('tileLayout: image smaller than tile yields one tile', () => {
  const layout = tileLayout(100, 100, 800, 40)
  assert.equal(layout.cols, 1)
  assert.equal(layout.rows, 1)
  assert.deepEqual(layout.tiles[0], { row: 0, col: 0, x: 0, y: 0, width: 100, height: 100 })
})

test('tileLayout: overlap clamp keeps step >= 1', () => {
  const layout = tileLayout(400, 400, 64, 63)
  assert.ok(layout.cols >= 1 && layout.rows >= 1)
  for (const tile of layout.tiles) {
    assert.ok(tile.width >= 1 && tile.height >= 1)
    assert.ok(tile.x >= 0 && tile.y >= 0)
  }
})

test('ensureInside: rejects escapes, accepts descendants', () => {
  assert.throws(() => ensureInside('C:/work', 'C:/work/../evil.txt'))
  assert.throws(() => ensureInside('C:/work', 'D:/other/x.png'))
  assert.doesNotThrow(() => ensureInside('C:/work', 'C:/work/a/b.png'))
  assert.doesNotThrow(() => ensureInside('C:/work', 'C:/work'))
})

test('clampInt: fallback and range', () => {
  assert.equal(clampInt('x', 800, 64, 4096), 800)
  assert.equal(clampInt(9999, 800, 64, 4096), 4096)
  assert.equal(clampInt(1, 800, 64, 4096), 64)
  assert.equal(clampInt(400, 800, 64, 4096), 400)
})

test('sanitizeName: strips unsafe characters', () => {
  assert.equal(sanitizeName('a/b\\c:d*e?f"g<h>i|j'), 'a-b-c-d-e-f-g-h-i-j')
  assert.equal(sanitizeName('  --picture-- '), 'picture')
  assert.equal(sanitizeName(''), 'image')
})

test('labelSvg: contains coordinates and size', () => {
  const svg = labelSvg(800, 600, 1, 2, 760, 0)
  assert.ok(svg.includes('r2c3'))
  assert.ok(svg.includes('760,0'))
  assert.ok(svg.includes('800×600'))
})

test('tileImage: end-to-end png with labels and workspace-relative manifest', async () => {
  const src = join(OUT, 'sample-2000x1500.png')
  await sharp({ create: { width: 2000, height: 1500, channels: 3, background: { r: 30, g: 60, b: 90 } } }).png().toFile(src)

  const res = await tileImage(src, {
    outputDirAbs: join(OUT, 'out'),
    workspaceRoot: OUT,
    tileSize: 800,
    overlap: 40,
    format: 'png',
    label: true,
    overviewSize: 1200,
    maxTiles: 64,
  })

  assert.equal(res.count, 6)
  assert.equal(res.cols, 3)
  assert.equal(res.rows, 2)
  assert.ok(res.tiles.every((t) => t.width > 0 && t.height > 0))
  assert.equal(res.overview.width, 1200)
  assert.equal(res.overview.height, 900)

  // every tile exists on disk
  for (const t of res.tiles) {
    const meta = await sharp(t.path).metadata()
    assert.equal(meta.width, t.width)
    assert.equal(meta.height, t.height)
  }

  // manifest uses workspace-relative paths with forward slashes
  const manifest = JSON.parse(await readFile(res.manifest, 'utf8'))
  assert.equal(manifest.count, 6)
  assert.ok(!JSON.stringify(manifest).includes('\\'))
  assert.equal(manifest.source.path, 'sample-2000x1500.png')
  assert.ok(manifest.tiles[0].path.startsWith('out/'))
})

test('tileImage: jpeg output flattens alpha to white', async () => {
  const src = join(OUT, 'alpha-600x400.png')
  await sharp({ create: { width: 600, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg width="600" height="400"><circle cx="300" cy="200" r="150" fill="#ff0000"/></svg>'), left: 0, top: 0 }])
    .png()
    .toFile(src)

  const res = await tileImage(src, {
    outputDirAbs: join(OUT, 'out'),
    workspaceRoot: OUT,
    format: 'jpeg',
    label: false,
  })
  const tile = await sharp(res.tiles[0].path).raw().toBuffer()
  const { channels } = await sharp(res.tiles[0].path).metadata()
  assert.equal(channels, 3)
  const corner = (5 * 600 + 5) * channels
  assert.ok(tile[corner] > 240 && tile[corner + 1] > 240 && tile[corner + 2] > 240)
})

test('tileImage: maxTiles guard throws', async () => {
  const src = join(OUT, 'big-2000x1500.png')
  await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#335577' } }).png().toFile(src)
  await assert.rejects(
    () => tileImage(src, { outputDirAbs: join(OUT, 'out'), workspaceRoot: OUT, tileSize: 300, overlap: 0, maxTiles: 5 }),
    /requires \d+ tiles/,
  )
})

test('tileImage: escape and unsupported input guards', async () => {
  await assert.rejects(() => tileImage(join(OUT, '..', 'outside.png'), { outputDirAbs: join(OUT, 'out'), workspaceRoot: OUT }))
  const txt = join(OUT, 'note.txt')
  await writeFile(txt, 'not an image at all')
  // real non-image content rejects during decode (format check, not extension)
  await assert.rejects(() => tileImage(txt, { outputDirAbs: join(OUT, 'out'), workspaceRoot: OUT }))
})
