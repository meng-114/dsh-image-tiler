/**
 * Host-half wiring tests: sandbox-compatible apply() with late settings mount.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { apply, SETTINGS_NS } from '../lib/index.js'

/** Build a sandbox-like ctx: tools + get/effect/timeout/console, no inject. */
function makeHarness() {
  let current = {
    autoTile: false, tileSize: 800, overlap: 40, format: 'png', maxTiles: 64,
    overviewSize: 1200, label: true, outputDir: 'tiles',
    visionProvider: 'deepseek-official', visionModel: 'deepseek-flash', visionTimeoutMs: 0,
  }
  const watchers = []
  const registered = []
  const settings = {
    register(ns, schema, options) {
      registered.push({ ns, options })
      return { get: () => current, watch: (cb) => { watchers.push(cb); return () => {} } }
    },
  }
  let defs = []
  const tools = { register: (d) => { defs.push(d); return () => { defs = defs.filter((x) => x !== d) } } }
  let provided
  const timeouts = []
  const services = new Map()
  const ctx = {
    tools,
    get: (key) => (key === 'settings' ? provided : services.get(key)),
    effect: (fn) => fn(),
    timeout: (cb, ms) => { timeouts.push({ cb, ms }); return () => {} },
    console,
  }
  return {
    settings, tools, ctx,
    setCurrent: (next) => { current = next },
    provide: (s) => { provided = s },
    setService: (key, value) => { services.set(key, value) },
    fireWatch: () => { for (const cb of watchers) cb() },
    firePoll: () => { for (const t of [...timeouts]) t.cb() },
    defs: () => defs,
    tile: () => defs.find((d) => d.name === 'tile_image'),
    readTiles: () => defs.find((d) => d.name === 'read_tiles'),
    registered: () => registered,
  }
}

