// Live verification for the preview UI: seed an image message in the isolated
// host, then drive the real preview with trusted CDP input and assert the
// v0.2 contract (bottom-only chrome, caption safe area, zoom, pan, reset,
// keyboard, copy, download).
//
//   node scripts/verify-preview.mjs <url> <outDir> <downloadDir> <imagePathsCsv> [port]
//
// The page gets `html[data-windows-titlebar]` + the 40px titlebar variable, so
// the same layout assertions apply on a headless browser as on Windows.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [url, outDir, downloadDir, imagePathsCsv, port = '9222'] = process.argv.slice(2)
if (!url || !outDir || !downloadDir || !imagePathsCsv) {
  console.error('usage: node scripts/verify-preview.mjs <url> <outDir> <downloadDir> <imagePathsCsv> [port]')
  process.exit(2)
}
const fixtures = imagePathsCsv.split(',').map((value) => value.trim()).filter(Boolean)
if (fixtures.length === 0) { console.error('no fixture images'); process.exit(2) }
mkdirSync(outDir, { recursive: true })
rmSync(downloadDir, { recursive: true, force: true })
mkdirSync(downloadDir, { recursive: true })

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = targets.find((target) => target.type === 'page')
if (!page) { console.error('no page target on the debugging port'); process.exit(3) }

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
const failures = []
const report = { fixtures: [], steps: [] }
const check = (name, ok, detail) => {
  report.steps.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) })
  if (!ok) failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
}
const evaluate = async (expression) => {
  const message = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (message.result?.exceptionDetails) {
    throw new Error('eval failed: ' + JSON.stringify(message.result.exceptionDetails).slice(0, 500))
  }
  return message.result?.result?.value
}
const capture = async (name) => {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = join(outDir, name)
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'))
  report.steps.push({ name: 'screenshot:' + name, ok: true, detail: name })
  return file
}
const mouse = async (type, x, y, extra = {}) => {
  await send('Input.dispatchMouseEvent', {
    type, x, y, buttons: extra.buttons ?? 0, button: extra.button ?? 'none', clickCount: extra.clickCount ?? 0,
    ...(extra.deltaY === undefined ? {} : { deltaX: 0, deltaY: extra.deltaY }),
    ...(extra.modifiers === undefined ? {} : { modifiers: extra.modifiers }),
  })
}
const clickPoint = async (point) => {
  await mouse('mouseMoved', point.x, point.y)
  await mouse('mousePressed', point.x, point.y, { button: 'left', buttons: 1, clickCount: 1 })
  await mouse('mouseReleased', point.x, point.y, { button: 'left', buttons: 0, clickCount: 1 })
}
const pressKey = async (key, code, keyCode, modifiers = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers })
  await sleep(220)
}
const pointOfButton = async (label) => evaluate(`(() => {
  const buttons = [...document.querySelectorAll('button')]
  const hit = buttons.find((node) => { const text = (node.textContent || '').trim(); const aria = node.getAttribute('aria-label') || ''; return text === ${JSON.stringify(label)} || aria === ${JSON.stringify(label)} || text.startsWith(${JSON.stringify(label)}) })
  if (!hit) return null
  const rect = hit.getBoundingClientRect()
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
})()`)
const pointOfPreviewButton = async (label) => evaluate(`(() => {
  const buttons = [...document.querySelectorAll('.dit-preview-toolbar button')]
  const hit = buttons.find((node) => {
    const text = (node.textContent || '').trim()
    const aria = node.getAttribute('aria-label') || ''
    return text === ${JSON.stringify(label)} || aria === ${JSON.stringify(label)} || text.startsWith(${JSON.stringify(label)})
  })
  if (!hit) return null
  const rect = hit.getBoundingClientRect()
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
})()`)
const previewState = async () => evaluate(`(() => {
  const preview = document.querySelector('.dit-preview')
  if (!preview) return null
  const toolbar = document.querySelector('.dit-preview-toolbar')
  const stage = document.querySelector('.dit-preview-stage')
  const image = document.querySelector('.dit-preview-image')
  const buttons = [...document.querySelectorAll('.dit-preview button')].map((node) => {
    const rect = node.getBoundingClientRect()
    return { label: (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 30), top: Math.round(rect.top), bottom: Math.round(rect.bottom), left: Math.round(rect.left) }
  })
  const style = image ? getComputedStyle(image) : null
  const matrix = style ? style.transform : null
  const pct = document.querySelector('.dit-tb-pct') ? document.querySelector('.dit-tb-pct').textContent.trim() : null
  const page = document.querySelector('.dit-tb-page') ? document.querySelector('.dit-tb-page').textContent.trim() : null
  return {
    toolbarTop: toolbar ? Math.round(toolbar.getBoundingClientRect().top) : null,
    toolbarBottom: toolbar ? Math.round(toolbar.getBoundingClientRect().bottom) : null,
    stageTop: stage ? Math.round(stage.getBoundingClientRect().top) : null,
    stageRect: stage ? { width: Math.round(stage.getBoundingClientRect().width), height: Math.round(stage.getBoundingClientRect().height) } : null,
    imageRect: image ? { left: Math.round(image.getBoundingClientRect().left), top: Math.round(image.getBoundingClientRect().top), width: Math.round(image.getBoundingClientRect().width), height: Math.round(image.getBoundingClientRect().height) } : null,
    imageTransform: matrix,
    pct,
    page,
    buttons,
    minButtonTop: buttons.length ? Math.min(...buttons.map((button) => button.top)) : null,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    safeTop: getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-overlay-top').trim(),
    gallery: document.querySelectorAll('.dit-gallery').length,
  }
})()`)

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
try {
  await send('Browser.grantPermissions', {
    origin: new URL(url).origin,
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  })
} catch (error) {
  report.steps.push({ name: 'clipboard-permission', ok: false, detail: String(error).slice(0, 120) })
}

