# dsh-image-tools

对话里的图片终于能复制和下载了。粘贴的截图、上传的图片、助手与工具渲染的图片，都可以：

- **右键**缩略图 → 复制图片 / 下载原图
- **悬停**缩略图 → 右上角浮出两个小圆钮
- **点开预览** → 底部工具条同样两个动作

复制的图片进入系统剪贴板，下载保留**原始字节与格式**（jpg 还是 jpg，不转码、不压缩）。插件只接管图片展示层，不改变消息布局；卸载后官方表现立即恢复。

## 安装

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile imagecheck
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Doctor -Profile imagecheck
```

装到日常 profile（会写 profile 的 `node_modules` 与 `package.json`，**需要重启 DSH 生效**）：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Profile desktop
```

回滚：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Rollback -Profile desktop
```

## 实现

- 接管四个图片插槽：`conversation.chat.user.images`、`conversation.chat.message.images`、`tool.call.images`、`conversation.trajectory.images`，以 `priority: 10` 覆盖官方 `priority: 100` 的注册。
- 预览层、右键菜单与 toast 注册在 `shell.overlay`（`list` / `root`）。
- 原图来自 `props.loadImage(attachment)` 返回的 blob URL，与 `session.readAttachment` 同一份字节。
- 不读官方 DOM、不向 `document.body` 追加节点、不 `require` 其他 Client 包；只用 `--dsw-*` 主题 token。

## 限制

- 只处理**消息图片**。非图片附件（PDF/Office/zip）仍是官方静态卡片，本插件不覆盖；侧栏预览里的工作区图片同样不在范围内。
- Markdown 外链图片（http/https）保留浏览器默认行为。
- GIF 复制到剪贴板会变成静态 PNG（Chromium 剪贴板只接受 PNG），下载仍保留原 GIF。
- 超大图（单边 >16384 或面积 >2.68 亿像素）跳过复制，请用下载。

## 开发

```powershell
npm run check
npm test
npm run pack:dry
```

设计稿与验收记录在 `docs/`。

## 许可

MIT。