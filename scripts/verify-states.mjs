// Drive the live Web UI into every plugin state and capture real screenshots.
//
//   node scripts/verify-states.mjs <url> <session-title> <outDir> <downloadDir> [port]
//
// Opens the session by its sidebar title, then uses trusted CDP mouse input so
// hover, right-click, preview and copy are the states a user would see.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const [url, sessionTitle, outDir, downloadDir, port = '9222'] = process.argv.slice(2)
if (!url || !sessionTitle || !outDir || !downloadDir) {
  console.error('usage: node scripts/verify-states.mjs <url> <session-title> <outDir> <downloadDir> [port]')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })
rmSync(downloadDir, { recursive: true, force: true })
mkdirSync(downloadDir, { recursive: true })

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = targets.find((target) => target.type === 'page')
if (!page) {
  console.error('no page target on the debugging port')
  process.exit(3)
}

const socket = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
let nextId = 0
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message)
    pending.delete(message.id)
  }
})
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const evaluate = async (expression) => {
  const message = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (message.result?.exceptionDetails) {
    console.error('eval failed:', JSON.stringify(message.result.exceptionDetails).slice(0, 400))
  }
  return message.result?.result?.value
}
const capture = async (name) => {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = join(outDir, name)
  ;(await import('node:fs')).writeFileSync(file, Buffer.from(shot.result.data, 'base64'))
  return file
}
const mouse = async (type, x, y, extra = {}) => {
  await send('Input.dispatchMouseEvent', { type, x, y, buttons: extra.buttons ?? 0, button: extra.button ?? 'none', clickCount: extra.clickCount ?? 0 })
}
const pressEscape = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(250)
}

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
try {
  await send('Browser.grantPermissions', {
    origin: new URL(url).origin,
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  })
} catch (error) {
  console.log('clipboard permission grant failed:', String(error).slice(0, 120))
}

const report = {}

await send('Page.navigate', { url })
await sleep(7000)

