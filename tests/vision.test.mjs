/**
 * Unit tests for the vision grounding bridge (pure Node, node:test).
 * The `llm`/`attachments` services are faked: this module only consumes their
 * documented shape, so no harness is needed here.
 * Run with: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildGroundingPrompt, parseGrounding, runGrounding } from '../lib/vision.js'

/**
 * Assert a box matches within floating-point tolerance. Corner-key replies
 * compute a size by subtraction (0.4 - 0.1), so exact equality would be brittle.
 */
function assertBoxClose(actual, expected) {
  for (const key of ['x', 'y', 'width', 'height']) {
    assert.ok(
      Math.abs(actual[key] - expected[key]) < 1e-9,
      `${key}: expected ${expected[key]}, got ${actual[key]}`,
    )
  }
}

/** A fake `llm` service that yields one text delta and a stop finish. */
function fakeLlm(text) {  const calls = []
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

/** A fake `attachments` service that records what was published. */
function fakeAttachments() {
  const saved = []
  return {
    saved,
    async saveImage(input) {
      saved.push(input)
      return { attachmentId: 'att-1', mediaType: input.mediaType, bytes: input.data.length, width: 900, height: 600 }
    },
  }
}

/** Call runGrounding with the boilerplate a test does not care about. */
function ground(text, overrides = {}) {
  const llm = fakeLlm(text)
  const attachments = fakeAttachments()
  return {
    llm,
    attachments,
    promise: runGrounding({
      llm,
      attachments,
      provider: 'deepseek-official',
      model: 'deepseek-flash',
      data: Buffer.from('fake-image'),
      mediaType: 'image/png',
      width: 900,
      height: 600,
      target: 'the login button',
      // 0 disables the abort timer so a test never leaves a live timeout behind.
      timeoutMs: 0,
      ...overrides,
    }),
  }
}

test('buildGroundingPrompt: asks for fractions and names the target', () => {
  const prompt = buildGroundingPrompt('the login button', 1200, 750)
  assert.ok(prompt.includes('the login button'))
  assert.ok(prompt.includes('1200x750'))
  assert.ok(prompt.includes('fractions'))
  assert.ok(prompt.includes('{"found":false}'))
  assert.ok(prompt.includes('Never answer in pixels'))
})

test('parseGrounding: object form returns a normalized box', () => {
  assert.deepEqual(
    parseGrounding('{"x":0.1,"y":0.2,"w":0.3,"h":0.4}', { width: 900, height: 600 }),
    { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  )
})

test('parseGrounding: tolerates fences, prose, and numeric strings', () => {
  const fenced = 'Sure!\n```json\n{"x":"0.1","y":"0.2","width":"0.3","height":"0.4"}\n```\nDone.'
  assert.deepEqual(
    parseGrounding(fenced, { width: 900, height: 600 }),
    { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  )
})

test('parseGrounding: pixel values are normalized against the declared size', () => {
  assert.deepEqual(
    parseGrounding('{"x":90,"y":120,"w":180,"h":240}', { width: 900, height: 600 }),
    { x: 0.1, y: 0.2, width: 0.2, height: 0.4 },
  )
})

test('parseGrounding: corner keys become a size', () => {
  assertBoxClose(
    parseGrounding('{"x1":0.1,"y1":0.2,"x2":0.4,"y2":0.6}', { width: 900, height: 600 }),
    { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  )
})

test('parseGrounding: array forms read as x,y,w,h when they fit', () => {
  assert.deepEqual(
    parseGrounding('{"box":[0.1,0.2,0.3,0.4]}', { width: 900, height: 600 }),
    { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  )
})

test('parseGrounding: array forms fall back to corners when x,y,w,h overflows', () => {
  const box = parseGrounding('{"bbox":[100,100,900,600]}', { width: 900, height: 600 })
  assert.equal(box.width, 800 / 900)
  assert.equal(box.height, 500 / 600)
})

test('parseGrounding: absent target reports null', () => {
  assert.equal(parseGrounding('{"found":false}', { width: 900, height: 600 }), null)
  assert.equal(parseGrounding('{"ok":false}', { width: 900, height: 600 }), null)
})

test('parseGrounding: unusable replies report null instead of throwing', () => {
  assert.equal(parseGrounding('', { width: 900, height: 600 }), null)
  assert.equal(parseGrounding('I could not find that.', { width: 900, height: 600 }), null)
  assert.equal(parseGrounding('{"x":0.1,"y":', { width: 900, height: 600 }), null)
  assert.equal(parseGrounding('{"x":0.1,"y":0.2}', { width: 900, height: 600 }), null)
  assert.equal(parseGrounding(undefined, { width: 900, height: 600 }), null)
})

test('parseGrounding: a collapsed box carries no location', () => {
  assert.equal(parseGrounding('{"x":0.5,"y":0.5,"w":0,"h":0}', { width: 900, height: 600 }), null)
})

test('parseGrounding: a fractional near-miss clamps instead of collapsing', () => {
  // 1.02 is a fraction the model rounded badly — not 1.02 pixels (which would
  // collapse the box to 0.001 of the image).
  assert.deepEqual(
    parseGrounding('{"x":0,"y":0,"w":1.02,"h":1.2}', { width: 900, height: 600 }),
    { x: 0, y: 0, width: 1, height: 1 },
  )
})

test('parseGrounding: out-of-range fractions are clamped', () => {
  assert.deepEqual(
    parseGrounding('{"x":-0.1,"y":-0.2,"w":1.2,"h":1.3}', { width: 900, height: 600 }),
    { x: 0, y: 0, width: 1, height: 1 },
  )
})

test('runGrounding: publishes the image and returns the parsed box', async () => {
  const { llm, attachments, promise } = ground('{"x":0.1,"y":0.2,"w":0.3,"h":0.4}')
  const box = await promise
  assert.deepEqual(box, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 })

  // The image reached the attachment service with the declared media type.
  assert.equal(attachments.saved.length, 1)
  assert.equal(attachments.saved[0].mediaType, 'image/png')

  // The routed call carries the image block plus the grounding prompt.
  assert.equal(llm.calls.length, 1)
  assert.equal(llm.calls[0].provider, 'deepseek-official')
  assert.equal(llm.calls[0].model, 'deepseek-flash')
  const content = llm.calls[0].messages[0].content
  assert.equal(content[0].type, 'image')
  assert.equal(content[0].attachment.attachmentId, 'att-1')
  assert.equal(content[1].type, 'text')
  assert.ok(content[1].text.includes('the login button'))
})

test('runGrounding: a not-found reply resolves to null, not an error', async () => {
  const { promise } = ground('{"found":false}')
  assert.equal(await promise, null)
})

test('runGrounding: falls back to settled blocks when no deltas arrive', async () => {
  const attachments = fakeAttachments()
  const llm = {
    stream() {
      return (async function* () {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: '{"x":0.25,"y":0.25,"w":0.5,"h":0.5}' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }
  const box = await runGrounding({
    llm,
    attachments,
    provider: 'p',
    model: 'm',
    data: Buffer.from('x'),
    mediaType: 'image/png',
    width: 900,
    height: 600,
    target: 'anything',
    timeoutMs: 0,
  })
  assert.deepEqual(box, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
})

test('runGrounding: a terminal error finish chunk throws', async () => {
  const attachments = fakeAttachments()
  const llm = {
    stream() {
      return (async function* () {
        yield { type: 'finish', reason: { kind: 'error', failure: { message: 'model has no vision', code: 'UNSUPPORTED_CONTENT' } } }
      })()
    },
  }
  await assert.rejects(
    () => runGrounding({
      llm,
      attachments,
      provider: 'p',
      model: 'm',
      data: Buffer.from('x'),
      mediaType: 'image/png',
      width: 900,
      height: 600,
      target: 'anything',
      timeoutMs: 0,
    }),
    /model has no vision/,
  )
})

test('runGrounding: missing host services fail loudly', async () => {
  const base = {
    provider: 'p',
    model: 'm',
    data: Buffer.from('x'),
    mediaType: 'image/png',
    width: 900,
    height: 600,
    target: 'anything',
    timeoutMs: 0,
  }
  await assert.rejects(() => runGrounding({ ...base, attachments: fakeAttachments() }), /llm service is unavailable/)
  await assert.rejects(() => runGrounding({ ...base, llm: fakeLlm('{}') }), /attachments service is unavailable/)
})
