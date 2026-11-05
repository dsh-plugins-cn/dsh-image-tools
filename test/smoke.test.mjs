// Static smoke tests: the bundle must keep the registration markers DSH needs
// and stay inside the plugin rules this repository promises.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const client = readFileSync(join(root, 'client.js'), 'utf8')
const host = readFileSync(join(root, 'index.js'), 'utf8')
const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

test('manifest version matches the host build stamp', () => {
  const match = /const BUILD = '([^']+)'/.exec(host)
  assert.ok(match, 'index.js must declare BUILD')
  assert.equal(match[1], pkg.version)
})

test('bundle patch inserts the image-tools row', () => {
  assert.match(patch, /id: image-tools/)
  assert.ok(patch.includes(`name: '${pkg.name}'`))
})

test('client registers the four image slots and the overlay', () => {
  for (const slot of [
    'conversation.chat.user.images',
    'conversation.chat.message.images',
    'tool.call.images',
    'conversation.trajectory.images',
    'shell.overlay',
  ]) {
    assert.ok(client.includes(`'${slot}'`), `missing slot ${slot}`)
  }
})

test('client shadows the official gallery with a lower priority', () => {
  assert.match(client, /const PRIORITY = 10\b/)
  assert.match(client, /register\(\{\s*name,\s*priority: PRIORITY\s*\}/)
})

test('client keeps the plugin rules', () => {
  assert.ok(!client.includes('document.body'), 'must not write document.body')
  assert.ok(!/require\(['"]@deepseek-ai\//.test(client), 'must not require Client packages')
  assert.ok(/require\(['"]react['"]\)/.test(client), 'React comes from the module loader')
})

test('both locales ship display metadata', () => {
  for (const locale of ['zh', 'en']) {
    const dict = JSON.parse(readFileSync(join(root, 'locale', `${locale}.json`), 'utf8'))
    assert.ok(dict.meta.title.length > 0)
    assert.ok(dict.meta.description.length > 0)
  }
})