/**
 * dsh-image-tools — browser half.
 *
 * Takes over the four message-image slots and renders the gallery itself, so
 * every conversation image gains three entry points for the same actions:
 * a hover action cup on the thumbnail, a right-click menu, and the bottom
 * toolbar of the full-screen preview.
 *
 * The preview never places a control in the window-caption band (Windows
 * title-bar buttons, macOS traffic lights). Every preview control lives in a
 * bottom toolbar; the image stage clears DSH's own overlay-safe area through
 * `--dsh-frame-overlay-top`. Scales and pans are plain CSS transforms.
 *
 * Rules honoured here: no DOM scraping, no body-root writes, no imports from
 * other Client packages, theme tokens only, every registration through
 * `ctx.slots.inject` so disposal removes it.
 */
window.__ModuleLoader__.load({
  id: 'dsh-image-tools',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState, useSyncExternalStore } = React

    const NS = 'dsh-image-tools'
    const PRIORITY = 10
    const OVERLAY_ID = 'image-tools'
    const IMAGE_SLOTS = [
      'conversation.chat.user.images',
      'conversation.chat.message.images',
      'tool.call.images',
      'conversation.trajectory.images',
    ]

    const ZOOM_MIN = 0.25
    const ZOOM_MAX = 8
    const ZOOM_STEP = 1.25

    const MESSAGES = {
      zh: {
        'image.alt': '图片',
        'image.open': '打开原图',
        'image.openNamed': '打开原图：',
        'image.loading': '加载中…',
        'image.failed': '加载失败，点击重试',
        'menu.copy': '复制图片',
        'menu.copying': '复制中…',
        'menu.download': '下载原图',
        'menu.hint': '原图字节 · 不压缩 · 不写入磁盘',
        'menu.shortcut': 'Ctrl C',
        'preview.label': '图片预览',
        'preview.close': '关闭预览',
        'preview.closeShort': '关闭',
        'preview.esc': 'Esc 关闭预览',
        'preview.zoomOut': '缩小',
        'preview.zoomIn': '放大',
        'preview.fit': '适配',
        'preview.fitTitle': '适配窗口',
        'preview.resetZoom': '重置为 100%',
        'preview.prev': '上一张',
        'preview.next': '下一张',
        'preview.strip': '图片列表',
        'preview.page': '第 {current} / {total} 张',
        'preview.loadFailed': '图片加载失败',
        'preview.retry': '重试',
        'preview.zoomHint': '滚轮缩放 · 双击复位 · 放大后拖动平移 · Esc 关闭',
        'toast.copied': '已复制图片到剪贴板',
        'toast.copyFailed': '当前环境不支持复制图片',
        'toast.useDownload': '改用下载',
        'toast.downloadStarted': '已开始下载',
        'toast.downloadFailed': '下载失败',
      },
      en: {
        'image.alt': 'Image',
        'image.open': 'Open original',
        'image.openNamed': 'Open original: ',
        'image.loading': 'Loading…',
        'image.failed': 'Could not load. Click to retry.',
        'menu.copy': 'Copy image',
        'menu.copying': 'Copying…',
        'menu.download': 'Download original',
        'menu.hint': 'Original bytes · no recompression · nothing written to disk',
        'menu.shortcut': 'Ctrl C',
        'preview.label': 'Image preview',
        'preview.close': 'Close preview',
        'preview.closeShort': 'Close',
        'preview.esc': 'Esc to close',
        'preview.zoomOut': 'Zoom out',
        'preview.zoomIn': 'Zoom in',
        'preview.fit': 'Fit',
        'preview.fitTitle': 'Fit to window',
        'preview.resetZoom': 'Reset to 100%',
        'preview.prev': 'Previous image',
        'preview.next': 'Next image',
        'preview.strip': 'Images',
        'preview.page': 'Image {current} of {total}',
        'preview.loadFailed': 'Image failed to load',
        'preview.retry': 'Retry',
        'preview.zoomHint': 'Wheel to zoom · double-click to reset · drag to pan · Esc to close',
        'toast.copied': 'Image copied to the clipboard',
        'toast.copyFailed': 'Copying images is not supported here',
        'toast.useDownload': 'Download instead',
        'toast.downloadStarted': 'Download started',
        'toast.downloadFailed': 'Download failed',
      },
    }

    let translate = (key) => (MESSAGES.zh[key] !== undefined ? MESSAGES.zh[key] : key)
    const t = (key) => translate(key)
    const fill = (key, values) => t(key).replace(/\{(\w+)\}/g, (match, name) => (values[name] === undefined ? match : String(values[name])))

    const CSS = `
.dit-gallery{display:flex;flex-wrap:wrap;gap:10px;max-width:100%}
.dit-gallery[data-align="end"]{justify-content:flex-end;align-self:flex-end}
.dit-gallery[data-align="start"]{justify-content:flex-start;align-self:flex-start}
.dit-frame{position:relative;flex:none;display:grid;place-items:center;min-width:44px;min-height:44px;padding:0;overflow:hidden;border:.5px solid var(--dsw-alias-border-l2-darkmode-thin);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-interactive-bg-hover)}
.dit-frame[data-variant="tile"]{width:64px;min-width:64px;height:64px;min-height:64px}
.dit-frame[data-variant="thumbnail"]{box-sizing:border-box;width:48px;min-width:48px;height:48px;min-height:48px;padding:2px;border-radius:var(--dsw-radius-lg)}
.dit-thumb{all:unset;display:block;width:100%;height:100%;cursor:zoom-in;border-radius:inherit}
.dit-thumb:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}
.dit-frame img{display:block;width:100%;height:100%;object-fit:cover}
.dit-frame[data-variant="thumbnail"] img{object-fit:contain}
.dit-acts{position:absolute;top:4px;right:4px;display:flex;gap:2px;padding:3px;border-radius:999px;background:rgba(15,17,21,.62);backdrop-filter:blur(6px);opacity:0;pointer-events:none;transition:opacity .12s ease}
.dit-frame:hover .dit-acts,.dit-frame:focus-within .dit-acts{opacity:1;pointer-events:auto}
.dit-act{width:22px;height:22px;padding:0;border:0;border-radius:50%;background:transparent;color:#fff;display:grid;place-items:center;cursor:pointer}
.dit-act:hover{background:rgba(255,255,255,.18)}
.dit-act:focus-visible{outline:2px solid #fff;outline-offset:-1px}
.dit-act svg{width:13px;height:13px}
.dit-retry{all:unset;display:grid;place-items:center;width:100%;height:100%;padding:4px;cursor:pointer;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.2;text-align:center}
.dit-retry:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dit-spinner{width:14px;height:14px;border-radius:50%;border:1.6px solid rgba(127,133,140,.35);border-top-color:var(--dsw-alias-state-business-primary);animation:dit-spin .9s linear infinite}
@keyframes dit-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.dit-spinner{animation:none}.dit-acts{transition:none}}
.dit-layer{position:absolute;inset:0;pointer-events:none}
.dit-menu-backdrop{position:absolute;inset:0;pointer-events:auto;background:transparent}
.dit-menu{position:absolute;z-index:2;width:300px;padding:6px;border-radius:14px;pointer-events:auto;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary);box-shadow:0 0 0 .5px rgba(0,0,0,.1),0 10px 28px rgba(15,17,21,.14),0 2px 6px rgba(15,17,21,.06)}
.dit-menu-head{padding:8px 10px 9px}
.dit-menu-name{display:block;font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dit-menu-meta{display:block;margin-top:3px;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dit-menu-sep{height:1px;margin:4px 0;background:var(--dsw-alias-border-l2)}
.dit-menu-item{display:flex;align-items:center;gap:10px;width:100%;height:36px;padding:0 10px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;text-align:left;cursor:pointer}
.dit-menu-item:hover,.dit-menu-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dit-menu-item[disabled]{opacity:.55;cursor:default}
.dit-menu-item svg{width:16px;height:16px;flex:none;color:var(--dsw-alias-label-secondary)}
.dit-menu-label{flex:1}
.dit-menu-kbd{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}
.dit-menu-foot{padding:7px 10px 6px;font-size:11px;color:var(--dsw-alias-label-tertiary)}

/* Preview: the caption band stays empty. The stage clears DSH's own
   overlay-safe inset; every control is anchored to the bottom. */
.dit-preview{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;pointer-events:auto;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}
.dit-preview-stage{position:relative;flex:1;min-height:0;margin:calc(var(--dsh-frame-overlay-top,20px) + 8px) 32px 0;overflow:hidden;touch-action:none}
.dit-preview-stage[data-pan="true"]{cursor:grab}
.dit-preview-stage[data-dragging="true"]{cursor:grabbing}
.dit-preview-image{position:absolute;left:0;top:0;transform-origin:0 0;user-select:none;-webkit-user-drag:none;border-radius:var(--dsw-radius-lg);box-shadow:var(--dsw-elevation-prominent);background:var(--dsw-specific-input-major)}
.dit-preview-image[hidden]{display:none}
.dit-preview-state{position:absolute;inset:0;display:grid;place-items:center;color:var(--dsw-alias-label-secondary);font-size:13px;gap:10px}
.dit-preview-state .dit-spinner{width:20px;height:20px}
.dit-preview-retry{height:32px;padding:0 14px;border:.5px solid var(--dsw-alias-border-l2-darkmode-thin);border-radius:9px;background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer}
.dit-preview-retry:hover{background:var(--dsw-alias-interactive-bg-hover)}

.dit-preview-strip{flex:none;align-self:center;max-width:calc(100% - 32px);display:flex;gap:8px;padding:2px;margin:4px 0 0;overflow-x:auto;scrollbar-width:none}
.dit-preview-strip::-webkit-scrollbar{display:none}
.dit-strip-thumb{flex:none;width:58px;height:34px;padding:0;border:1px solid transparent;border-radius:7px;overflow:hidden;background:var(--dsw-alias-bg-layer-1);cursor:pointer}
.dit-strip-thumb:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dit-strip-thumb:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dit-strip-thumb[aria-current="true"]{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 35%,transparent)}
.dit-strip-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.dit-strip-thumb .dit-spinner{width:12px;height:12px;margin:10px auto}
@media (max-width:760px){.dit-preview-strip{display:none}}
.dit-preview-toolbar{flex:none;align-self:center;max-width:calc(100% - 32px);display:flex;align-items:center;gap:2px;height:48px;margin:10px 0 6px;padding:5px 7px;border-radius:14px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary);box-shadow:0 0 0 .5px rgba(0,0,0,.1),0 12px 32px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.08);white-space:nowrap}
.dit-tb-btn{display:flex;align-items:center;justify-content:center;gap:7px;height:36px;min-width:36px;padding:0 10px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer}
.dit-tb-btn:hover,.dit-tb-btn:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dit-tb-btn[disabled]{opacity:.4;cursor:default}
.dit-tb-btn[disabled]:hover{background:transparent}
.dit-tb-btn svg{width:16px;height:16px;flex:none;color:var(--dsw-alias-label-secondary)}
.dit-tb-btn.icon{padding:0;width:36px}
.dit-tb-btn.act{background:var(--dsw-alias-state-business-primary);color:#fff}
.dit-tb-btn.act svg{color:#fff}
.dit-tb-btn.act:hover{background:var(--dsw-alias-state-business-primary)}
.dit-tb-group{display:flex;align-items:center;gap:2px}
.dit-tb-sep{width:1px;height:20px;margin:0 5px;background:var(--dsw-alias-border-l2);flex:none}
.dit-tb-file{max-width:210px;padding:0 9px;display:flex;flex-direction:column;justify-content:center;gap:1px;min-width:0}
.dit-tb-file b{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dit-tb-file span{font-size:10px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dit-tb-pct{min-width:52px;font-variant-numeric:tabular-nums;font-size:12.5px}
.dit-tb-page{min-width:52px;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dit-tb-kbd{font-size:10.5px;color:var(--dsw-alias-label-tertiary);border:.5px solid var(--dsw-alias-border-l2);border-radius:5px;padding:1px 5px;line-height:1.3}
.dit-preview-hint{flex:none;align-self:center;margin:0 0 10px;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
@media (max-width:900px){.dit-tb-file{display:none}.dit-preview-hint{display:none}}
@media (max-width:680px){.dit-tb-btn{padding:0;width:36px;font-size:0;gap:0}.dit-tb-btn .dit-tb-kbd,.dit-tb-btn .dit-tb-label{display:none}.dit-tb-sep{margin:0 2px}}
.dit-toast{position:absolute;left:50%;bottom:92px;transform:translateX(-50%);z-index:3;display:flex;align-items:center;gap:9px;height:38px;padding:0 14px;border-radius:11px;pointer-events:auto;white-space:nowrap;font-size:12.5px;background:var(--dsw-alias-label-primary,#1b1b1c);color:var(--dsw-alias-bg-base,#f5f6f7);box-shadow:0 8px 24px rgba(0,0,0,.22)}
.dit-toast-mark{width:16px;height:16px;flex:none;border-radius:50%;display:grid;place-items:center;border:1px solid currentColor;opacity:.85}
.dit-toast-mark svg{width:9px;height:9px}
.dit-toast-action{margin-left:2px;padding:0 2px;border:0;background:transparent;color:var(--dsw-alias-link,#7aaaff);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
`

    // ---------------------------------------------------------------- store

    function createStore() {
      let state = { preview: null, menu: null, toast: null, busy: false }
      let timer = null
      const listeners = new Set()
      const publish = (next) => {
        state = next
        for (const listener of [...listeners]) listener()
      }
      return {
        get: () => state,
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        setPreview(preview) {
          publish({ ...state, preview, menu: null })
        },
        setPreviewIndex(index) {
          if (state.preview === null) return
          publish({ ...state, preview: { ...state.preview, index } })
        },
        clearPreview() {
          if (state.preview) publish({ ...state, preview: null })
        },
        openMenu(menu) {
          publish({ ...state, menu })
        },
        closeMenu() {
          if (state.menu) publish({ ...state, menu: null })
        },
        setBusy(busy) {
          if (state.busy !== busy) publish({ ...state, busy })
        },
        toast(text, options) {
          publish({ ...state, toast: { text, ...(options || {}) } })
          if (timer !== null) clearTimeout(timer)
          timer = setTimeout(() => {
            timer = null
            publish({ ...state, toast: null })
          }, 2200)
        },
        hideToast() {
          if (timer !== null) clearTimeout(timer)
          timer = null
          if (state.toast) publish({ ...state, toast: null })
        },
        reset() {
          if (timer !== null) clearTimeout(timer)
          timer = null
          publish({ preview: null, menu: null, toast: null, busy: false })
        },
      }
    }

    const store = createStore()

    // -------------------------------------------------------------- helpers

    const EXTENSIONS = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/avif': 'avif',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp',
      'image/x-icon': 'ico',
      'image/vnd.microsoft.icon': 'ico',
    }

    function extensionOf(mediaType, name) {
      const typed = mediaType ? EXTENSIONS[String(mediaType).toLowerCase()] : undefined
      if (typed) return typed
      const match = typeof name === 'string' ? /\.([a-z0-9]{2,5})$/i.exec(name) : null
      return match ? match[1].toLowerCase() : 'png'
    }

    function pad(value) {
      return String(value).padStart(2, '0')
    }

    function timestamp() {
      const now = new Date()
      return (
        String(now.getFullYear()) +
        pad(now.getMonth() + 1) +
        pad(now.getDate()) +
        '-' +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds())
      )
    }

    function sanitizeName(name) {
      if (typeof name !== 'string') return ''
      const tail = name.split(/[\\/]/).pop() || ''
      const cleaned = tail.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim()
      return cleaned.slice(0, 96)
    }

    function downloadName(info, mediaType) {
      const base = sanitizeName(info.name)
      if (base !== '' && /\.[a-z0-9]{2,5}$/i.test(base)) return base
      const extension = extensionOf(mediaType || info.mediaType, info.name)
      const stem = base !== '' ? base : 'dsh-image-' + timestamp()
      return stem + '.' + extension
    }

    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return ''
      if (bytes < 1024) return Math.round(bytes) + ' B'
      if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    function metaLine(info) {
      const parts = []
      if (Number.isFinite(info.width) && Number.isFinite(info.height)) {
        parts.push(info.width + ' × ' + info.height)
      }
      if (Number.isFinite(info.bytes) && info.bytes > 0) parts.push(formatBytes(info.bytes))
      if (parts.length === 0 && info.mediaType) parts.push(String(info.mediaType).toUpperCase())
      return parts.join(' · ')
    }

    async function fetchBlob(src) {
      const response = await fetch(src)
      if (!response.ok) throw new Error('HTTP ' + response.status)
      return await response.blob()
    }

    async function ensurePng(blob) {
      if (blob.type === 'image/png') return blob
      const bitmap = await createImageBitmap(blob)
      const width = bitmap.width
      const height = bitmap.height
      try {
        if (width > 16384 || height > 16384 || width * height > 268435456) {
          throw new Error('IMAGE_TOO_LARGE')
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (context === null) throw new Error('CANVAS_UNAVAILABLE')
        context.drawImage(bitmap, 0, 0)
        return await new Promise((resolve, reject) => {
          canvas.toBlob((value) => {
            if (value === null) reject(new Error('ENCODE_FAILED'))
            else resolve(value)
          }, 'image/png')
        })
      } finally {
        if (typeof bitmap.close === 'function') bitmap.close()
      }
    }

    async function resolveBlob(info) {
      try {
        return await fetchBlob(info.src)
      } catch (error) {
        if (typeof info.reload !== 'function') throw error
        const next = await info.reload()
        if (typeof next !== 'string' || next === '') throw error
        return await fetchBlob(next)
      }
    }

    async function copyImage(info) {
      if (
        !navigator.clipboard ||
        typeof navigator.clipboard.write !== 'function' ||
        typeof ClipboardItem === 'undefined'
      ) {
        throw new Error('CLIPBOARD_UNSUPPORTED')
      }
      const blob = await resolveBlob(info)
      const png = await ensurePng(blob)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    }

    async function downloadImage(info) {
      const blob = await resolveBlob(info)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = downloadName(info, blob.type || info.mediaType)
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      return anchor.download
    }

    async function runCopy(info) {
      if (store.get().busy) return
      store.setBusy(true)
      try {
        await copyImage(info)
        store.toast(t('toast.copied'), { tone: 'ok' })
        store.closeMenu()
      } catch (error) {
        store.toast(t('toast.copyFailed'), {
          tone: 'warn',
          action: { label: t('toast.useDownload'), run: () => runDownload(info) },
        })
        store.closeMenu()
      } finally {
        store.setBusy(false)
      }
    }

    async function runDownload(info) {
      if (store.get().busy) return
      store.setBusy(true)
      try {
        const name = await downloadImage(info)
        store.toast(t('toast.downloadStarted') + ' · ' + name, { tone: 'ok' })
      } catch (error) {
        store.toast(t('toast.downloadFailed'), { tone: 'warn' })
      } finally {
        store.setBusy(false)
        store.closeMenu()
      }
    }

    // ------------------------------------------------------------- image data

    function itemFromSpec(image, load) {
      const attachment = image && image.attachment
      const preview = image && image.preview
      const name = (attachment && attachment.name) || (preview && preview.name) || ''
      const mediaType = (attachment && attachment.mediaType) || (preview && preview.mediaType) || ''
      const width = attachment && Number.isFinite(attachment.width) ? attachment.width : preview && Number.isFinite(preview.width) ? preview.width : undefined
      const height = attachment && Number.isFinite(attachment.height) ? attachment.height : preview && Number.isFinite(preview.height) ? preview.height : undefined
      const bytes = attachment && Number.isFinite(attachment.bytes) ? attachment.bytes : undefined
      return {
        key: attachment && attachment.attachmentId ? attachment.attachmentId : (preview && preview.url) || name || 'image',
        attachment,
        preview,
        name,
        mediaType,
        width,
        height,
        bytes,
        load: attachment && typeof load === 'function' ? load : undefined,
      }
    }

    function infoOfItem(item, src) {
      return {
        src,
        name: item.name,
        mediaType: item.mediaType,
        width: item.width,
        height: item.height,
        bytes: item.bytes,
        reload: item.load && item.attachment ? () => item.load(item.attachment) : undefined,
      }
    }

    /** Image blocks of one conversation node, in source order. */
    function imagesFromNode(node) {
      if (!node || typeof node !== 'object') return []
      const out = []
      if (node.kind === 'assistant' && Array.isArray(node.blocks)) {
        for (const block of node.blocks) {
          if (block && block.kind === 'image' && block.attachment) out.push({ attachment: block.attachment })
        }
        return out
      }
      if (Array.isArray(node.content)) {
        for (const block of node.content) {
          if (block && block.type === 'image' && block.attachment) out.push({ attachment: block.attachment })
        }
      }
      return out
    }

    /** The images of the single conversation message that owns `attachmentId`. */
    function collectMessageImages(nodes, attachmentId) {
      if (!Array.isArray(nodes) || typeof attachmentId !== 'string' || attachmentId === '') return []
      for (const node of nodes) {
        const images = imagesFromNode(node)
        if (images.length === 0) continue
        if (!images.some((image) => image.attachment && image.attachment.attachmentId === attachmentId)) continue
        return images
      }
      return []
    }

    // ------------------------------------------------- conversation image index

    // Latest ChatSnapshot nodes captured by a mounted gallery; the markdown
    // bridge has no React hook seat, so it reads this module-level reference.
    let latestChatNodes
    let latestImageLoader
    let latestLoaderSession
    let latestSessionId
    let clientSessions
    let clientCtx
    let bridgeActivations = 0
    const attachmentUrlCache = new Map()

    function currentSessionsService() {
      if (clientSessions) return clientSessions
      if (clientCtx && typeof clientCtx.get === 'function') {
        try { clientSessions = clientCtx.get('sessions') } catch (error) { clientSessions = undefined }
      }
      return clientSessions
    }

    /**
     * Loader for preview items that are not backed by a mounted gallery (the
     * markdown bridge can page into attachments from other turns). Prefers the
     * slot-provided loader; otherwise reads the attachment through the Client
     * sessions service with the current session's permission scope.
     */
    function bridgeImageLoader() {
      if (typeof latestImageLoader === 'function' && latestLoaderSession !== undefined && latestLoaderSession === latestSessionId) {
        return latestImageLoader
      }
      const sessions = currentSessionsService()
      const sessionId = latestSessionId
      if (!sessions || typeof sessions.binding !== 'function' || typeof sessionId !== 'string') return undefined
      let binding
      try { binding = sessions.binding(sessionId) } catch (error) { binding = undefined }
      const session = binding && binding.session
      if (!session || typeof session.readAttachment !== 'function') return undefined
      const load = async (attachment) => {
        if (!attachment || typeof attachment.attachmentId !== 'string') throw new Error('BAD_ATTACHMENT')
        const cached = attachmentUrlCache.get(attachment.attachmentId)
        if (typeof cached === 'string') return cached
        const result = await session.readAttachment(attachment)
        if (!result || result.ok !== true || !result.value) throw new Error('READ_FAILED')
        const mediaType = (result.value.attachment && result.value.attachment.mediaType)
          || attachment.mediaType || 'application/octet-stream'
        const url = URL.createObjectURL(new Blob([result.value.data], { type: mediaType }))
        attachmentUrlCache.set(attachment.attachmentId, url)
        return url
      }
      load.peek = (attachment) => (attachment ? attachmentUrlCache.get(attachment.attachmentId) : undefined)
      return load
    }

    const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g

    function nameFromUrl(value) {
      try {
        const url = new URL(value, document.baseURI)
        return decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '') || ''
      } catch (error) {
        return ''
      }
    }

    function markdownImageRefs(text) {
      const out = []
      if (typeof text !== 'string' || text === '') return out
      // A fenced code block only demonstrates markdown; it is not a rendered
      // image, so it must not join the conversation image index.
      const source = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
      MARKDOWN_IMAGE.lastIndex = 0
      let match
      while ((match = MARKDOWN_IMAGE.exec(source)) !== null) {
        const alt = (match[1] || '').trim()
        const destination = (match[2] || '').trim()
        if (destination === '') continue
        let url
        try { url = new URL(destination, document.baseURI).href } catch (error) { continue }
        out.push({ url, name: alt, raw: destination })
      }
      return out
    }

    function blockImageOf(block) {
      if (!block || typeof block !== 'object') return undefined
      if (block.kind === 'image') return block.attachment
      if (block.type === 'image') return block.attachment
      return undefined
    }

    function blockTextOf(block) {
      if (!block || typeof block !== 'object') return ''
      if (block.kind === 'text' && typeof block.text === 'string') return block.text
      if (block.type === 'text' && typeof block.text === 'string') return block.text
      if (typeof block.value === 'string' && block.type === 'text') return block.value
      return ''
    }

    /**
     * Flatten every image of the loaded conversation into one ordered index:
     * user content, assistant blocks (structured images and markdown images in
     * text) and tool-result content. Dedupe by attachment id / absolute URL so
     * an echoed screenshot is not paged twice.
     */
    function collectConversationImages(nodes) {
      if (!Array.isArray(nodes)) return []
      const out = []
      const seen = new Set()
      const pushAttachment = (attachment) => {
        if (!attachment || typeof attachment.attachmentId !== 'string' || attachment.attachmentId === '') return
        const key = 'attachment:' + attachment.attachmentId
        if (seen.has(key)) return
        seen.add(key)
        out.push({ kind: 'attachment', attachment, name: attachment.name || '' })
      }
      const pushMarkdown = (ref) => {
        if (ref.url === '') return
        const key = 'markdown:' + ref.url
        if (seen.has(key)) return
        seen.add(key)
        out.push({ kind: 'markdown', url: ref.url, name: ref.name || nameFromUrl(ref.url), raw: ref.raw || ref.url })
      }
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue
        const blocks = node.kind === 'assistant' && Array.isArray(node.blocks)
          ? node.blocks
          : Array.isArray(node.content) ? node.content : []
        for (const block of blocks) {
          const attachment = blockImageOf(block)
          if (attachment) { pushAttachment(attachment); continue }
          const text = blockTextOf(block)
          if (text !== '') for (const ref of markdownImageRefs(text)) pushMarkdown(ref)
        }
      }
      return out
    }

    function previewItemFromEntry(entry, load) {
      if (entry.kind === 'attachment') return itemFromSpec({ attachment: entry.attachment }, load)
      const name = entry.name || nameFromUrl(entry.url) || 'image'
      return {
        key: 'markdown:' + entry.url,
        preview: { url: entry.url, name },
        name,
        mediaType: '',
        width: undefined,
        height: undefined,
        bytes: undefined,
        load: undefined,
      }
    }

    function sameImageUrl(left, right) {
      if (typeof left !== 'string' || typeof right !== 'string') return false
      if (left === right) return true
      try {
        const a = new URL(left, document.baseURI)
        const b = new URL(right, document.baseURI)
        return a.pathname === b.pathname && a.search === b.search
      } catch (error) {
        return false
      }
    }

    /** Last path segment; recognizes the generic file endpoint's `path` param. */
    function imageBasename(value) {
      if (typeof value !== 'string' || value === '') return ''
      try {
        const url = new URL(value, document.baseURI)
        if (url.pathname.endsWith('/api/file')) {
          const path = url.searchParams.get('path') || ''
          return (path.split(/[\\/]/).filter(Boolean).pop() || '').toLowerCase()
        }
        return decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '').toLowerCase()
      } catch (error) {
        return String(value).split(/[\\/]/).filter(Boolean).pop().toLowerCase()
      }
    }

    function rawBasename(value) {
      if (typeof value !== 'string' || value === '') return ''
      return value.split(/[\\/]/).filter(Boolean).pop().toLowerCase()
    }

    /**
     * Locate the clicked Markdown image in the conversation index. The shipped
     * renderer rewrites relative/absolute file destinations into
     * `/api/file?path=...`, so an exact URL match is not always possible; fall
     * back to a unique basename (then alt text) match.
     */
    function findConversationMarkdownIndex(conversation, src, alt) {
      const direct = conversation.findIndex((entry) => entry.kind === 'markdown' && sameImageUrl(entry.url, src))
      if (direct >= 0) return direct
      const basename = imageBasename(src) || rawBasename(src)
      if (basename !== '') {
        const matches = []
        conversation.forEach((entry, index) => {
          if (entry.kind !== 'markdown') return
          if (imageBasename(entry.url) === basename || rawBasename(entry.raw) === basename) matches.push(index)
        })
        if (matches.length > 0) return matches[matches.length - 1]
      }
      if (typeof alt === 'string' && alt.trim() !== '') {
        const needle = alt.trim()
        const matches = []
        conversation.forEach((entry, index) => {
          if (entry.kind === 'markdown' && entry.name === needle) matches.push(index)
        })
        if (matches.length > 0) return matches[matches.length - 1]
      }
      return -1
    }

    // ---------------------------------------------------------------- icons

    function CopyIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, 'aria-hidden': true },
        h('rect', { x: 5.2, y: 5.2, width: 8.6, height: 8.6, rx: 2 }),
        h('path', {
          d: 'M10.4 5.2V3.9c0-.9-.7-1.6-1.6-1.6H3.9c-.9 0-1.6.7-1.6 1.6v4.9c0 .9.7 1.6 1.6 1.6h1.3',
        }),
      )
    }

    function DownloadIcon() {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M8 2.6v7.2' }),
        h('path', { d: 'M5.1 7.2 8 10.1l2.9-2.9' }),
        h('path', { d: 'M2.8 12.1v.9c0 .5.4.9.9.9h8.6c.5 0 .9-.4.9-.9v-.9' }),
      )
    }

    function CloseIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 4l8 8M12 4l-8 8' }),
      )
    }

    function CheckIcon() {
      return h(
        'svg',
        { viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M2.5 6.2 4.8 8.5 9.5 3.8' }),
      )
    }

    function MinusIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
        h('path', { d: 'M3.5 8h9' }),
      )
    }

    function PlusIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': true },
        h('path', { d: 'M8 3.5v9M3.5 8h9' }),
      )
    }

    function PrevIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M10 3.5 5.5 8 10 12.5' }),
      )
    }

    function NextIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M6 3.5 10.5 8 6 12.5' }),
      )
    }

    // --------------------------------------------------------------- gallery

    function singleFit(dimensions) {
      if (dimensions === undefined || !Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height)) {
        return { width: 240, height: 240, objectPosition: 'center' }
      }
      const natural = dimensions.width / dimensions.height
      const ratio = Math.min(4, Math.max(0.25, natural))
      const box = ratio >= 1
        ? { width: 240, height: 240 / ratio }
        : { width: 240 * ratio, height: 240 }
      const scale = Math.min(1, dimensions.width / box.width, dimensions.height / box.height)
      return {
        width: Math.max(1, Math.round(box.width * scale)),
        height: Math.max(1, Math.round(box.height * scale)),
        objectPosition: natural < 0.25 ? 'center top' : natural > 4 ? 'left center' : 'center',
      }
    }

    function dimensionsOf(image) {
      if (image.attachment !== undefined) return image.attachment
      const preview = image.preview
      if (preview && Number.isFinite(preview.width) && Number.isFinite(preview.height)) {
        return { width: preview.width, height: preview.height }
      }
      return undefined
    }

    function MessageImage({ image, load, variant, onOpen }) {
      const preview = image.preview
      const attachment = image.attachment
      const [src, setSrc] = useState(() => {
        if (preview && preview.url) return preview.url
        if (attachment && load && typeof load.peek === 'function') return load.peek(attachment) || null
        return null
      })
      const [failed, setFailed] = useState(false)
      const [attempt, setAttempt] = useState(0)
      const frameRef = useRef(null)

      useEffect(() => {
        if (attachment === undefined || load === undefined) return undefined
        if (src !== null) return undefined
        let live = true
        setFailed(false)
        Promise.resolve()
          .then(() => load(attachment))
          .then((url) => {
            if (live && typeof url === 'string' && url !== '') setSrc(url)
          })
          .catch(() => {
            if (live) setFailed(true)
          })
        return () => {
          live = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [attachment, load, attempt])

      const dimensions = dimensionsOf({ attachment, preview })
      const fit = variant === 'single' ? singleFit(dimensions) : undefined
      const label = image.label || (attachment && attachment.name) || (preview && preview.name) || t('image.alt')
      const mediaType = (attachment && attachment.mediaType) || (preview && preview.mediaType) || ''
      const bytes = attachment && attachment.bytes
      const canAct = src !== null && variant !== 'thumbnail'

      const infoOf = () => ({
        src,
        name: (attachment && attachment.name) || (preview && preview.name) || '',
        mediaType,
        width: dimensions && dimensions.width,
        height: dimensions && dimensions.height,
        bytes,
        reload: attachment !== undefined && load !== undefined ? () => load(attachment) : undefined,
      })

      const openPreview = (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (src === null) return
        onOpen(frameRef.current)
      }

      const openMenu = (event) => {
        if (src === null) return
        event.preventDefault()
        event.stopPropagation()
        store.openMenu({ ...infoOf(), x: event.clientX, y: event.clientY, anchor: frameRef.current })
      }

      const retry = () => {
        setSrc(null)
        setFailed(false)
        setAttempt((value) => value + 1)
      }

      if (failed) {
        return h(
          'div',
          {
            ref: frameRef,
            className: 'dit-frame',
            'data-variant': variant,
            style: variant === 'single' ? { width: 240, height: 120 } : undefined,
          },
          h('button', { type: 'button', className: 'dit-retry', onClick: retry, title: t('image.failed') }, t('image.failed')),
        )
      }

      return h(
        'div',
        {
          ref: frameRef,
          className: 'dit-frame',
          'data-variant': variant,
          style: fit === undefined ? undefined : { width: fit.width, height: fit.height },
          onContextMenu: openMenu,
        },
        h(
          'button',
          {
            type: 'button',
            className: 'dit-thumb',
            title: t('image.open'),
            'aria-label': t('image.openNamed') + label,
            'aria-busy': src === null || undefined,
            onClick: openPreview,
          },
          src !== null
            ? h('img', {
                src,
                alt: label,
                draggable: false,
                style: fit === undefined ? undefined : { objectPosition: fit.objectPosition },
              })
            : h('span', { className: 'dit-spinner', 'aria-label': t('image.loading') }),
        ),
        canAct
          ? h(
              'div',
              { className: 'dit-acts' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dit-act',
                  title: t('menu.copy'),
                  'aria-label': t('menu.copy'),
                  onMouseDown: (event) => event.stopPropagation(),
                  onClick: (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    runCopy(infoOf())
                  },
                },
                h(CopyIcon),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dit-act',
                  title: t('menu.download'),
                  'aria-label': t('menu.download'),
                  onMouseDown: (event) => event.stopPropagation(),
                  onClick: (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    runDownload(infoOf())
                  },
                },
                h(DownloadIcon),
              ),
            )
          : null,
      )
    }

    // Thumbnails for the preview filmstrip. Each one resolves its own source
    // through the same loader cache; a missing cache entry loads lazily.
    function PreviewThumb({ item, current, onSelect }) {
      const [src, setSrc] = useState(() => {
        if (item.preview && item.preview.url) return item.preview.url
        if (item.attachment && item.load && typeof item.load.peek === 'function') {
          return item.load.peek(item.attachment) || null
        }
        return null
      })
      useEffect(() => {
        if (src !== null) return undefined
        if (item.attachment === undefined || typeof item.load !== 'function') return undefined
        let live = true
        Promise.resolve()
          .then(() => item.load(item.attachment))
          .then((url) => {
            if (live && typeof url === 'string' && url !== '') setSrc(url)
          })
          .catch(() => {})
        return () => { live = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [item.key])
      return h(
        'button',
        {
          type: 'button',
          className: 'dit-strip-thumb',
          'aria-current': current ? 'true' : undefined,
          'aria-label': item.name || t('image.alt'),
          title: item.name || t('image.alt'),
          onClick: onSelect,
        },
        src === null ? h('span', { className: 'dit-spinner' }) : h('img', { src, alt: '' }),
      )
    }

    function PreviewStrip({ items, index, onSelect }) {
      if (items.length < 2) return null
      // The conversation index can be long; only a window of thumbnails is
      // mounted (and therefore only those images are loaded as thumbnails).
      const limit = 9
      const start = items.length <= limit ? 0 : Math.max(0, Math.min(items.length - limit, index - 4))
      const visible = items.slice(start, start + limit)
      return h(
        'div',
        { className: 'dit-preview-strip', role: 'tablist', 'aria-label': t('preview.strip') },
        visible.map((item, position) =>
          h(PreviewThumb, {
            key: item.key,
            item,
            current: start + position === index,
            onSelect: () => onSelect(start + position),
          }),
        ),
      )
    }

    function ImageGallery(props) {
      const images = Array.isArray(props.images) ? props.images : []
      const load = props.loadImage
      const useChat = props.useChat
      // Slot standard props include useChat; the fallback keeps the hook order
      // stable when a host version does not provide it.
      const useChatHook = typeof useChat === 'function' ? useChat : () => undefined
      const chat = useChatHook((snapshot) => snapshot)
      const nodes = chat && chat.legacy && Array.isArray(chat.legacy.nodes) ? chat.legacy.nodes : undefined
      latestChatNodes = nodes
      latestImageLoader = load
      latestLoaderSession = props.sessionId

      if (images.length === 0) return null
      const variant = props.thumbnail ? 'thumbnail' : props.compact || images.length > 1 ? 'tile' : 'single'

      const openAt = (clickedIndex, anchor) => {
        const clicked = images[clickedIndex]
        // Whole-conversation index: every image across turns, in transcript
        // order. The clicked attachment id locates its page.
        if (clicked && clicked.attachment && Array.isArray(nodes)) {
          const identifier = clicked.attachment.attachmentId
          const conversation = collectConversationImages(nodes)
          const found = conversation.findIndex((entry) => entry.kind === 'attachment'
            && entry.attachment.attachmentId === identifier)
          if (found >= 0 && conversation.length > 1) {
            const items = conversation.map((entry) => previewItemFromEntry(entry, load))
            store.setPreview({ items, index: found, anchor })
            return
          }
        }
        // A local submission echo (or a snapshot without the attachment) falls
        // back to the images of this group.
        let specs = images
        let index = clickedIndex
        if (images.length === 1 && images[0] && images[0].attachment && Array.isArray(nodes)) {
          const identifier = images[0].attachment.attachmentId
          const collected = collectMessageImages(nodes, identifier)
          if (collected.length > 1) {
            specs = collected
            const found = collected.findIndex((image) => image.attachment && image.attachment.attachmentId === identifier)
            index = found >= 0 ? found : 0
          }
        }
        const items = specs.map((image) => itemFromSpec(image, load))
        store.setPreview({ items, index: Math.max(0, Math.min(items.length - 1, index)), anchor })
      }

      return h(
        'div',
        { className: 'dit-gallery', 'data-align': props.align },
        images.map((image, index) =>
          h(MessageImage, {
            key: index,
            image,
            load,
            variant,
            onOpen: (anchor) => openAt(index, anchor),
          }),
        ),
      )
    }

    // A session header seat that only mirrors the ChatSnapshot into the module
    // scope: Markdown-only sessions have no gallery mount, and the bridge still
    // needs the conversation image index.
    function ConversationImageIndexTap(props) {
      const useChat = typeof props.useChat === 'function' ? props.useChat : () => undefined
      const chat = useChat((snapshot) => snapshot)
      latestChatNodes = chat && chat.legacy && Array.isArray(chat.legacy.nodes) ? chat.legacy.nodes : undefined
      if (typeof props.sessionId === 'string') latestSessionId = props.sessionId
      return null
    }

    // --------------------------------------------------------------- preview

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

    function clampPosition(view, dimensions, stage) {
      const width = dimensions.width * view.scale
      const height = dimensions.height * view.scale
      let x = view.x
      let y = view.y
      x = width <= stage.width ? (stage.width - width) / 2 : clamp(x, stage.width - width, 0)
      y = height <= stage.height ? (stage.height - height) / 2 : clamp(y, stage.height - height, 0)
      return { scale: view.scale, x, y }
    }

    function Preview({ preview, onClose }) {
      const items = preview.items
      const index = preview.index
      const item = items[index] || items[0]
      const stageRef = useRef(null)
      const imageRef = useRef(null)
      const closeRef = useRef(null)
      const rootRef = useRef(null)
      const [src, setSrc] = useState(null)
      const [failed, setFailed] = useState(false)
      const [attempt, setAttempt] = useState(0)
      const [dimensions, setDimensions] = useState(null)
      const [stage, setStage] = useState({ width: 0, height: 0 })
      const [free, setFree] = useState(null)
      const [dragging, setDragging] = useState(false)
      const dragRef = useRef(null)

      const itemKey = item.key

      // Resolve the current image: local preview URL, loader cache, or loader.
      useEffect(() => {
        let live = true
        setSrc(null)
        setFailed(false)
        setDimensions(
          item.width !== undefined && item.height !== undefined
            ? { width: item.width, height: item.height }
            : null,
        )
        if (item.preview && item.preview.url) {
          setSrc(item.preview.url)
          return () => { live = false }
        }
        if (item.attachment === undefined || typeof item.load !== 'function') {
          setFailed(true)
          return () => { live = false }
        }
        const cached = typeof item.load.peek === 'function' ? item.load.peek(item.attachment) : undefined
        if (typeof cached === 'string' && cached !== '') {
          setSrc(cached)
          return () => { live = false }
        }
        Promise.resolve()
          .then(() => item.load(item.attachment))
          .then((url) => {
            if (live && typeof url === 'string' && url !== '') setSrc(url)
          })
          .catch(() => {
            if (live) setFailed(true)
          })
        return () => { live = false }
      }, [itemKey, attempt, item])

      // Moving to another image starts from fit again.
      useEffect(() => {
        setFree(null)
      }, [itemKey])

      // Stage box: the preview keeps the caption band free, so the measured box
      // is exactly the area the image may occupy.
      useEffect(() => {
        const node = stageRef.current
        if (node === null) return undefined
        const measure = () => setStage({ width: node.clientWidth, height: node.clientHeight })
        measure()
        if (typeof ResizeObserver === 'undefined') return undefined
        const observer = new ResizeObserver(measure)
        observer.observe(node)
        return () => observer.disconnect()
      }, [])

      const fitScale = dimensions !== null && stage.width > 0 && stage.height > 0
        ? Math.min(1, stage.width / dimensions.width, stage.height / dimensions.height)
        : 1
      const scale = free === null ? fitScale : free.scale
      const position = free === null
        ? {
            x: dimensions === null ? 0 : (stage.width - dimensions.width * fitScale) / 2,
            y: dimensions === null ? 0 : (stage.height - dimensions.height * fitScale) / 2,
          }
        : free
      const canPan = free !== null && dimensions !== null
        && (dimensions.width * free.scale > stage.width + 1 || dimensions.height * free.scale > stage.height + 1)

      const zoomAt = useCallback((nextScale, clientX, clientY) => {
        if (dimensions === null || stage.width === 0 || stage.height === 0) return
        const node = stageRef.current
        if (node === null) return
        const bounds = node.getBoundingClientRect()
        const anchorX = clientX === undefined ? stage.width / 2 : clientX - bounds.left
        const anchorY = clientY === undefined ? stage.height / 2 : clientY - bounds.top
        const current = free === null
          ? { scale: fitScale, x: (stage.width - dimensions.width * fitScale) / 2, y: (stage.height - dimensions.height * fitScale) / 2 }
          : free
        const target = clamp(nextScale, Math.min(ZOOM_MIN, fitScale), ZOOM_MAX)
        if (target === current.scale) return
        const ratio = target / current.scale
        const next = {
          scale: target,
          x: anchorX - (anchorX - current.x) * ratio,
          y: anchorY - (anchorY - current.y) * ratio,
        }
        setFree(clampPosition(next, dimensions, stage))
      }, [dimensions, fitScale, free, stage])

      const resetFit = useCallback(() => { setFree(null) }, [])

      const zoomBy = useCallback((factor) => {
        zoomAt(scale * factor)
      }, [scale, zoomAt])

      const goTo = useCallback((next) => {
        if (next < 0 || next >= items.length) return
        store.setPreviewIndex(next)
      }, [items.length])

      const currentInfo = () => infoOfItem(item, src)

      // Wheel: zoom at the pointer. Plain wheel and trackpad pinch (ctrl+wheel)
      // both zoom instead of scrolling or page-zooming.
      useEffect(() => {
        const node = stageRef.current
        if (node === null) return undefined
        const onWheel = (event) => {
          if (event.deltaY === 0) return
          event.preventDefault()
          const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1
          const delta = clamp(event.deltaY * unit, -120, 120)
          const sensitivity = event.ctrlKey ? 0.01 : 0.0015
          zoomAt(scale * Math.exp(-delta * sensitivity), event.clientX, event.clientY)
        }
        node.addEventListener('wheel', onWheel, { passive: false })
        return () => node.removeEventListener('wheel', onWheel)
      }, [scale, zoomAt])

      const onDoubleClick = (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (free === null) zoomAt(1, event.clientX, event.clientY)
        else resetFit()
      }

      const onPointerDown = (event) => {
        if (event.button !== 0 || !canPan) return
        event.preventDefault()
        event.stopPropagation()
        const node = stageRef.current
        if (node !== null && typeof node.setPointerCapture === 'function') {
          try { node.setPointerCapture(event.pointerId) } catch (error) { /* detached pointer */ }
        }
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          view: free,
        }
        setDragging(true)
      }

      const onPointerMove = (event) => {
        const drag = dragRef.current
        if (drag === null || drag.pointerId !== event.pointerId) return
        event.preventDefault()
        const next = {
          scale: drag.view.scale,
          x: drag.view.x + (event.clientX - drag.startX),
          y: drag.view.y + (event.clientY - drag.startY),
        }
        setFree(dimensions === null ? next : clampPosition(next, dimensions, stage))
      }

      const endDrag = (event) => {
        const drag = dragRef.current
        if (drag === null) return
        dragRef.current = null
        setDragging(false)
        const node = stageRef.current
        if (node !== null && typeof node.releasePointerCapture === 'function' && event.pointerId !== undefined) {
          try { node.releasePointerCapture(event.pointerId) } catch (error) { /* detached pointer */ }
        }
      }

      // Keyboard and focus: Esc/arrows/zoom live here; the menu owns its own
      // keys while open.
      useEffect(() => {
        const onKeyDown = (event) => {
          if (store.get().menu !== null) return
          const key = event.key
          if (key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
            return
          }
          if (key === 'ArrowLeft' || key === 'ArrowRight') {
            if (items.length < 2) return
            event.preventDefault()
            event.stopPropagation()
            goTo(index + (key === 'ArrowRight' ? 1 : -1))
            return
          }
          if (key === '+' || key === '=') {
            event.preventDefault()
            event.stopPropagation()
            zoomBy(ZOOM_STEP)
            return
          }
          if (key === '-' || key === '_') {
            event.preventDefault()
            event.stopPropagation()
            zoomBy(1 / ZOOM_STEP)
            return
          }
          if (key === '0' || key === '1') {
            event.preventDefault()
            event.stopPropagation()
            resetFit()
            return
          }
          if (key === 'Tab') {
            const root = rootRef.current
            if (root === null) return
            const focusable = [...root.querySelectorAll('button')].filter((node) => !node.disabled)
            if (focusable.length === 0) return
            event.preventDefault()
            const active = document.activeElement
            const current = focusable.indexOf(active)
            const next = event.shiftKey
              ? (current <= 0 ? focusable.length - 1 : current - 1)
              : (current === -1 || current === focusable.length - 1 ? 0 : current + 1)
            focusable[next].focus()
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [goTo, index, items.length, onClose, resetFit, zoomBy])

      useEffect(() => {
        if (closeRef.current instanceof HTMLElement) closeRef.current.focus()
        return undefined
      }, [])

      const onStageMouseDown = (event) => {
        if (event.target === event.currentTarget) onClose()
      }

      const onImageContextMenu = (event) => {
        event.preventDefault()
        event.stopPropagation()
        store.openMenu({ ...currentInfo(), x: event.clientX, y: event.clientY, anchor: closeRef.current })
      }

      const pageLabel = items.length > 1 ? fill('preview.page', { current: index + 1, total: items.length }) : ''

      return h(
        'div',
        {
          ref: rootRef,
          className: 'dit-preview',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('preview.label'),
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose()
          },
        },
        h(
          'div',
          {
            ref: stageRef,
            className: 'dit-preview-stage',
            'data-pan': canPan || undefined,
            'data-dragging': dragging || undefined,
            onMouseDown: onStageMouseDown,
            onPointerDown,
            onPointerMove,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onDoubleClick,
          },
          src === null
            ? failed
              ? h(
                  'div',
                  { className: 'dit-preview-state' },
                  h('span', null, t('preview.loadFailed')),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dit-preview-retry',
                      onClick: () => setAttempt((value) => value + 1),
                    },
                    t('preview.retry'),
                  ),
                )
              : h('div', { className: 'dit-preview-state' }, h('span', { className: 'dit-spinner', 'aria-label': t('image.loading') }))
            : h('img', {
                ref: imageRef,
                className: 'dit-preview-image',
                src,
                alt: item.name || t('image.alt'),
                draggable: false,
                onContextMenu: onImageContextMenu,
                onLoad: (event) => {
                  const image = event.currentTarget
                  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                    setDimensions({ width: image.naturalWidth, height: image.naturalHeight })
                  }
                },
                onError: () => setFailed(true),
                style: dimensions === null
                  ? { visibility: 'hidden' }
                  : {
                      width: dimensions.width + 'px',
                      height: dimensions.height + 'px',
                      transform: 'translate(' + position.x + 'px,' + position.y + 'px) scale(' + scale + ')',
                    },
              }),
        ),
        items.length > 1 ? h(PreviewStrip, { items, index, onSelect: goTo }) : null,
        h(
          'div',
          { className: 'dit-preview-toolbar', onMouseDown: (event) => event.stopPropagation() },
          items.length > 1
            ? h(
                'div',
                { className: 'dit-tb-group' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dit-tb-btn icon',
                    title: t('preview.prev'),
                    'aria-label': t('preview.prev'),
                    disabled: index === 0,
                    onClick: () => goTo(index - 1),
                  },
                  h(PrevIcon),
                ),
                h('span', { className: 'dit-tb-page', 'aria-live': 'polite' }, pageLabel),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dit-tb-btn icon',
                    title: t('preview.next'),
                    'aria-label': t('preview.next'),
                    disabled: index === items.length - 1,
                    onClick: () => goTo(index + 1),
                  },
                  h(NextIcon),
                ),
                h('span', { className: 'dit-tb-sep', 'aria-hidden': true }),
              )
            : null,
          h(
            'div',
            { className: 'dit-tb-file', title: downloadName(item, item.mediaType) },
            h('b', null, downloadName(item, item.mediaType)),
            h('span', null, metaLine(item)),
          ),
          h('span', { className: 'dit-tb-sep', 'aria-hidden': true }),
          h(
            'div',
            { className: 'dit-tb-group' },
            h(
              'button',
              { type: 'button', className: 'dit-tb-btn icon', title: t('preview.zoomOut'), 'aria-label': t('preview.zoomOut'), onClick: () => zoomBy(1 / ZOOM_STEP) },
              h(MinusIcon),
            ),
            h(
              'button',
              { type: 'button', className: 'dit-tb-btn dit-tb-pct', title: t('preview.resetZoom'), 'aria-label': t('preview.resetZoom'), onClick: () => zoomAt(1) },
              Math.round(scale * 100) + '%',
            ),
            h(
              'button',
              { type: 'button', className: 'dit-tb-btn icon', title: t('preview.zoomIn'), 'aria-label': t('preview.zoomIn'), onClick: () => zoomBy(ZOOM_STEP) },
              h(PlusIcon),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dit-tb-btn' + (free === null ? ' act' : ''),
                title: t('preview.fitTitle'),
                'aria-label': t('preview.fitTitle'),
                'aria-pressed': free === null,
                onClick: resetFit,
              },
              h('span', { className: 'dit-tb-label' }, t('preview.fit')),
            ),
          ),
          h('span', { className: 'dit-tb-sep', 'aria-hidden': true }),
          h(
            'button',
            { type: 'button', className: 'dit-tb-btn', onClick: () => runCopy(currentInfo()) },
            h(CopyIcon),
            h('span', { className: 'dit-tb-label' }, t('menu.copy')),
          ),
          h(
            'button',
            { type: 'button', className: 'dit-tb-btn', onClick: () => runDownload(currentInfo()) },
            h(DownloadIcon),
            h('span', { className: 'dit-tb-label' }, t('menu.download')),
          ),
          h('span', { className: 'dit-tb-sep', 'aria-hidden': true }),
          h(
            'button',
            {
              ref: closeRef,
              type: 'button',
              className: 'dit-tb-btn',
              title: t('preview.close'),
              onClick: onClose,
            },
            h(CloseIcon),
            h('span', { className: 'dit-tb-label' }, t('preview.closeShort')),
            h('span', { className: 'dit-tb-kbd' }, 'Esc'),
          ),
        ),
        h('div', { className: 'dit-preview-hint' }, t('preview.zoomHint')),
      )
    }

    // ------------------------------------------------- markdown image bridge
    //
    // Markdown images (agent-written `![..](..)` inside assistant text or tool
    // output) are rendered by the shipped markdown renderer with the official
    // lightbox and have no Slot to replace. The bridge intercepts the click on
    // the official zoom-in button only, reads the clicked image (and its
    // siblings inside the same markdown block) and opens the plugin preview
    // instead. It never edits the shipped DOM and simply lets the click
    // through when the pattern is not found (older/newer DSH builds).
    function collectMarkdownItems(markdown, clickedButton) {
      const buttons = []
      for (const candidate of markdown.querySelectorAll('button')) {
        const image = candidate.querySelector('img')
        if (!(image instanceof HTMLImageElement)) continue
        if (image.naturalWidth < 160 || image.naturalHeight < 120) continue
        let cursor = ''
        try { cursor = getComputedStyle(candidate).cursor } catch (error) { cursor = '' }
        if (cursor !== 'zoom-in') continue
        const src = image.currentSrc || image.src
        if (typeof src !== 'string' || src === '') continue
        buttons.push({ button: candidate, image, src })
      }
      if (buttons.length === 0) return null
      const index = buttons.findIndex((entry) => entry.button === clickedButton)
      if (index < 0) return null
      const items = buttons.map((entry) => {
        const alt = (entry.image.getAttribute('alt') || '').trim()
        const tail = (() => {
          try {
            const url = new URL(entry.src)
            return decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '')
          } catch (error) {
            return ''
          }
        })()
        const name = alt || tail || 'image'
        return {
          key: 'markdown:' + entry.src,
          preview: {
            url: entry.src,
            name,
            width: entry.image.naturalWidth,
            height: entry.image.naturalHeight,
          },
          name,
          mediaType: '',
          width: entry.image.naturalWidth,
          height: entry.image.naturalHeight,
          bytes: undefined,
          load: undefined,
        }
      })
      return { items, index }
    }

    function installMarkdownBridge() {
      const onClick = (event) => {
        if (event.defaultPrevented) return
        if (event.button !== undefined && event.button !== 0) return
        const state = store.get()
        if (state.preview !== null) return
        if (state.menu !== null) store.closeMenu()
        const path = typeof event.composedPath === 'function' ? event.composedPath() : []
        let button = null
        for (const node of path) {
          if (node instanceof HTMLElement && node.tagName === 'BUTTON') { button = node; break }
        }
        if (button === null) return
        if (button.closest('.dit-gallery, .dit-preview, .dit-layer, .dit-menu, .dit-menu-backdrop')) return
        const markdown = button.closest('[class*="markdown"]')
        if (!(markdown instanceof HTMLElement)) return
        const image = button.querySelector('img')
        if (!(image instanceof HTMLImageElement)) return
        if (image.naturalWidth < 160 || image.naturalHeight < 120) return
        const src = image.currentSrc || image.src
        // Prefer the whole-conversation index: the same Markdown block plus
        // every image from other turns before and after it.
        if (Array.isArray(latestChatNodes)) {
          const conversation = collectConversationImages(latestChatNodes)
          if (conversation.length > 1) {
            const alt = image.getAttribute('alt') || ''
            const index = findConversationMarkdownIndex(conversation, src, alt)
            if (index >= 0) {
              event.preventDefault()
              event.stopPropagation()
              bridgeActivations += 1
              const loader = bridgeImageLoader()
              const items = conversation.map((entry) => previewItemFromEntry(entry, loader))
              store.setPreview({ items, index, anchor: button })
              return
            }
          }
        }
        const collected = collectMarkdownItems(markdown, button)
        if (collected === null) return
        event.preventDefault()
        event.stopPropagation()
        bridgeActivations += 1
        store.setPreview({ items: collected.items, index: collected.index, anchor: button })
      }
      window.addEventListener('click', onClick, true)
      return () => window.removeEventListener('click', onClick, true)
    }

    // --------------------------------------------------------------- overlay

    function Overlay() {
      const state = useSyncExternalStore(store.subscribe, store.get, store.get)
      const rootRef = useRef(null)
      const menuRef = useRef(null)
      const lastAnchor = useRef(null)

      useEffect(() => {
        if (state.preview) lastAnchor.current = state.preview.anchor || null
      }, [state.preview])

      useEffect(() => {
        if (!state.menu || !(menuRef.current instanceof HTMLElement)) return
        const first = menuRef.current.querySelector('.dit-menu-item')
        if (first instanceof HTMLElement) first.focus()
      }, [state.menu])

      useEffect(() => {
        if (state.preview || state.menu) return
        const anchor = lastAnchor.current
        lastAnchor.current = null
        if (!(anchor instanceof HTMLElement) || !anchor.isConnected) return
        const target = anchor.querySelector('.dit-thumb') || (anchor instanceof HTMLElement && anchor.matches('button') ? anchor : null)
        if (target instanceof HTMLElement) target.focus()
      }, [state.preview, state.menu])

      // The menu owns keyboard input only while it is open; the preview owns it
      // otherwise.
      useEffect(() => {
        if (!state.menu) return undefined
        const onKeyDown = (event) => {
          const menu = store.get().menu
          if (menu === null) return
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            store.closeMenu()
            return
          }
          if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'c') {
            event.preventDefault()
            runCopy(menu)
            return
          }
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && menuRef.current) {
            const items = Array.from(menuRef.current.querySelectorAll('.dit-menu-item'))
            if (items.length === 0) return
            event.preventDefault()
            const index = items.indexOf(document.activeElement)
            const next = event.key === 'ArrowDown'
              ? (index + 1 + items.length) % items.length
              : (index - 1 + items.length) % items.length
            items[next].focus()
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [state.menu])

      useEffect(() => {
        if (!state.menu) return undefined
        const close = () => store.closeMenu()
        window.addEventListener('scroll', close, true)
        window.addEventListener('resize', close)
        window.addEventListener('blur', close)
        return () => {
          window.removeEventListener('scroll', close, true)
          window.removeEventListener('resize', close)
          window.removeEventListener('blur', close)
        }
      }, [state.menu])

      const renderMenu = (menu) => {
        let left = menu.x
        let top = menu.y
        const root = rootRef.current
        if (root !== null) {
          const rect = root.getBoundingClientRect()
          left = menu.x - rect.left
          top = menu.y - rect.top
          left = Math.min(left, rect.width - 316)
          top = Math.min(top, rect.height - 210)
        }
        left = Math.max(8, left)
        top = Math.max(8, top)
        const meta = metaLine(menu)
        return [
          h('div', { key: 'backdrop', className: 'dit-menu-backdrop', onMouseDown: () => store.closeMenu() }),
          h(
            'div',
            {
              key: 'menu',
              ref: menuRef,
              className: 'dit-menu',
              role: 'menu',
              style: { left, top },
              onMouseDown: (event) => event.stopPropagation(),
            },
            h(
              'div',
              { className: 'dit-menu-head' },
              h('span', { className: 'dit-menu-name' }, downloadName(menu, menu.mediaType)),
              meta === '' ? null : h('span', { className: 'dit-menu-meta' }, meta),
            ),
            h('div', { className: 'dit-menu-sep' }),
            h(
              'button',
              {
                type: 'button',
                role: 'menuitem',
                className: 'dit-menu-item',
                disabled: state.busy,
                onClick: () => runCopy(menu),
              },
              h(CopyIcon),
              h('span', { className: 'dit-menu-label' }, state.busy ? t('menu.copying') : t('menu.copy')),
              h('span', { className: 'dit-menu-kbd' }, t('menu.shortcut')),
            ),
            h(
              'button',
              {
                type: 'button',
                role: 'menuitem',
                className: 'dit-menu-item',
                disabled: state.busy,
                onClick: () => runDownload(menu),
              },
              h(DownloadIcon),
              h('span', { className: 'dit-menu-label' }, t('menu.download')),
              h('span', { className: 'dit-menu-kbd' }, 'Enter'),
            ),
            h('div', { className: 'dit-menu-sep' }),
            h('div', { className: 'dit-menu-foot' }, t('menu.hint')),
          ),
        ]
      }

      const renderToast = (toast) => {
        const tone = toast.tone || 'ok'
        return h(
          'div',
          { className: 'dit-toast', role: 'status' },
          h(
            'span',
            { className: 'dit-toast-mark' },
            tone === 'ok'
              ? h(CheckIcon)
              : h('span', { style: { fontSize: 10, fontWeight: 700, lineHeight: 1 } }, '!'),
          ),
          h('span', null, toast.text),
          toast.action
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dit-toast-action',
                  onClick: () => {
                    const action = toast.action
                    store.hideToast()
                    action.run()
                  },
                },
                toast.action.label,
              )
            : null,
        )
      }

      return h(
        'div',
        { ref: rootRef, className: 'dit-layer', style: { pointerEvents: 'none' } },
        state.preview
          ? h(Preview, {
              key: state.preview.items.map((item) => item.key).join('|'),
              preview: state.preview,
              onClose: () => store.clearPreview(),
            })
          : null,
        state.menu ? renderMenu(state.menu) : null,
        state.toast ? renderToast(state.toast) : null,
      )
    }

    // ----------------------------------------------------------------- apply
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        clientCtx = ctx
        try { clientSessions = ctx.get('sessions') } catch (error) { clientSessions = undefined }
        try {
          ctx.inject(['sessions'], (sessionCtx) => {
            try { clientSessions = sessionCtx.get('sessions') } catch (error) { /* late binding */ }
          })
        } catch (error) { /* inject unavailable */ }
        try {
          ctx.effect(() => ctx.locale.register(NS, { zh: MESSAGES.zh, en: MESSAGES.en }), 'dsh-image-tools: dictionaries')
          translate = ctx.locale.bind(NS)
        } catch (error) {
          console.warn('[dsh-image-tools] locale unavailable:', error)
        }

        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-image-tools'
          tag.dataset.pluginCss = 'dsh-image-tools/skin.css'
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => {
            tag.remove()
          }
        }, 'dsh-image-tools: styles')

        const diagnostics = {
          slots: {},
          collectMessageImages,
          collectConversationImages,
          conversationImageKinds: () => {
            const entries = Array.isArray(latestChatNodes) ? collectConversationImages(latestChatNodes) : []
            const kinds = { attachment: 0, markdown: 0 }
            for (const entry of entries) kinds[entry.kind] = (kinds[entry.kind] || 0) + 1
            return { total: entries.length, ...kinds }
          },
          bridgeLoaderAvailable: () => bridgeImageLoader() !== undefined,
          bridgeActivationCount: () => bridgeActivations,
          sessionsServiceAvailable: () => Boolean(currentSessionsService() && typeof currentSessionsService().binding === 'function'),
          indexSessionId: () => latestSessionId,
          markdownIndexOf: (src, alt) => {
            const conversation = Array.isArray(latestChatNodes) ? collectConversationImages(latestChatNodes) : []
            return findConversationMarkdownIndex(conversation, src, alt || '')
          },
        }
        globalThis.__DSH_IMAGE_TOOLS__ = diagnostics
        ctx.effect(installMarkdownBridge, 'dsh-image-tools: markdown image bridge')
        ctx.effect(() => () => {
          store.reset()
          for (const url of attachmentUrlCache.values()) {
            try { URL.revokeObjectURL(url) } catch (error) { /* already revoked */ }
          }
          attachmentUrlCache.clear()
          if (globalThis.__DSH_IMAGE_TOOLS__ === diagnostics) delete globalThis.__DSH_IMAGE_TOOLS__
        }, 'dsh-image-tools: overlay state')

        for (const name of IMAGE_SLOTS) {
          ctx.slots.inject(name, () => {
            diagnostics.slots[name] = true
            return ctx.slots.register({ name, priority: PRIORITY }, ImageGallery)
          })
        }
        ctx.slots.inject('shell.overlay', () => {
          diagnostics.slots['shell.overlay'] = true
          return ctx.slots.register({ name: 'shell.overlay', id: OVERLAY_ID, order: 100 }, Overlay)
        })
        // Mirrors the conversation snapshot for the markdown bridge; renders
        // nothing and only needs the session's standard props.
        ctx.slots.inject('conversation.session.header.utilities', () => {
          diagnostics.slots['conversation.session.header.utilities'] = true
          return ctx.slots.register({
            name: 'conversation.session.header.utilities',
            id: 'image-tools-index',
            order: -100,
          }, ConversationImageIndexTap)
        })
      },
    }
  },
})
