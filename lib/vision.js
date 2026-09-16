/**
 * Grounding bridge for dsh-image-tiler.
 *
 * Asks a routed vision model where one named target is, using only DSH host
 * services: `attachments` publishes the image and `llm` streams the call. No
 * HTTP client, no credential handling, no Python sidecar — the adapter that
 * owns the route already resolves its own key, retry policy, and image budget.
 *
 * The reply is parsed into a NORMALIZED box (fractions of the image) rather
 * than pixels: the routed adapter may downscale the image to its own pixel
 * budget, so a pixel answer would live in a frame this plugin cannot see.
 * Fractions are resolution-independent, and a pixel-shaped answer is still
 * accepted by dividing it by the declared image size.
 * @module @mengli114/dsh-image-tiler/vision
 */

/**
 * Longest model reply kept for parsing. A grounding answer is one small JSON
 * object; a runaway generation must not be buffered without bound.
 */
const MAX_REPLY_CHARS = 8000

/**
 * Largest magnitude still read as a normalized fraction. A reply whose every
 * value stays within this margin of 1 is treated as fractions (so a near-miss
 * like `w:1.02` clamps to 1 instead of collapsing to 1.02 pixels); a box with
 * any larger value can only be pixels.
 */
const FRACTION_MARGIN = 1.5

