// Whole-conversation paging verification, driven from a Markdown image entry.
//   node verify-conversation2.mjs <url> <sessionTitleSubstring> <outDir> [port]
const [url, titlePart, outDir, port = '9222'] = process.argv.slice(2)
if (!url || !titlePart || !outDir) { console.error('usage: node verify-conversation2.mjs <url> <titlePart> <outDir> [port]'); process.exit(2) }
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
mkdirSync(outDir, { recursive: true })
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = targets.find((target) => target.type === 'page')
if (!page) { console.error('no page target'); process.exit(3) }
const socket = new WebSocket(page.webSocketDebuggerUrl)
const pending = new Map()
let nextId = 0
socket.addEventListener('message', (event) => { const message = JSON.parse(event.data); if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) } })
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })) })
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const failures = []
const report = { steps: [] }
const check = (name, ok, detail) => {
  report.steps.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) })
  if (!ok) failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
}
const evaluate = async (expression) => {
  const message = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (message.result?.exceptionDetails) throw new Error(JSON.stringify(message.result.exceptionDetails).slice(0, 700))
  return message.result?.result?.value
}
const capture = async (name) => {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(join(outDir, name), Buffer.from(shot.result.data, 'base64'))
  report.steps.push({ name: 'screenshot:' + name, ok: true })
}
const mouse = async (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', {
  type, x, y, buttons: extra.buttons ?? 0, button: extra.button ?? 'none', clickCount: extra.clickCount ?? 0,
})
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
const probe = async () => evaluate(`(() => {
  const label = document.querySelector('.dit-tb-page')
  const text = label ? label.textContent.trim() : ''
  const match = /(\\d+)\\s*\\/\\s*(\\d+)/.exec(text)
  const image = document.querySelector('.dit-preview-image')
  const diagnostics = globalThis.__DSH_IMAGE_TOOLS__
  return {
    text,
    current: match ? Number(match[1]) : null,
    total: match ? Number(match[2]) : null,
    src: image ? (image.getAttribute('src') || '').slice(-32) : null,
    strip: document.querySelectorAll('.dit-strip-thumb').length,
    preview: document.querySelector('.dit-preview') !== null,
    stateText: (() => { const node = document.querySelector('.dit-preview-state'); return node ? (node.textContent || '').trim() : null })(),
    loaderAvailable: typeof diagnostics?.bridgeLoaderAvailable === 'function' ? diagnostics.bridgeLoaderAvailable() : null,
    sessionsAvailable: typeof diagnostics?.sessionsServiceAvailable === 'function' ? diagnostics.sessionsServiceAvailable() : null,
    indexSessionId: typeof diagnostics?.indexSessionId === 'function' ? diagnostics.indexSessionId() : null,
    kinds: typeof diagnostics?.conversationImageKinds === 'function' ? diagnostics.conversationImageKinds() : null,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    bridgeCount: typeof diagnostics?.bridgeActivationCount === 'function' ? diagnostics.bridgeActivationCount() : null,
    menus: document.querySelectorAll('[role="menu"]').length,
    nextHit: (() => {
      const button = [...document.querySelectorAll('.dit-preview-toolbar button')].find((node) => (node.getAttribute('aria-label') || '') === '下一张')
      if (!button) return null
      const rect = button.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return {
        hit: hit ? hit.tagName + '.' + (hit.className || '').toString().slice(0, 40) : null,
        isButton: hit === button || button.contains(hit),
      }
    })(),
  }
})()`)
const markdownPoint = async (index) => evaluate(`(() => {
  const buttons = [...document.querySelectorAll('[class*="markdown"] button')].filter((node) => {
    const image = node.querySelector('img')
    return image instanceof HTMLImageElement && image.naturalWidth >= 160 && getComputedStyle(node).cursor === 'zoom-in'
  })
  const button = buttons[${index}]
  if (!button) return null
  button.scrollIntoView({ block: 'center' })
  const rect = button.getBoundingClientRect()
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2), count: buttons.length }
})()`)

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
await send('Page.navigate', { url })
await sleep(7000)
await evaluate(`(() => {
  for (const needle of ['继续', '开始使用', '我知道了']) {
    const button = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').trim().startsWith(needle))
    if (button) button.click()
  }
  for (const row of document.querySelectorAll('[role="treeitem"]')) {
    if (row.getAttribute('aria-expanded') === 'false') row.click()
  }
  return true
})()`)
await sleep(1400)
let opened = false
for (let attempt = 0; attempt < 18 && !opened; attempt += 1) {
  opened = await evaluate(`(() => {
    const node = [...document.querySelectorAll('span[class*="_title"]')].find((span) => (span.textContent || '').trim().includes(${JSON.stringify(titlePart)}))
    if (!node) return false
    const row = node.closest('[role="treeitem"]')
    row.scrollIntoView({ block: 'center' })
    row.click()
    return true
  })()`)
  if (!opened) { await evaluate(`(() => { const tree = document.querySelector('[role="tree"]'); if (tree) tree.scrollTop = Math.min(tree.scrollHeight, tree.scrollTop + 480); return true })()`); await sleep(500) }
}
check('session-opened', opened, titlePart)
await sleep(3000)