await send('Page.navigate', { url })
await sleep(7000)
// Screenshot privacy: keep the real preview but darken/blur the application
// behind it so verification images can be committed without user content.
await evaluate(`(() => {
  const existing = document.getElementById('verify-redact')
  if (existing) return true
  const style = document.createElement('style')
  style.id = 'verify-redact'
  style.textContent = 'html, body {--dsw-alias-bg-mask-1: rgba(12,14,18,.9) !important; --dsw-mask-blur: blur(10px) !important}'
  document.head.appendChild(style)
  return true
})()`)
await evaluate(`(() => {
  for (const needle of ['继续', '开始使用', '我知道了']) {
    const button = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').trim().startsWith(needle))
    if (button) { button.click(); return true }
  }
  return false
})()`)
await sleep(500)

// One new session per run: click the composer's new-chat entry.
const created = await evaluate(`(() => {
  const needles = ['新对话', '新会话', '新建对话', 'New chat']
  const buttons = [...document.querySelectorAll('button')]
  for (const needle of needles) {
    const hit = buttons.find((node) => (node.textContent || '').trim().startsWith(needle))
    if (hit) { hit.click(); return (hit.textContent || '').trim() }
  }
  return null
})()`)
check('new-session', created !== null, created)
await sleep(1600)

const focused = await evaluate(`(() => {
  const editor = document.querySelector('[contenteditable="true"]')
  if (!editor) return false
  editor.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
})()`)
check('composer-focus', focused === true)

await send('Input.insertText', { text: '插件预览验收：请保留这张图' })
await sleep(300)
for (const fixture of fixtures) {
  const base64 = readFileSync(fixture).toString('base64')
  const name = fixture.split(/[\\/]/).pop()
  await evaluate(`(async () => {
    const response = await fetch('data:image/png;base64,${base64}')
    const blob = await response.blob()
    const file = new File([blob], ${JSON.stringify(name)}, { type: 'image/png' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    const editor = document.querySelector('[contenteditable="true"]')
    if (!editor) return 'no-editor'
    editor.focus()
    editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }))
    return 'ok'
  })()`)
  await sleep(900)
}
await pressKey('Enter', 'Enter', 13)
await sleep(3200)

