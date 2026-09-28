/**
 * Invariant tests for the browser half of @mengli114/dsh-image-tiler.
 *
 * The card itself can only be judged in a real browser, and the repository has
 * no test-time DOM. What *can* be pinned down in CI is the part that actually
 * broke when DSH moved to the 0.1.7 settings line: the seats and services the
 * client half registers against, and the namespace the two halves must agree
 * on. A silent registration miss (a removed seat) is invisible at runtime —
 * no error, no card — so it is worth a test.
 *
 * Run: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')
const pkg = JSON.parse(read('package.json'))
const client = read('lib/client.js')
const host = read('lib/index.js')

test('the browser half registers under the published package name', () => {
  const id = client.match(/__ModuleLoader__\.load\(\{\s*\n\s*id:\s*'([^']+)'/)
  assert.ok(id, 'lib/client.js must call window.__ModuleLoader__.load({ id, factory })')
  assert.equal(id[1], pkg.name)
})

test('both halves agree on the settings namespace', () => {
  const hostNs = host.match(/SETTINGS_NS = '([^']+)'/)?.[1]
  const clientNs = client.match(/var NS = '([^']+)'/)?.[1]
  assert.equal(hostNs, 'image-tiler', 'the Host registers this namespace')
  assert.equal(clientNs, hostNs, 'the card must read the namespace the Host serves')
})

test('the settings card sits in the current bundle seat, keyed by the package name', () => {
  assert.match(client, /inject = \['slots', 'configForms'\]/, 'the card needs the configForms service')
  assert.match(client, /ctx\.configForms\.get\(NS\)/, 'the form comes from ctx.configForms.get(namespace)')
  const registered = client.match(/ctx\.slots\.register\(\s*\{ name: 'plugins\.bundle\.config', key: '([^']+)' \}/)
  assert.ok(registered, 'the card must register into plugins.bundle.config')
  assert.equal(registered[1], pkg.name, 'plugins.bundle.config dispatches by the bundle package name')
})

test('no API removed in the 0.1.7 line is still referenced in code', () => {
  // The header comments name the removed APIs on purpose (they document the
  // migration), so only quoted references — the shape code uses — count.
  for (const [file, src] of [['lib/client.js', client], ['lib/index.js', host]]) {
    for (const removed of ['settings.plugin.item', 'settingsScope']) {
      assert.ok(
        !src.includes(`'${removed}'`) && !src.includes(`"${removed}"`),
        `${file} must not reference the removed API ${removed} in code`,
      )
    }
  }
})

test('the card reads and writes through the current ConfigForm surface', () => {
  for (const call of ['getSnapshot()', 'subscribe(', '.set(', '.unset(']) {
    assert.ok(client.includes(call), `the card must use ${call}`)
  }
  assert.match(
    client,
    /snap\.status !== 'ready'/,
    'the card must render nothing while the namespace is not served',
  )
})

test('the package declares the DSH line that provides these seats', () => {
  assert.match(pkg.dsh.engines.dsh, /^>=0\.1\.7/, 'an undeclared floor fails silently on older DSH')
})

test('both halves parse', () => {
  for (const rel of ['lib/client.js', 'lib/index.js']) {
    execFileSync(process.execPath, ['--check', join(root, rel)], { stdio: 'pipe' })
  }
})