report.dismissed = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').trim().startsWith('继续'))
  if (button) button.click()
  return Boolean(button)
})()`)
await sleep(400)

report.openedSession = await evaluate(`(() => {
  const needle = ${JSON.stringify(sessionTitle)}
  const rows = [...document.querySelectorAll('button')].filter((node) => (node.textContent || '').trim().startsWith(needle))
  if (rows.length === 0) return false
  rows[0].click()
  return true
})()`)
await sleep(2500)

report.gallery = await evaluate(`(() => {
  const frame = document.querySelector('.dit-frame')
  const image = document.querySelector('.dit-gallery img')
  if (!frame || !image) return null
  const a = frame.getBoundingClientRect()
  const b = image.getBoundingClientRect()
  return {
    frames: document.querySelectorAll('.dit-frame').length,
    actions: document.querySelectorAll('.dit-acts').length,
    frame: { x: Math.round(a.left), y: Math.round(a.top), width: Math.round(a.width), height: Math.round(a.height) },
    image: { width: Math.round(b.width), height: Math.round(b.height) },
    natural: { width: image.naturalWidth, height: image.naturalHeight },
  }
})()`)

if (report.gallery === null) {
  report.failure = await evaluate('document.body.innerText.slice(0, 400)')
  await capture('00-missing.png')
  // Dark theme through the real prefers-color-scheme path the theme service reads.
await sleep(2600)
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
await sleep(1000)
report.darkTheme = await evaluate(`(() => ({
  scheme: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(),
  source: document.documentElement.getAttribute('data-ds-theme-source'),
  colorScheme: getComputedStyle(document.documentElement).colorScheme
}))()`)

await mouse('mousePressed', center.x, center.y, { button: 'left', buttons: 1, clickCount: 1 })
await mouse('mouseReleased', center.x, center.y, { button: 'left', buttons: 0, clickCount: 1 })
await sleep(700)
report.files.push(await capture('20-dark-preview.png'))
await pressEscape()
await sleep(300)

await mouse('mouseMoved', center.x, center.y)
await mouse('mousePressed', center.x, center.y, { button: 'right', buttons: 2, clickCount: 1 })
await mouse('mouseReleased', center.x, center.y, { button: 'right', buttons: 0, clickCount: 1 })
await sleep(500)
report.darkMenu = await evaluate(`(() => {
  const menu = document.querySelector('.dit-menu')
  if (!menu) return null
  const style = getComputedStyle(menu)
  return { background: style.backgroundColor, color: style.color, width: Math.round(menu.getBoundingClientRect().width) }
})()`)
report.files.push(await capture('21-dark-menu.png'))

await send('Emulation.setEmulatedMedia', { features: [] })

console.log(JSON.stringify(report, null, 2))
  socket.close()
  process.exit(4)
}

const frame = report.gallery.frame
const center = { x: frame.x + Math.round(frame.width / 2), y: frame.y + Math.round(frame.height / 2) }

report.files = []
report.files.push(await capture('10-chat.png'))

await mouse('mouseMoved', center.x, center.y)
await sleep(450)
report.files.push(await capture('11-hover.png'))

await mouse('mousePressed', center.x, center.y, { button: 'right', buttons: 2, clickCount: 1 })
await mouse('mouseReleased', center.x, center.y, { button: 'right', buttons: 0, clickCount: 1 })
await sleep(450)
report.menu = await evaluate(`(() => {
  const menu = document.querySelector('.dit-menu')
  if (!menu) return null
  const rect = menu.getBoundingClientRect()
  return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height), text: (menu.innerText || '').replace(/\\s+/g, ' ').slice(0, 120) }
})()`)
report.files.push(await capture('12-menu.png'))

await pressEscape()
await mouse('mouseMoved', center.x, center.y)
await sleep(200)

// Left click the thumbnail to open the preview.
await mouse('mousePressed', center.x, center.y, { button: 'left', buttons: 1, clickCount: 1 })
await mouse('mouseReleased', center.x, center.y, { button: 'left', buttons: 0, clickCount: 1 })
await sleep(600)
report.preview = await evaluate(`(() => {
  const preview = document.querySelector('.dit-preview')
  if (!preview) return null
  const rect = preview.getBoundingClientRect()
  return { width: Math.round(rect.width), height: Math.round(rect.height), toolbar: document.querySelectorAll('.dit-toolbar-button').length }
})()`)
report.files.push(await capture('13-preview.png'))

const copyPoint = await evaluate(`(() => {
  const button = document.querySelectorAll('.dit-toolbar-button')[0]
  if (!button) return null
  const rect = button.getBoundingClientRect()
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
})()`)
if (copyPoint) {
  await mouse('mouseMoved', copyPoint.x, copyPoint.y)
  await mouse('mousePressed', copyPoint.x, copyPoint.y, { button: 'left', buttons: 1, clickCount: 1 })
  await mouse('mouseReleased', copyPoint.x, copyPoint.y, { button: 'left', buttons: 0, clickCount: 1 })
  await sleep(1100)
  report.toast = await evaluate(`(() => {
    const toast = document.querySelector('.dit-toast')
    return toast ? (toast.innerText || '').replace(/\\s+/g, ' ').slice(0, 120) : null
  })()`)
  report.clipboard = await evaluate(`(async () => {
    try {
      const items = await navigator.clipboard.read()
      return items.map((item) => item.types)
    } catch (error) {
      return 'read failed: ' + String(error).slice(0, 80)
    }
  })()`)
  report.files.push(await capture('14-copy-toast.png'))
}

await pressEscape()
await sleep(250)

// Download through the same thumbnail menu so the bytes are the attachment's.
await mouse('mousePressed', center.x, center.y, { button: 'right', buttons: 2, clickCount: 1 })
await mouse('mouseReleased', center.x, center.y, { button: 'right', buttons: 0, clickCount: 1 })
await sleep(450)
const downloadPoint = await evaluate(`(() => {
  const items = document.querySelectorAll('.dit-menu-item')
  if (items.length < 2) return null
  const rect = items[1].getBoundingClientRect()
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
})()`)
if (downloadPoint) {
  await mouse('mouseMoved', downloadPoint.x, downloadPoint.y)
  await mouse('mousePressed', downloadPoint.x, downloadPoint.y, { button: 'left', buttons: 1, clickCount: 1 })
  await mouse('mouseReleased', downloadPoint.x, downloadPoint.y, { button: 'left', buttons: 0, clickCount: 1 })
  await sleep(2000)
  report.downloadToast = await evaluate(`(() => {
    const toast = document.querySelector('.dit-toast')
    return toast ? (toast.innerText || '').replace(/\\s+/g, ' ').slice(0, 140) : null
  })()`)
  report.files.push(await capture('15-download.png'))
  await sleep(600)
  const entries = readdirSync(downloadDir).filter((name) => !name.endsWith('.crdownload'))
  report.downloaded = entries.map((name) => {
    const file = join(downloadDir, name)
    const bytes = readFileSync(file)
    return { name, bytes: statSync(file).size, sha256: createHash('sha256').update(bytes).digest('hex') }
  })
}

// Dark theme through the real prefers-color-scheme path the theme service reads.
await sleep(2600)
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
await sleep(1000)
report.darkTheme = await evaluate(`(() => ({
  scheme: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(),
  source: document.documentElement.getAttribute('data-ds-theme-source'),
  colorScheme: getComputedStyle(document.documentElement).colorScheme
}))()`)

await mouse('mousePressed', center.x, center.y, { button: 'left', buttons: 1, clickCount: 1 })
await mouse('mouseReleased', center.x, center.y, { button: 'left', buttons: 0, clickCount: 1 })
await sleep(700)
report.files.push(await capture('20-dark-preview.png'))
await pressEscape()
await sleep(300)

await mouse('mouseMoved', center.x, center.y)
await mouse('mousePressed', center.x, center.y, { button: 'right', buttons: 2, clickCount: 1 })
await mouse('mouseReleased', center.x, center.y, { button: 'right', buttons: 0, clickCount: 1 })
await sleep(500)
report.darkMenu = await evaluate(`(() => {
  const menu = document.querySelector('.dit-menu')
  if (!menu) return null
  const style = getComputedStyle(menu)
  return { background: style.backgroundColor, color: style.color, width: Math.round(menu.getBoundingClientRect().width) }
})()`)
report.files.push(await capture('21-dark-menu.png'))

await send('Emulation.setEmulatedMedia', { features: [] })

console.log(JSON.stringify(report, null, 2))
socket.close()