// Load older turns and expand collapsed rows until a Markdown image renders.
let markdownCount = 0
for (let round = 0; round < 12; round += 1) {
  const state = await evaluate(`(() => {
    const scroller = document.querySelector('[class*="scrollBody"]')
    if (scroller) scroller.scrollTop = 0
    const older = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').includes('加载更早') && !node.disabled)
    if (older) older.click()
    const scrollerForRows = document.querySelector('[class*="scrollBody"]')
    for (const button of [...document.querySelectorAll('button[aria-expanded="false"]')].filter((node) => scrollerForRows && scrollerForRows.contains(node)).slice(0, 40)) button.click()
    const buttons = [...document.querySelectorAll('[class*="markdown"] button')].filter((node) => {
      const image = node.querySelector('img')
      return image instanceof HTMLImageElement && image.naturalWidth >= 160 && getComputedStyle(node).cursor === 'zoom-in'
    })
    return { count: buttons.length }
  })()`)
  markdownCount = Math.max(markdownCount, state.count)
  if (markdownCount >= 3) break
  await sleep(700)
}
check('markdown-images-available', markdownCount >= 1, { markdownCount })
for (let dismiss = 0; dismiss < 3; dismiss += 1) await pressEscape()
// Expansion can leave shipped menus/popovers open; close them before the
// click test so the preview is not competing with another overlay.
for (let attempt = 0; attempt < 8; attempt += 1) {
  const menus = await evaluate(`(() => document.querySelectorAll('[role="menu"]').length)()`)
  if (menus === 0) break
  await pressEscape()
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 720, y: 420 })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 420, button: 'left', buttons: 1, clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 420, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(300)
}

const candidates = await evaluate(`(() => [...document.querySelectorAll('[class*="markdown"] button')].map((node) => {
  const image = node.querySelector('img')
  if (!(image instanceof HTMLImageElement)) return null
  const diagnostics = globalThis.__DSH_IMAGE_TOOLS__
  return {
    src: image.currentSrc || image.src,
    alt: image.getAttribute('alt') || '',
    index: typeof diagnostics?.markdownIndexOf === 'function' ? diagnostics.markdownIndexOf(image.currentSrc || image.src, image.getAttribute('alt') || '') : -1,
  }
}).filter(Boolean))()`)
report.steps.push({ name: 'markdown-candidates', ok: true, detail: candidates.map((c) => ({ index: c.index, tail: c.src.slice(-28) })) })
const usable = candidates.filter((candidate) => candidate.index >= 0)
const jsClickMarkdown = async (src) => evaluate(`(() => {
  const buttons = [...document.querySelectorAll('[class*="markdown"] button')]
  const hit = buttons.find((node) => { const image = node.querySelector('img'); return image && (image.currentSrc || image.src) === ${JSON.stringify(src)} })
  if (!hit) return false
  hit.scrollIntoView({ block: 'center' })
  hit.click()
  return true
})()`)