/** A fake `llm` service yielding one grounded box, recording each call. */
function fakeGroundingLlm(text, calls = []) {
  return {
    calls,
    stream(options) {
      calls.push(options)
      return (async function* () {
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }
}

/** A fake `attachments` service; the overview is real, so only the ref is faked. */
function fakeImageAttachments() {
  return {
    async saveImage(input) {
      return { attachmentId: 'att-1', mediaType: input.mediaType, bytes: input.data.length, width: 1200, height: 750 }
    },
  }
}

/**
 * Tile a fresh 1600x1000 image in a scratch workspace and return the executor.
 * 800px tiles with no overlap give a clean 2x2 grid.
 */
async function tiledWorkspace(name, width = 1600, height = 1000) {
  const cwd = join(process.cwd(), name)
  await rm(cwd, { recursive: true, force: true })
  await mkdir(cwd, { recursive: true })
  await sharp({ create: { width, height, channels: 3, background: '#224466' } }).png().toFile(join(cwd, 'shot.png'))
  return { cwd, cleanup: () => rm(cwd, { recursive: true, force: true }) }
}

test('tool registers immediately with defaults when settings is absent', () => {
  const h = makeHarness()
  apply(h.ctx)
  assert.equal(h.defs().length, 2)
  assert.equal(h.tile().name, 'tile_image')
  assert.equal(h.tile().timeoutMs, 120000)
  assert.equal(h.readTiles().name, 'read_tiles')
  assert.equal(h.registered().length, 0)
  assert.ok(!h.tile().description.includes('automatically tile'))
})

test('settings mount late -> poll registers namespace and live description follows', () => {
  const h = makeHarness()
  apply(h.ctx)
  h.provide(h.settings)
  h.firePoll()
  assert.equal(h.registered().length, 1)
  assert.equal(h.registered()[0].ns, SETTINGS_NS)
  assert.equal(h.registered()[0].options.applies, 'live')

  h.setCurrent({ autoTile: true, tileSize: 800, overlap: 40, format: 'png', maxTiles: 64, overviewSize: 1200, label: true, outputDir: 'tiles' })
  h.fireWatch()
  assert.equal(h.defs().length, 2)
  assert.ok(h.tile().description.includes('automatically tile'))
})

test('no duplicate registration after successful mount', () => {
  const h = makeHarness()
  apply(h.ctx)
  h.provide(h.settings)
  h.firePoll()
  h.firePoll()
  assert.equal(h.registered().length, 1)
  assert.equal(h.defs().length, 2)
})

test('execute rejects a non-image with the format guard', async () => {
  const h = makeHarness()
  apply(h.ctx)
  const exec = { agent: { session: { header: { cwd: process.cwd() } } } }
  await assert.rejects(
    () => h.tile().execute({ file_path: 'README.md' }, exec),
    /unsupported image format/,
  )
})

test('read_tiles declares the semantic target parameter', () => {
  const h = makeHarness()
  apply(h.ctx)
  // defineTool compiles the declared spec into JSON Schema.
  assert.equal(h.readTiles().parameters.properties.target.type, 'string')
  assert.ok(h.readTiles().description.includes('target'))
  assert.ok(h.readTiles().output.schema.properties.target)
  assert.ok(h.readTiles().output.schema.properties.match)
  assert.equal(h.readTiles().timeoutMs, 120000)
})

test('read_tiles target: grounds on the overview and returns the covered tiles', async () => {
  const h = makeHarness()
  apply(h.ctx)
  h.provide(h.settings)
  h.firePoll()
  const ws = await tiledWorkspace('.test-target-out')
  try {
    const exec = { agent: { session: { id: 's1', header: { cwd: ws.cwd } } } }
    await h.tile().execute({ file_path: 'shot.png', tile_size: 800, overlap: 0, label: false }, exec)

    // "top-right quadrant" in normalized coordinates -> exactly r1c2 of a 2x2 grid.
    const calls = []
    h.setService('llm', fakeGroundingLlm('{"x":0.5,"y":0,"w":0.5,"h":0.5}', calls))
    h.setService('attachments', fakeImageAttachments())

    const out = await h.readTiles().execute({ target: 'the top-right panel' }, exec)
    assert.equal(out.target, 'the top-right panel')
    assert.equal(out.match, 'intersect')
    assert.deepEqual(out.selected.map((t) => `r${t.row}c${t.col}`), ['r1c2'])
    assert.equal(out.count, 1)
    // One routed call, carrying the published image block.
    assert.equal(calls.length, 1)
    assert.equal(calls[0].messages[0].content[0].type, 'image')
    assert.equal(calls[0].provider, 'deepseek-official')
  } finally {
    await ws.cleanup()
  }
})

test('read_tiles target: a not-found grounding reports an actionable error', async () => {
  const h = makeHarness()
  apply(h.ctx)
  h.provide(h.settings)
  h.firePoll()
  const ws = await tiledWorkspace('.test-target-miss', 800, 600)
  try {
    const exec = { agent: { session: { id: 's2', header: { cwd: ws.cwd } } } }
    await h.tile().execute({ file_path: 'shot.png', tile_size: 800, overlap: 0, label: false }, exec)
    h.setService('llm', fakeGroundingLlm('{"found":false}'))
    h.setService('attachments', fakeImageAttachments())
    await assert.rejects(
      () => h.readTiles().execute({ target: 'a unicorn' }, exec),
      /did not find "a unicorn"/,
    )
  } finally {
    await ws.cleanup()
  }
})

test('read_tiles target: explicit tile ids still win over a target', async () => {
  const h = makeHarness()
  apply(h.ctx)
  h.provide(h.settings)
  h.firePoll()
  const ws = await tiledWorkspace('.test-target-precedence')
  try {
    const exec = { agent: { session: { id: 's3', header: { cwd: ws.cwd } } } }
    await h.tile().execute({ file_path: 'shot.png', tile_size: 800, overlap: 0, label: false }, exec)
    // No llm/attachments are provided, so a target would throw: reaching a
    // result proves the explicit ids took the branch instead.
    const out = await h.readTiles().execute({ tiles: 'r1c1', target: 'anything' }, exec)
    assert.equal(out.region, 'r-ids: r1c1')
    assert.deepEqual(out.selected.map((t) => `r${t.row}c${t.col}`), ['r1c1'])
    assert.equal(out.target, undefined)
  } finally {
    await ws.cleanup()
  }
})
