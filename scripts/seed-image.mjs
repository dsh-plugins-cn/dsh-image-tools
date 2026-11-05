// Seed a fresh session with one pasted image for visual verification.
//
//   node scripts/seed-image.mjs <sample.png> <out.png> [port] [text]
//
// Connects to a Chrome started with --remote-debugging-port, dismisses the
// preview notice, opens a new session, pastes the image into the composer,
// inserts a prompt and presses Enter. Prints probe counters and captures the
// rendered conversation.
import { readFileSync, writeFileSync } from 'node:fs'

const [imagePath, outPath, port = '9222', text = '请看一下这张部署截图'] = process.argv.slice(2)
if (!imagePath || !outPath) {
  console.error('usage: node scripts/seed-image.mjs <sample.png> <out.png> [port] [text]')
  process.exit(2)
}
const base64 = readFileSync(imagePath).toString('base64')

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

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })

const dismissed = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').trim().startsWith('继续'))
  if (button) button.click()
  return Boolean(button)
})()`)
await sleep(400)

const created = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').trim().startsWith('新会话'))
  if (button) button.click()
  return Boolean(button)
})()`)
await sleep(1500)

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
await sleep(300)

if (text) {
  await send('Input.insertText', { text })
  await sleep(300)
}

const pasted = await evaluate(`(async () => {
  const response = await fetch('data:image/png;base64,${base64}')
  const blob = await response.blob()
  const file = new File([blob], 'deploy-sample.png', { type: 'image/png' })
  const transfer = new DataTransfer()
  transfer.items.add(file)
  const editor = document.querySelector('[contenteditable="true"]')
  if (!editor) return 'no-editor'
  editor.focus()
  const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })
  editor.dispatchEvent(event)
  return 'ok'
})()`)
await sleep(2000)

const draft = await evaluate(`(() => ({
  draftThumbs: document.querySelectorAll('img[src^="blob:"]').length,
  sendButtons: document.querySelectorAll('button').length
}))()`)

const sent = await evaluate(`(() => {
  const editor = document.querySelector('[contenteditable="true"]')
  if (!editor) return 'no-editor'
  editor.focus()
  const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })
  editor.dispatchEvent(event)
  return 'enter'
})()`)
await sleep(3500)

const probe = await evaluate(`(() => ({
  galleries: document.querySelectorAll('.dit-gallery').length,
  galleryImages: document.querySelectorAll('.dit-gallery img').length,
  thumbs: document.querySelectorAll('.dit-thumb').length,
  hoverCups: document.querySelectorAll('.dit-acts').length,
  overlays: document.querySelectorAll('.dit-layer').length,
  bodyText: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 240)
}))()`)

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
writeFileSync(outPath, Buffer.from(shot.result.data, 'base64'))

console.log(JSON.stringify({ dismissed, created, focused, pasted, draft, sent, probe, screenshot: outPath }, null, 2))
socket.close()