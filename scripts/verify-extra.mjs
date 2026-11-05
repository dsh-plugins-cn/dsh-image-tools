// Extra surfaces: the trajectory view thumbnails and the plugin list entry.
//
//   node scripts/verify-extra.mjs <outDir> [port]
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [outDir, port = '9222'] = process.argv.slice(2)
if (!outDir) {
  console.error('usage: node scripts/verify-extra.mjs <outDir> [port]')
  process.exit(2)
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = targets.find((target) => target.type === 'page')
if (!page) process.exit(3)
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
  if (message.result?.exceptionDetails) console.error('eval failed:', JSON.stringify(message.result.exceptionDetails).slice(0, 300))
  return message.result?.result?.value
}
const capture = async (name) => {
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = join(outDir, name)
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'))
  return file
}

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
const report = { files: [] }

report.trajectoryClicked = await evaluate(`(() => {
  const tab = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').trim() === '轨迹')
  if (!tab) return false
  tab.click()
  return true
})()`)
await sleep(1400)
report.trajectory = await evaluate(`(() => ({
  thumbnails: document.querySelectorAll('.dit-frame[data-variant="thumbnail"]').length,
  frames: document.querySelectorAll('.dit-frame').length,
  cups: document.querySelectorAll('.dit-acts').length,
}))()`)
report.files.push(await capture('30-trajectory.png'))

await evaluate(`(() => {
  const tab = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').trim() === '对话')
  if (tab) tab.click()
  return Boolean(tab)
})()`)
await sleep(600)

report.pluginsClicked = await evaluate(`(() => {
  const row = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').trim() === '插件')
  if (!row) return false
  row.click()
  return true
})()`)
await sleep(1600)
report.pluginList = await evaluate(`(() => ({
  mentionsImageTools: (document.body.innerText || '').includes('图片复制与下载'),
  icons: [...document.querySelectorAll('img')].filter((img) => (img.src || '').includes('icon')).length,
}))()`)
report.files.push(await capture('31-plugin-list.png'))

console.log(JSON.stringify(report, null, 2))
socket.close()