/** Clamp one value into [0, 1]; non-numeric input becomes 0. */
function unit(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/**
 * Build the one-shot grounding prompt.
 *
 * Fractions are requested explicitly because the adapter may resize the image;
 * the declared pixel size is included only as context for the model.
 * @param target - natural-language target to locate.
 * @param width - declared image width in pixels.
 * @param height - declared image height in pixels.
 * @returns the prompt text.
 */
export function buildGroundingPrompt(target, width, height) {
  return [
    'You are a precise visual locator. You are shown one image and must return the bounding box of exactly one named target.',
    '',
    'Answer with ONE JSON object and nothing else — no prose, no code fence.',
    'Coordinates MUST be fractions of the image size in the range 0..1, where 0 is the left/top edge and 1 is the right/bottom edge. Never answer in pixels.',
    'Keys: x (left), y (top), w (width), h (height), all fractions.',
    'If the target is not present in the image, answer exactly {"found":false}.',
    'Never guess: a wrong box is worse than {"found":false}.',
    '',
    `Image size: ${width}x${height} px (report fractions, not these pixel values).`,
    `Target: ${target}`,
  ].join('\n')
}

/**
 * Extract the first balanced JSON object from model text.
 * Tolerates code fences and surrounding prose; a truncated or malformed object
 * yields null rather than throwing.
 * @param text - raw model text.
 * @returns the parsed object, or null.
 */
function firstJsonObject(text) {
  const cleaned = text.replace(/```[a-zA-Z]*\s*/g, '')
  const start = cleaned.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

/**
 * Read the first finite number found under any of `keys`.
 * Accepts numeric strings, which models emit often.
 * @param source - parsed object.
 * @param keys - candidate key names in priority order.
 * @returns the number, or undefined.
 */
function pick(source, keys) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  }
  return undefined
}

/**
 * Parse a grounding reply into a normalized box.
 *
 * Accepts `{x,y,w,h}` under common aliases, corner pairs (`x2`/`y2`, or an
 * `x1,y1,x2,y2` reading), and a `box`/`bbox`/`rect` array. A box whose every
 * value stays near 1 is read as fractions; one with any larger value is read as
 * pixels and divided by the declared dimensions.
 *
 * An array is read as `x,y,w,h` when that reading fits inside the image, and as
 * `x1,y1,x2,y2` otherwise — arrays are inherently ambiguous, which is why the
 * prompt asks for named keys.
 * @param text - raw model text.
 * @param dimensions - declared analyzed image size ({@link buildGroundingPrompt}).
 * @returns a normalized box, or null when no target was reported.
 */
export function parseGrounding(text, dimensions) {
  if (typeof text !== 'string' || text.trim() === '') return null
  const parsed = firstJsonObject(text.slice(0, MAX_REPLY_CHARS))
  if (parsed === null || typeof parsed !== 'object') return null
  if (parsed.found === false || parsed.ok === false) return null

  const width = Number(dimensions?.width)
  const height = Number(dimensions?.height)
  const spanX = Number.isFinite(width) && width > 1 ? width : 1
  const spanY = Number.isFinite(height) && height > 1 ? height : 1

  let x
  let y
  let w
  let h
  const arrayLike = [parsed.box, parsed.bbox, parsed.rect].find((v) => Array.isArray(v) && v.length >= 4)
  if (arrayLike !== undefined) {
    const [a, b, c, d] = arrayLike.slice(0, 4).map(Number)
    if (![a, b, c, d].every(Number.isFinite)) return null
    const xywhFits = c > 0 && d > 0 && a + c <= spanX * 1.02 && b + d <= spanY * 1.02
    if (xywhFits) { x = a; y = b; w = c; h = d }
    else { x = a; y = b; w = c - a; h = d - b }
  } else {
    x = pick(parsed, ['x', 'left', 'x1'])
    y = pick(parsed, ['y', 'top', 'y1'])
    w = pick(parsed, ['w', 'width'])
    h = pick(parsed, ['h', 'height'])
    if (w === undefined && x !== undefined) {
      const x2 = pick(parsed, ['x2', 'right'])
      if (x2 !== undefined) w = x2 - x
    }
    if (h === undefined && y !== undefined) {
      const y2 = pick(parsed, ['y2', 'bottom'])
      if (y2 !== undefined) h = y2 - y
    }
  }
  if (x === undefined || y === undefined || w === undefined || h === undefined) return null

  // Decide the unit ONCE for the whole box, not per value: a near-miss like
  // w:1.02 must clamp to 1, whereas a per-value ">1 means pixels" rule would
  // misread it as 1.02 pixels. A box that stays within a small margin of 1 can
  // only be fractions; anything larger can only be pixels.
  const magnitude = Math.max(Math.abs(x), Math.abs(y), Math.abs(w), Math.abs(h))
  const fractional = magnitude <= FRACTION_MARGIN
  const toUnit = (value, span) => (fractional ? unit(value) : unit(Math.abs(value) / span))
  const box = {
    x: toUnit(x, spanX),
    y: toUnit(y, spanY),
    width: toUnit(w, spanX),
    height: toUnit(h, spanY),
  }
  // A box collapsed to nothing carries no location.
  if (!(box.width > 0) || !(box.height > 0)) return null
  return box
}

/**
 * Ask one routed vision model where `target` is inside a single image.
 * @param options - call inputs.
 * @param options.llm - host `llm` service (must expose `stream`).
 * @param options.attachments - host `attachments` service (must expose `saveImage`).
 * @param options.provider - registered provider route id.
 * @param options.model - model id on that route.
 * @param options.data - encoded image bytes.
 * @param options.mediaType - one of image/png, image/jpeg, image/webp, image/gif.
 * @param options.width - declared image width (what the prompt tells the model).
 * @param options.height - declared image height.
 * @param options.target - natural-language target to locate.
 * @param options.timeoutMs - abort the call after this long (0 disables).
 * @returns a normalized box, or null when the model reported no such target.
 * @throws when a required host service is missing or the call fails.
 */
export async function runGrounding(options) {
  const { llm, attachments, provider, model, data, mediaType, width, height, target, timeoutMs = 60000 } = options
  if (typeof llm?.stream !== 'function') {
    throw new Error('the host llm service is unavailable; cannot locate a target')
  }
  if (typeof attachments?.saveImage !== 'function') {
    throw new Error('the host attachments service is unavailable; cannot send the image to a vision model')
  }

  const ref = await attachments.saveImage({ data, mediaType, name: 'image-tiler-grounding' })
  const signal = timeoutMs > 0 && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : undefined
  const message = {
    id: `image-tiler-ground-${Date.now().toString(36)}`,
    role: 'user',
    content: [
      { type: 'image', attachment: ref },
      { type: 'text', text: buildGroundingPrompt(target, width, height) },
    ],
    source: { kind: 'plugin', plugin: 'image-tiler' },
  }

  let streamed = ''
  let blockText = ''
  for await (const chunk of llm.stream({ provider, model, messages: [message], signal })) {
    if (chunk?.type === 'text-delta') {
      if (streamed.length < MAX_REPLY_CHARS) streamed += chunk.text
    } else if (chunk?.type === 'block-end') {
      const block = chunk.block
      if (block?.type === 'text' && typeof block.text === 'string' && blockText.length < MAX_REPLY_CHARS) {
        blockText += block.text
      }
    } else if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') {
      throw new Error(chunk.reason.failure?.message ?? 'the vision call failed')
    }
  }
  // Some adapters emit only settled blocks; fall back to those when no deltas came.
  return parseGrounding(streamed.length > 0 ? streamed : blockText, { width, height })
}