const gallery = await evaluate(`(() => {
  const images = [...document.querySelectorAll('.dit-gallery img')]
  return {
    galleries: document.querySelectorAll('.dit-gallery').length,
    tiles: document.querySelectorAll('.dit-frame').length,
    images: images.length,
    first: images[0] ? { naturalWidth: images[0].naturalWidth, naturalHeight: images[0].naturalHeight } : null,
  }
})()`)
check('gallery-rendered', gallery.galleries >= 1 && gallery.images >= 1, gallery)
report.fixtures = fixtures.map((file) => ({
  file: file.split(/[\\\\/]/).pop(),
  bytes: statSync(file).size,
  sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
}))

// Emulate the Windows desktop caption contract before opening the preview.
const safe = await evaluate(`(() => {
  document.documentElement.setAttribute('data-windows-titlebar', '')
  document.documentElement.style.setProperty('--dsh-windows-titlebar-height', '40px')
  const value = getComputedStyle(document.documentElement).getPropertyValue('--dsh-frame-overlay-top').trim()
  return value
})()`)
check('caption-safe-area', typeof safe === 'string' && (safe === '60px' || (safe.includes('40px') && safe.includes('20px'))), safe)

const thumbPoint = await evaluate(`(() => {
  const thumb = document.querySelector('.dit-frame .dit-thumb')
  if (!thumb) return null
  const rect = thumb.getBoundingClientRect()
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
})()`)
check('thumbnail-present', thumbPoint !== null)
await clickPoint(thumbPoint)
await sleep(700)
let state = await previewState()
check('preview-opens', state !== null)
if (state !== null) {
  check('toolbar-bottom-only', state.minButtonTop !== null && state.minButtonTop >= 60, { minButtonTop: state.minButtonTop })
  check('stage-clears-caption', state.stageTop !== null && state.stageTop >= 60, { stageTop: state.stageTop, safeTop: state.safeTop })
  check('toolbar-inside-viewport', state.toolbarBottom !== null && state.toolbarBottom <= state.viewport.height, { toolbarBottom: state.toolbarBottom, viewport: state.viewport })
  check('preview-has-image', state.imageRect !== null, state.imageRect)
  report.fit = state
  await capture('10-preview-fit.png')
}

const center = await evaluate(`(() => {
  const image = document.querySelector('.dit-preview-image')
  if (!image) return null
  const rect = image.getBoundingClientRect()
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
})()`)

// Wheel zoom in at the pointer.
if (center) {
  await mouse('mouseMoved', center.x, center.y)
  await mouse('mouseWheel', center.x, center.y, { deltaY: -240 })
  await sleep(500)
  const zoomed = await previewState()
  const fitScale = Number((report.fit?.pct || '100%').replace('%', '')) / 100
  const zoomScale = zoomed ? Number((zoomed.pct || '0%').replace('%', '')) / 100 : 0
  check('wheel-zoom-in', zoomed !== null && zoomScale > fitScale, { fit: report.fit?.pct, zoomed: zoomed?.pct })
  report.zoom = zoomed
  await capture('11-preview-zoom.png')

  // Drag pan, then double-click back to fit.
  const before = zoomed
  await mouse('mousePressed', center.x, center.y, { button: 'left', buttons: 1, clickCount: 1 })
  await mouse('mouseMoved', center.x + 90, center.y + 50, { buttons: 1 })
  const dragging = await evaluate(`(() => document.querySelector('.dit-preview-stage')?.getAttribute('data-dragging') || null)()`)
  check('drag-state', dragging === 'true', dragging)
  await mouse('mouseReleased', center.x + 90, center.y + 50, { button: 'left', buttons: 0, clickCount: 1 })
  await sleep(300)
  const dragged = await previewState()
  check('drag-pans', dragged !== null && dragged.imageTransform !== before?.imageTransform, { before: before?.imageTransform, after: dragged?.imageTransform })

  await mouse('mousePressed', center.x, center.y, { button: 'left', buttons: 1, clickCount: 1 })
  await mouse('mouseReleased', center.x, center.y, { button: 'left', buttons: 0, clickCount: 1 })
  await mouse('mousePressed', center.x, center.y, { button: 'left', buttons: 1, clickCount: 2 })
  await mouse('mouseReleased', center.x, center.y, { button: 'left', buttons: 0, clickCount: 2 })
  await sleep(400)
  const fitted = await previewState()
  check('double-click-resets-fit', fitted !== null && fitted.imageTransform === report.fit?.imageTransform, { pct: fitted?.pct })

  // Keyboard zoom and reset.
  await pressKey('+', 'Equal', 187, 8)
  const keyZoom = await previewState()
  check('keyboard-zoom', keyZoom !== null && Number((keyZoom.pct || '0%').replace('%', '')) > Number((fitted?.pct || '0%').replace('%', '')), { pct: keyZoom?.pct })
  await pressKey('0', 'Digit0', 48)
  const keyReset = await previewState()
  check('keyboard-fit', keyReset !== null && keyReset.imageTransform === report.fit?.imageTransform, { pct: keyReset?.pct })
}

