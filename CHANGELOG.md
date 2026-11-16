# Changelog

## 0.3.0

- **Same-message image paging.** When a message holds several images the
  preview grows a pager (‹ n / total ›), a filmstrip of thumbnails, ←/→
  keys and click-to-jump; changing images returns to fit.
- User messages render one image slot per attachment, so a single-image slot
  recovers its siblings from the conversation snapshot by attachment id
  (ChatSnapshot.legacy.nodes -> user content / assistant blocks / tool
  result content). If the snapshot cannot supply the siblings the preview
  degrades to the old single-image behaviour.
- Filmstrip hidden below 760px; pager hidden for single-image messages.
- Toolbar group order stays zoom, copy, download, close; page counter is
  announced politely for screen readers.
## 0.2.0

- Preview gains wheel/pinch zoom (25%–800%), drag-to-pan once enlarged, double
  click to toggle fit/100%, `+`/`-`/`0` shortcuts, and a zoom group in the
  toolbar.
- **Preview chrome moved to the bottom.** The old top-right close button sat in
  the Windows caption band and overlapped the native window close button; the
  new toolbar has no control inside the 40px caption strip. The image stage
  clears DSH's own `--dsh-frame-overlay-top` safe inset, so Windows, macOS,
  full-screen, narrow windows and the web profile share one layout.
- Toolbar rebuilt: fit/percentage controls, copy, download, close, Esc hint;
  collapses to icon-only controls on narrow windows.
- Keyboard and focus handling: `Esc`, `+`/`-`/`0`, Tab cycling inside the
  preview, focus restored to the thumbnail on close; menu keeps its own keys.
- Preview stays anchored to the image when zooming (pointer-anchored), clamps
  panning to the image edges, and resets to fit when the image changes.
## 0.1.0

- First release: message images can be copied or downloaded from a right-click
  menu, hover actions on thumbnails, and a full-screen preview toolbar.
- Takes over `conversation.chat.user.images`, `conversation.chat.message.images`,
  `tool.call.images` and `conversation.trajectory.images` at priority 10.
- Overlay surfaces live in `shell.overlay`; no DOM scraping, no `document.body`
  appends, no Client package imports.