let openedState = null
let firstCandidate = null
for (const candidate of usable) {
  const before = await probe()
  const clicked = await jsClickMarkdown(candidate.src)
  if (!clicked) continue
  await sleep(1000)
  const state = await probe()
  const bridgeOpened = state.preview === true && state.dialogs === 1
    && before.bridgeCount !== null && state.bridgeCount === before.bridgeCount + 1
  if (bridgeOpened) { openedState = state; firstCandidate = candidate; break }
  // A shipped lightbox may have opened while a popover swallowed the click;
  // close whatever is up and try the next candidate.
  await pressEscape()
  await sleep(400)
}
if (openedState !== null) {
  check('preview-opens', openedState.preview === true, openedState)
  check('entry-index', firstCandidate !== null && openedState.current === firstCandidate.index + 1, {
    expected: firstCandidate ? firstCandidate.index : null, current: openedState.current,
  })
  check('conversation-kinds', openedState.kinds !== null && openedState.kinds.total > 3
    && openedState.kinds.attachment > 0 && openedState.kinds.markdown > 0, openedState.kinds)
  check('pager-uses-conversation-total', openedState.total === openedState.kinds?.total, {
    page: openedState.total, kinds: openedState.kinds,
  })
  await capture('40-conversation-markdown.png')

  let previous = openedState
  for (let step = 0; step < 3; step += 1) {
    const next = await evaluate(`(() => {
      const button = [...document.querySelectorAll('.dit-preview-toolbar button')].find((node) => (node.getAttribute('aria-label') || '') === '下一张')
      if (!button || button.disabled) return null
      const rect = button.getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    })()`)
    if (!next) break
    await clickPoint(next)
    await sleep(2200)
    const state = await probe()
    check('next-across-turns-' + (step + 1), state.current === previous.current + 1 && state.total === previous.total && state.src !== previous.src, {
      before: { current: previous.current, src: previous.src }, after: { current: state.current, src: state.src },
    })
    previous = state
  }
  check('strip-window', previous.strip > 0 && previous.strip <= 9, { strip: previous.strip, total: previous.total })

  // Walk back into the attachment region: those preview pages are resolved
  // through the sessions-service loader, not a mounted gallery.
  let backState = previous
  for (let step = 0; step < 20 && backState.current !== null && backState.current > 1; step += 1) {
    const prev = await evaluate(`(() => {
      const button = [...document.querySelectorAll('.dit-preview-toolbar button')].find((node) => (node.getAttribute('aria-label') || '') === '上一张')
      if (!button || button.disabled) return null
      const rect = button.getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    })()`)
    if (!prev) break
    await clickPoint(prev)
    await sleep(900)
    backState = await probe()
  }
  check('attachment-page-loads', backState.preview === true && typeof backState.src === 'string' && backState.src !== '' && backState.stateText === null, backState)
  await pressEscape()

  const other = usable.find((candidate) => candidate.index !== openedState.current)
  if (other) {
    const clicked = await jsClickMarkdown(other.src)
    await sleep(1000)
    const second = await probe()
    check('different-entry-index', clicked === true && second.preview === true && second.total === openedState.total && second.current === other.index + 1, {
      expected: other.index, first: openedState.current, second: second.current,
    })
  } else {
    report.steps.push({ name: 'different-entry-index', ok: true, detail: 'single markdown entry' })
  }
} else {
  check('preview-opens', false, { candidates: candidates.map((c) => ({ index: c.index, tail: c.src.slice(-28) })) })
}
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ok: failures.length === 0, failures, steps: report.steps }, null, 2))
socket.close()
process.exit(failures.length === 0 ? 0 : 1)