// Copy through the toolbar.
const copyPoint = await pointOfPreviewButton('复制图片')
if (copyPoint) {
  await clickPoint(copyPoint)
  await sleep(1000)
  const toast = await evaluate(`(() => { const node = document.querySelector('.dit-toast'); return node ? (node.innerText || '').replace(/\\s+/g, ' ').trim() : null })()`)
  check('copy-toast', typeof toast === 'string' && toast.includes('已复制'), toast)
  const clipboard = await evaluate(`(async () => { try { const items = await navigator.clipboard.read(); return items.map((item) => item.types) } catch (error) { return 'read failed: ' + String(error).slice(0, 100) } })()`)
  report.clipboard = clipboard
  await capture('12-copy-toast.png')
} else {
  check('copy-button', false, 'missing')
}

// Download and compare bytes with the fixture.
const downloadPoint = await pointOfPreviewButton('下载原图')
if (downloadPoint) {
  await clickPoint(downloadPoint)
  await sleep(2500)
  const entries = readdirSync(downloadDir).filter((name) => !name.endsWith('.crdownload'))
  report.downloaded = entries.map((name) => {
    const file = join(downloadDir, name)
    const bytes = readFileSync(file)
    return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  })
  const first = report.fixtures[0]
  check('download-bytes', report.downloaded.length === 1 && report.downloaded[0].sha256 === first.sha256, { downloaded: report.downloaded, fixture: first })
}

// Dark theme and narrow window with the same preview.
await sleep(2200)
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
await sleep(900)
await capture('13-preview-dark.png')
await send('Emulation.setEmulatedMedia', { features: [] })
await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 800, deviceScaleFactor: 2, mobile: false })
await sleep(800)
const narrow = await previewState()
check('narrow-toolbar-fits', narrow !== null && narrow.toolbarBottom !== null && narrow.toolbarBottom <= narrow.viewport.height, { toolbar: narrow?.toolbarBottom, viewport: narrow?.viewport })
check('narrow-no-caption-controls', narrow !== null && narrow.minButtonTop !== null && narrow.minButtonTop >= 60, { minButtonTop: narrow?.minButtonTop })
await capture('14-preview-narrow.png')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
await sleep(500)

// Esc closes; menu still works from the thumbnail.
await pressKey('Escape', 'Escape', 27)
await sleep(400)
const closed = await evaluate(`(() => document.querySelector('.dit-preview') === null)()`)
check('escape-closes', closed === true)
const thumbAgain = await evaluate(`(() => {
  const thumb = document.querySelector('.dit-frame .dit-thumb')
  if (!thumb) return null
  const rect = thumb.getBoundingClientRect()
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
})()`)
if (thumbAgain) {
  await mouse('mouseMoved', thumbAgain.x, thumbAgain.y)
  await mouse('mousePressed', thumbAgain.x, thumbAgain.y, { button: 'right', buttons: 2, clickCount: 1 })
  await mouse('mouseReleased', thumbAgain.x, thumbAgain.y, { button: 'right', buttons: 0, clickCount: 1 })
  await sleep(500)
  const menu = await evaluate(`(() => { const node = document.querySelector('.dit-menu'); return node ? (node.innerText || '').replace(/\\s+/g, ' ').trim() : null })()`)
  check('context-menu', typeof menu === 'string' && menu.includes('复制图片'), menu)
  await capture('15-thumbnail-menu.png')
  await pressKey('Escape', 'Escape', 27)
}

writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
const failed = failures.length > 0
console.log(JSON.stringify({ ok: !failed, failures, steps: report.steps }, null, 2))
socket.close()
process.exit(failed ? 1 : 0)








