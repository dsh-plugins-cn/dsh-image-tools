// Verify the Markdown-image bridge on a real session that contains markdown
// images (assistant text or tool output), opening the plugin preview from the
// official image button.
//
//   node scripts/verify-markdown.mjs <url> <sessionTitle> <outDir> [port]
//
// The page gets a stronger mask override while screenshots are taken so the
// committed verification images do not expose the surrounding conversation.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [url, sessionTitle, outDir, port = '9222'] = process.argv.slice(2)
if (!url || !sessionTitle || !outDir) {
  console.error('usage: node scripts/verify-markdown.mjs <url> <sessionTitle> <outDir> [port]')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })
const downloadDir = join(outDir, '.downloads')
rmSync(downloadDir, { recursive: true, force: true })
mkdirSync(downloadDir, { recursive: true })

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = targets.find((target) => target.type === 'page')
if (!page) { console.error('no page target'); process.exit(3) }
const socket = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
let nextId = 0
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) }
})
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })) })
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const failures = []
const report = { sessionTitle, steps: [] }
const check = (name, ok, detail) => {
  report.steps.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) })
  if (!ok) failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
}
const evaluate = async (expression) => {
  const message = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (message.result?.exceptionDetails) throw new Error(JSON.stringify(message.result.exceptionDetails).slice(0, 600))
  return message.result?.result?.value
}
const capture = async (name) => {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(join(outDir, name), Buffer.from(shot.result.data, 'base64'))
  report.steps.push({ name: 'screenshot:' + name, ok: true })
}
const mouse = async (type, x, y, extra = {}) => {
  await send('Input.dispatchMouseEvent', {
    type, x, y, buttons: extra.buttons ?? 0, button: extra.button ?? 'none', clickCount: extra.clickCount ?? 0,
    ...(extra.deltaY === undefined ? {} : { deltaX: 0, deltaY: extra.deltaY }),
  })
}
const clickPoint = async (point) => {
  await mouse('mouseMoved', point.x, point.y)
  await mouse('mousePressed', point.x, point.y, { button: 'left', buttons: 1, clickCount: 1 })
  await mouse('mouseReleased', point.x, point.y, { button: 'left', buttons: 0, clickCount: 1 })
}
const pressEscape = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(300)
}
const toolbarPoint = async (label) => evaluate(`(() => {
  const hit = [...document.querySelectorAll('.dit-preview-toolbar button')].find((node) => {
    const text = (node.textContent || '').trim()
    const aria = node.getAttribute('aria-label') || ''
    return text === ${JSON.stringify(label)} || aria === ${JSON.stringify(label)} || text.startsWith(${JSON.stringify(label)})
  })
  if (!hit) return null
  const rect = hit.getBoundingClientRect()
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
})()`)
const previewProbe = async () => evaluate(`(() => {
  const preview = document.querySelector('.dit-preview')
  const dialog = document.querySelector('[role="dialog"]')
  const image = document.querySelector('.dit-preview-image')
  const pct = document.querySelector('.dit-tb-pct')
  const page = document.querySelector('.dit-tb-page')
  return {
    pluginPreview: preview !== null,
    dialogClass: dialog ? (dialog.className || '').toString().slice(0, 80) : null,
    toolbarButtons: [...document.querySelectorAll('.dit-preview-toolbar button')].map((node) => (node.getAttribute('aria-label') || node.textContent || '').trim().slice(0, 16)),
    pct: pct ? pct.textContent.trim() : null,
    page: page ? page.textContent.trim() : null,
    strip: document.querySelectorAll('.dit-strip-thumb').length,
    transform: image ? getComputedStyle(image).transform : null,
  }
})()`)

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
try {
  await send('Browser.grantPermissions', { origin: new URL(url).origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] })
} catch (error) { report.steps.push({ name: 'clipboard-permission', ok: false, detail: String(error).slice(0, 120) }) }
await send('Page.navigate', { url })
await sleep(7000)
await evaluate(`(() => {
  const style = document.createElement('style')
  style.id = 'verify-redact'
  style.textContent = 'html, body {--dsw-alias-bg-mask-1: rgba(12,14,18,.9) !important; --dsw-mask-blur: blur(10px) !important}'
  document.head.appendChild(style)
  for (const needle of ['继续', '开始使用', '我知道了']) {
    const button = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').trim().startsWith(needle))
    if (button) button.click()
  }
  for (const row of document.querySelectorAll('[role="treeitem"]')) {
    if (row.getAttribute('aria-expanded') === 'false') row.click()
  }
  return true
})()`)
await sleep(1500)

