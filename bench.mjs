// Baseline benchmark: tile a 3000x2000 image into 12 tiles.
import { mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { tileImage } from './lib/tiler.js'

const OUT = join(process.cwd(), '.bench')
await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })
const src = join(OUT, 'big-3000x2000.png')
await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 40, g: 80, b: 120 } } })
  .composite([{ input: Buffer.from('<svg width="3000" height="2000"><circle cx="1500" cy="1000" r="600" fill="#e0b040"/></svg>'), left: 0, top: 0 }])
  .png()
  .toFile(src)

// warm up sharp
await sharp(src).metadata()

const t0 = performance.now()
const res = await tileImage(src, { outputDirAbs: join(OUT, 'out'), workspaceRoot: OUT, tileSize: 800, overlap: 0, label: true })
const ms = performance.now() - t0

let bytes = 0
for (const t of res.tiles) bytes += (await stat(t.path)).size
console.log(`tiles=${res.count} time=${ms.toFixed(0)}ms bytes=${(bytes / 1024).toFixed(0)}KB`)
await rm(OUT, { recursive: true, force: true })
