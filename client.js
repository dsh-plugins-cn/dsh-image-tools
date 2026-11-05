/**
 * dsh-image-tools — browser half.
 *
 * Takes over the four message-image slots and renders the gallery itself, so
 * every conversation image gains three entry points for the same two actions:
 * a hover action cup on the thumbnail, a right-click menu, and the toolbar of
 * the full-screen preview. Overlay surfaces register into `shell.overlay`.
 *
 * Rules honoured here: no DOM scraping, no body-root writes, no imports
 * from other Client packages, theme tokens only, every registration through
 * `ctx.slots.inject` so disposal removes it.
 */
window.__ModuleLoader__.load({
  id: 'dsh-image-tools',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState, useSyncExternalStore } = React

    const NS = 'dsh-image-tools'
    const PRIORITY = 10
    const OVERLAY_ID = 'image-tools'
    const IMAGE_SLOTS = [
      'conversation.chat.user.images',
      'conversation.chat.message.images',
      'tool.call.images',
      'conversation.trajectory.images',
    ]

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
        'preview.esc': 'Esc 关闭预览',
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
        'preview.esc': 'Esc to close',
        'toast.copied': 'Image copied to the clipboard',
        'toast.copyFailed': 'Copying images is not supported here',
        'toast.useDownload': 'Download instead',
        'toast.downloadStarted': 'Download started',
        'toast.downloadFailed': 'Download failed',
      },
    }

    let translate = (key) => (MESSAGES.zh[key] !== undefined ? MESSAGES.zh[key] : key)
    const t = (key) => translate(key)

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
.dit-preview{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;padding:64px 40px 110px;pointer-events:auto;background:var(--dsw-alias-bg-mask-1)}
.dit-preview-image{max-width:min(100%,1600px);max-height:100%;object-fit:contain;border-radius:var(--dsw-radius-lg);box-shadow:var(--dsw-elevation-prominent);background:var(--dsw-specific-input-major)}
.dit-preview-close{position:absolute;top:20px;right:20px;width:36px;height:36px;display:grid;place-items:center;padding:0;border:.5px solid var(--dsw-alias-border-l2-darkmode-thin);border-radius:999px;background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.dit-preview-close:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dit-preview-close svg{width:15px;height:15px}
.dit-toolbar{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);display:flex;align-items:center;gap:4px;padding:6px;border-radius:14px;background:var(--dsw-alias-bg-layer-2,#fff);color:var(--dsw-alias-label-primary);box-shadow:0 0 0 .5px rgba(0,0,0,.1),0 12px 32px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.08)}
.dit-toolbar-button{display:flex;align-items:center;gap:8px;height:36px;padding:0 12px;border:0;border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer}
.dit-toolbar-button:hover,.dit-toolbar-button:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dit-toolbar-button svg{width:16px;height:16px;color:var(--dsw-alias-label-secondary)}
.dit-toolbar-sep{width:1px;height:18px;margin:0 6px;background:var(--dsw-alias-border-l2)}
.dit-toolbar-hint{padding:0 10px 0 6px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.dit-toast{position:absolute;left:50%;bottom:92px;transform:translateX(-50%);z-index:3;display:flex;align-items:center;gap:9px;height:38px;padding:0 14px;border-radius:11px;pointer-events:auto;white-space:nowrap;font-size:12.5px;background:var(--dsw-alias-label-primary,#1b1b1c);color:var(--dsw-alias-bg-base,#f5f6f7);box-shadow:0 8px 24px rgba(0,0,0,.22)}
.dit-toast-mark{width:16px;height:16px;flex:none;border-radius:50%;display:grid;place-items:center;border:1px solid currentColor;opacity:.85}
.dit-toast-mark svg{width:9px;height:9px}
.dit-toast-action{margin-left:2px;padding:0 2px;border:0;background:transparent;color:var(--dsw-alias-link,#7aaaff);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
`    // ---------------------------------------------------------------- store
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

    function MessageImage({ image, load, variant }) {
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
        store.setPreview({ ...infoOf(), anchor: frameRef.current })
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

    function ImageGallery(props) {
      const images = Array.isArray(props.images) ? props.images : []
      if (images.length === 0) return null
      const variant = props.thumbnail ? 'thumbnail' : props.compact || images.length > 1 ? 'tile' : 'single'
      return h(
        'div',
        { className: 'dit-gallery', 'data-align': props.align },
        images.map((image, index) =>
          h(MessageImage, { key: index, image, load: props.loadImage, variant }),
        ),
      )
    }    // --------------------------------------------------------------- overlay
    function Overlay() {
      const state = useSyncExternalStore(store.subscribe, store.get, store.get)
      const rootRef = useRef(null)
      const menuRef = useRef(null)
      const closeRef = useRef(null)
      const lastAnchor = useRef(null)

      useEffect(() => {
        if (state.preview) lastAnchor.current = state.preview.anchor || null
      }, [state.preview])

      useEffect(() => {
        if (state.preview && closeRef.current instanceof HTMLElement) closeRef.current.focus()
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
        const target = anchor.querySelector('.dit-thumb')
        if (target instanceof HTMLElement) target.focus()
      }, [state.preview, state.menu])

      useEffect(() => {
        if (!state.preview && !state.menu) return undefined
        const onKeyDown = (event) => {
          const menu = store.get().menu
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            if (menu) store.closeMenu()
            else store.clearPreview()
            return
          }
          if (menu && (event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'c') {
            event.preventDefault()
            runCopy(menu)
            return
          }
          if (menu && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && menuRef.current) {
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
      }, [state.preview, state.menu])

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

      const renderPreview = (preview) => {
        const label = preview.name || t('image.alt')
        return h(
          'div',
          {
            className: 'dit-preview',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('preview.label'),
            onMouseDown: (event) => {
              if (event.target === event.currentTarget) store.clearPreview()
            },
          },
          h('img', {
            className: 'dit-preview-image',
            src: preview.src,
            alt: label,
            draggable: false,
            onMouseDown: (event) => event.stopPropagation(),
            onContextMenu: (event) => {
              event.preventDefault()
              event.stopPropagation()
              store.openMenu({ ...preview, x: event.clientX, y: event.clientY })
            },
          }),
          h(
            'button',
            {
              ref: closeRef,
              type: 'button',
              className: 'dit-preview-close',
              'aria-label': t('preview.close'),
              onClick: () => store.clearPreview(),
            },
            h(CloseIcon),
          ),
          h(
            'div',
            { className: 'dit-toolbar', onMouseDown: (event) => event.stopPropagation() },
            h(
              'button',
              { type: 'button', className: 'dit-toolbar-button', onClick: () => runCopy(preview) },
              h(CopyIcon),
              t('menu.copy'),
            ),
            h(
              'button',
              { type: 'button', className: 'dit-toolbar-button', onClick: () => runDownload(preview) },
              h(DownloadIcon),
              t('menu.download'),
            ),
            h('span', { className: 'dit-toolbar-sep' }),
            h('span', { className: 'dit-toolbar-hint' }, t('preview.esc')),
          ),
        )
      }

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
        state.preview ? renderPreview(state.preview) : null,
        state.menu ? renderMenu(state.menu) : null,
        state.toast ? renderToast(state.toast) : null,
      )
    }

    // ----------------------------------------------------------------- apply
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
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

        const diagnostics = { slots: {} }
        globalThis.__DSH_IMAGE_TOOLS__ = diagnostics
        ctx.effect(() => () => {
          store.reset()
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
      },
    }
  },
})