// Open the target session from the sidebar tree.
let opened = false
for (let attempt = 0; attempt < 16 && !opened; attempt += 1) {
  opened = await evaluate(`(() => {
    const node = [...document.querySelectorAll('span[class*="_title"]')].find((span) => (span.textContent || '').trim().includes(${JSON.stringify(sessionTitle)}))
    if (!node) return false
    const row = node.closest('[role="treeitem"]')
    if (!row) return false
    row.scrollIntoView({ block: 'center' })
    row.click()
    return true
  })()`)
  if (!opened) {
    await evaluate(`(() => { const tree = document.querySelector('[role="tree"]'); if (tree) tree.scrollTop = Math.min(tree.scrollHeight, tree.scrollTop + 480); return true })()`)
    await sleep(500)
  }
}
check('session-opened', opened, sessionTitle)
await sleep(3000)

const markdown = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('[class*="markdown"] button')].filter((node) => {
    const image = node.querySelector('img')
    if (!(image instanceof HTMLImageElement)) return false
    if (image.naturalWidth < 160 || image.naturalHeight < 120) return false
    return getComputedStyle(node).cursor === 'zoom-in'
  })
  return { count: buttons.length, srcs: buttons.slice(0, 6).map((node) => (node.querySelector('img').src || '').slice(0, 24)) }
})()`)
check('markdown-images-found', markdown.count > 0, markdown)
if (markdown.count === 0) {
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: false, failures, steps: report.steps }, null, 2))
  socket.close()
  process.exit(1)
}

const target = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('[class*="markdown"] button')].filter((node) => {
    const image = node.querySelector('img')
    if (!(image instanceof HTMLImageElement)) return false
    if (image.naturalWidth < 160 || image.naturalHeight < 120) return false
    return getComputedStyle(node).cursor === 'zoom-in'
  })
  const button = buttons[0]
  button.scrollIntoView({ block: 'center' })
  const rect = button.getBoundingClientRect()
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
})()`)
if (target) {
  await clickPoint(target)
  await sleep(1000)
  const state = await previewProbe()
  check('markdown-opens-plugin-preview', state.pluginPreview === true && state.dialogClass === 'dit-preview', state)
  check('markdown-toolbar', state.toolbarButtons.includes('缩小') && state.toolbarButtons.includes('复制图片'), state.toolbarButtons)
  check('markdown-paging', state.strip === Math.min(markdown.count, state.strip) && state.strip >= 1, { strip: state.strip, markdown: markdown.count })
  await capture('30-markdown-preview.png')

  const imagePoint = await evaluate(`(() => {
    const image = document.querySelector('.dit-preview-image')
    if (!image) return null
    const rect = image.getBoundingClientRect()
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
  })()`)
  if (imagePoint) {
    await mouse('mouseMoved', imagePoint.x, imagePoint.y)
    await mouse('mouseWheel', imagePoint.x, imagePoint.y, { deltaY: -240 })
    await sleep(500)
    const zoomed = await previewProbe()
    const before = Number((state.pct || '100%').replace('%', ''))
    const after = Number((zoomed.pct || '0%').replace('%', ''))
    check('markdown-wheel-zoom', after > before, { before: state.pct, after: zoomed.pct })
    await capture('31-markdown-zoom.png')
  }

  const copyPoint = await toolbarPoint('复制图片')
  if (copyPoint) {
    await clickPoint(copyPoint)
    await sleep(1000)
    const toast = await evaluate(`(() => { const node = document.querySelector('.dit-toast'); return node ? (node.innerText || '').replace(/\\s+/g, ' ').trim() : null })()`)
    check('markdown-copy-toast', typeof toast === 'string' && toast.includes('已复制'), toast)
    report.clipboard = await evaluate(`(async () => { try { const items = await navigator.clipboard.read(); return items.map((item) => item.types) } catch (error) { return 'read failed: ' + String(error).slice(0, 80) } })()`)
  } else {
    check('markdown-copy-button', false, 'missing')
  }

  const downloadPoint = await toolbarPoint('下载原图')
  if (downloadPoint) {
    await clickPoint(downloadPoint)
    await sleep(2500)
    const entries = readdirSync(downloadDir).filter((name) => !name.endsWith('.crdownload'))
    report.downloaded = entries.map((name) => {
      const bytes = readFileSync(join(downloadDir, name))
      return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
    })
    check('markdown-download', report.downloaded.length >= 1 && report.downloaded[0].bytes > 0, report.downloaded)
  }

  await pressEscape()
  const closed = await evaluate(`(() => document.querySelector('.dit-preview') === null && !document.querySelector('._backdrop_19zw2_2'))()`)
  check('markdown-escape-closes', closed === true)
} else {
  check('markdown-target', false, 'missing')
}

writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ok: failures.length === 0, failures, steps: report.steps }, null, 2))
socket.close()
process.exit(failures.length === 0 ? 0 : 1)
