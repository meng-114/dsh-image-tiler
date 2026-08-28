/**
 * Host-half wiring tests: sandbox-compatible apply() with late settings mount.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, SETTINGS_NS } from '../lib/index.js'

/** Build a sandbox-like ctx: tools + get/effect/timeout/console, no inject. */
function makeHarness() {
  let current = { autoTile: false, tileSize: 800, overlap: 40, format: 'png', maxTiles: 64, overviewSize: 1200, label: true, outputDir: 'tiles' }
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
  const ctx = {
    tools,
    get: (key) => (key === 'settings' ? provided : undefined),
    effect: (fn) => fn(),
    timeout: (cb, ms) => { timeouts.push({ cb, ms }); return () => {} },
    console,
  }
  return {
    settings, tools, ctx,
    setCurrent: (next) => { current = next },
    provide: (s) => { provided = s },
    fireWatch: () => { for (const cb of watchers) cb() },
    firePoll: () => { for (const t of timeouts) t.cb() },
    defs: () => defs,
    tile: () => defs.find((d) => d.name === 'tile_image'),
    readTiles: () => defs.find((d) => d.name === 'read_tiles'),
    registered: () => registered,
  }
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
