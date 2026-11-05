// Manifest sanity check used by `npm run check`.
// Verifies the fields DSH reads, the client registration markers, the host
// build stamp, and that the bundle never touches surfaces the plugin rules
// forbid (document.body, other Client packages).
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const problems = []

const required = ['name', 'version', 'type', 'description', 'license', 'exports', 'files', 'dsh']
for (const key of required) if (pkg[key] === undefined) problems.push(`package.json: missing "${key}"`)
if (pkg.type !== 'module') problems.push('package.json: "type" must be "module"')

const dsh = pkg.dsh ?? {}
if (dsh.bundle?.patch === undefined) problems.push('package.json: dsh.bundle.patch is missing')
if (dsh.client?.platform !== 'web') problems.push('package.json: dsh.client.platform must be "web"')

for (const file of [dsh.bundle?.patch, pkg.exports?.['.'], pkg.exports?.['./client'], 'icon.svg', 'README.md', 'LICENSE'].filter((value) => typeof value === 'string')) {
  if (!existsSync(join(root, file))) problems.push(`missing file referenced by the manifest: ${file}`)
}

if (existsSync(join(root, 'cordis.patch.yml'))) {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  if (!patch.includes('id: image-tools')) problems.push('cordis.patch.yml: expected a row with id "image-tools"')
  if (!patch.includes(`name: '${pkg.name}'`)) problems.push(`cordis.patch.yml: expected name '${pkg.name}'`)
}

if (existsSync(join(root, 'index.js'))) {
  const host = readFileSync(join(root, 'index.js'), 'utf8')
  const match = /const BUILD = '([^']+)'/.exec(host)
  if (match === null) problems.push('index.js: missing the BUILD constant')
  else if (match[1] !== pkg.version) problems.push(`index.js: BUILD is "${match[1]}" but package.json is "${pkg.version}"`)
}

const clientPath = join(root, 'client.js')
if (existsSync(clientPath)) {
  const client = readFileSync(clientPath, 'utf8')
  const markers = [
    'window.__ModuleLoader__.load',
    `id: '${pkg.name}'`,
    "'conversation.chat.user.images'",
    "'conversation.chat.message.images'",
    "'tool.call.images'",
    "'conversation.trajectory.images'",
    "'shell.overlay'",
    'priority: PRIORITY',
  ]
  for (const marker of markers) if (!client.includes(marker)) problems.push(`client.js: missing marker ${marker}`)
  if (client.includes('document.body')) problems.push('client.js: must not write document.body')
  if (/require\(['"]@deepseek-ai\/dsh-client-ui-/.test(client)) problems.push('client.js: must not require other Client packages')
  if (/require\(['"]react['"]\)/.test(client) === false) problems.push('client.js: expected the module-loader React import')
}

for (const locale of ['en', 'zh']) {
  const file = join(root, 'locale', `${locale}.json`)
  if (!existsSync(file)) {
    problems.push(`missing locale/${locale}.json`)
    continue
  }
  const dict = JSON.parse(readFileSync(file, 'utf8'))
  if (dict.meta?.title === undefined) problems.push(`locale/${locale}.json: meta.title is missing`)
  if (dict.meta?.description === undefined) problems.push(`locale/${locale}.json: meta.description is missing`)
}

if (problems.length > 0) {
  console.error('manifest check failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`manifest ok: ${pkg.name}@${pkg.version}`)