# Changelog

## 0.1.0

- First release: message images can be copied or downloaded from a right-click
  menu, hover actions on thumbnails, and a full-screen preview toolbar.
- Takes over `conversation.chat.user.images`, `conversation.chat.message.images`,
  `tool.call.images` and `conversation.trajectory.images` at priority 10.
- Overlay surfaces live in `shell.overlay`; no DOM scraping, no `document.body`
  appends, no Client package imports.