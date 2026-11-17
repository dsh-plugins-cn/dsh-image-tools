# dsh-image-tools

**图片预览工具 / Image Preview Tools** — 对话图片的完整查看与操作：缩放、平移、跨轮次翻页，以及复制/下载原图字节。

粘贴的截图、上传的图片、助手与工具渲染的图片，都可以：

- **右键**缩略图 → 复制图片 / 下载原图
- **悬停**缩略图 → 右上角浮出两个小圆钮
- **点开预览** → 滚轮/触控板缩放、放大后拖动平移、双击复位；底部工具条复制 / 下载 / 关闭
- **同一条消息内的多图可翻页**；整个会话（跨轮次）的图片也进入同一个翻页索引：从任意一张图打开，可用 `←`/`→` 在本次加载的会话窗口内连续浏览前后轮次的图片。助手/工具 **Markdown 里嵌入的图片**同样使用这套预览与索引。

复制的图片进入系统剪贴板，下载保留**原始字节与格式**（jpg 还是 jpg，不转码、不压缩）。插件只接管图片展示层，不改变消息布局；卸载后官方表现立即恢复。

## 预览操作

| 操作 | 行为 |
|---|---|
| 滚轮 / 触控板捏合 | 以指针为锚点缩放（25%–800%） |
| 双击 | 「适配」↔「100%」 |
| 放大后拖动 | 平移，边界夹取 |
| `←` / `→` / 页码 / 缩略图条 | 跨轮次翻页：整个已加载会话的图片按对话顺序排列 |
| `+` / `-` / `0` | 放大 / 缩小 / 回到适配 |
| `Esc` / 点遮罩 / 工具条「关闭」 | 关闭预览 |

预览控件**全部在底部工具条**：顶部 40px 是 Windows 原生窗口按钮、macOS 是左上红绿灯，插件不在那里放任何可点元素；图像舞台使用 DSH 的 `--dsh-frame-overlay-top` 安全区，Windows / macOS / 全屏 / 窄窗口 / Web profile 共用一套布局。

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
- 翻页索引覆盖 DSH 当前已加载的会话窗口；更早的轮次在会话加载历史后进入索引。
- Markdown 嵌入图片（助手正文 / 工具输出里的 `![..](..)`）通过一个点击桥接层接入预览（v0.4.0）：只读取被点图片与其所在 markdown 块，不修改官方 DOM；DSH 改版导致识别不到时会自动退回官方预览。Composer 输入框里的草稿缩略图不在接管范围。
- 桥接层对相对/绝对文件路径的 Markdown 图片按"URL 精确匹配 → 文件名 → alt"的顺序定位到会话索引；同名文件较多时可能定位到最近一次出现的那张。
- Remote Deck 快捷面板、对话框等第三方浮层层级可能高于预览；预览工具条固定在底部居中，避开其左下常驻面板区域。

## 开发

```powershell
npm run check
npm test
npm run pack:dry
```

设计稿与验收记录在 `docs/`。

## 许可

MIT。