# dsh-image-tools v0.2 设计方案（图片预览：缩放 / 平移 / 翻页）

> 版本：v0.2 设计评审稿 · 2026-11-16
> 状态：**仅设计，未改代码**（效果图见本目录 `01`–`05`，源文件在 `source/`）
> 基线：DSH Desktop `0.2.2-rc.3`（Windows）、插件现状 `dsh-image-tools@0.1.0`

---

## 1. 结论

1. 你的观察成立：DSH 自带预览层（以及 v0.1.0 复刻的预览层）是"遮罩 + 一张图 + 关闭"，**没有缩放、平移、多图翻页**。原因见 §2。
2. 解决方案不需要新插件：**在 `dsh-image-tools` 上迭代**。插件已经接管 4 个图片槽位和 `shell.overlay`，缩放/翻页是纯前端改动，不碰 Host、不碰附件库。
3. 你补充的两点已纳入本方案：
   - **不再在右上角放任何按钮**。Windows 桌面顶部 40px 是原生窗口控件（最小化/最大化/关闭），v0.1 的 `×` 正好压在关闭按钮上；v0.2 把关闭、缩放、翻页全部下沉到底部工具条（效果图 01/04）。
   - **远程会话按同一套 UI 工作**：远程只改文件读写路径与连接状态展示，消息图片仍然落在本机附件库；预览/缩放/翻页/复制/下载都不经过 SSH（效果图 05）。

---

## 2. 依据：为什么现在没有这些能力

### 2.1 官方预览层本身是极简单图灯箱

- 官方每个 `MessageImage` 自带 `open` 状态，只把**单个 `src`** 传给 `ImageLightbox`：
  `D:\soft\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-client-ui-attachment\src\MessageImage.tsx:155`
- 官方 `ImageLightbox`（前端 bundle 内 `Jb`）参数只有 `{src, alt, labels, onClose, contextMenuProps}`，键盘只处理 `Esc` 和 `Tab`，没有 wheel / pointer / transform / 上一张下一张。
- 同一个包把图片注册进 4 个 `single` 槽位（用户消息 / 助手消息 / 工具结果 / 轨迹缩略图），一个槽位实例只拿到**一组连续图片**。

### 2.2 官方有缩放能力，但只给了右侧文件预览

`@deepseek-ai/dsh-client-ui-sidebar-documentpreview` 有一套完整缩放视口：
`...\src\client\zoom\ZoomViewport.tsx:178-210`（Ctrl+滚轮锚点缩放、`ZoomControls`、适应宽度、滚动平移）。
对话灯箱没有接这套组件——这是官方产品选择，不是缺陷。

### 2.3 右上角重叠的根因（你补充的问题）

- Windows 主窗口用 `titleBarStyle: "hidden"` + `titleBarOverlay.height = 40`：
  `D:\soft\DeepSeek Harness\resources\app.asar\lib\main.js:20249-20257`
- preload 在 `<html>` 上打 `data-windows-titlebar` 并设置 `--dsh-windows-titlebar-height: 40px`：
  `...\lib\preload-app.cjs:1785-1790`
- DSH 布局给"浮层/portal"准备了安全区变量，并把 native 标题栏让出来：
  `...\dsh-client-ui-layout\src\client\AppFrame.module.css:105-121`：
  `--dsh-frame-top-clearance`、`--dsh-frame-overlay-top = clearance + 20px`（Windows 非全屏 = 60px；全屏 = 20px；macOS = 68px）。
- 但 `shell.overlay` 图层本身是 `inset:0; z-index:20`：
  `...\AppFrame.module.css:363-371`（`AppFrame.tsx:328-330` 挂载）。
  所以 v0.1 的 `.dit-preview-close{top:20px;right:20px}` 落在 40px 标题栏带内，和窗口关闭按钮重叠；点错时容易关掉整个窗口。

**结论：预览层不应在顶部放可点元素。** 顶部 40px 只属于窗口控件；所有预览控件固定在底部工具条，图像舞台顶部用 `--dsh-frame-overlay-top` 留白（效果图 04 第 2 格）。

---

## 3. 目标与非目标

### 目标（v0.2.0 / v0.3.0）

- 单图预览：适配 / 100% / 25%–800% 连续缩放；放大后拖动平移；双击复位；键盘可操作。
- 组内多图：同一消息（用户一条消息多张、助手连续图片、工具结果多图）内可上一张/下一张，带页码与缩略图条。
- 底部工具条统一承载：翻页、缩放、复制、下载、关闭；**顶部零控件**。
- 兼容：Windows 窗口控件、macOS 红绿灯、全屏、520px 窄窗口、深色主题、Remote Deck 面板/远程会话。
- 不破坏 v0.1.0 已验收能力：复制原图字节、下载原格式、右键菜单、hover 圆钮、四个槽位。

### 非目标（本期不做）

- 跨消息 / 整个会话的图片连续浏览（数据源不同，见 §5.3，列为 v0.4 可选）。
- 右侧栏文件预览（官方已有缩放）；Markdown 外链图片；非图片附件。
- 图片编辑、标注、旋转、对比视图。

---

## 4. 交互设计（v0.2.0 缩放 / 平移 + v0.3.0 翻页）

### 4.1 预览层结构

```
遮罩（rgba(12,14,18,.58)）
├─ 图像舞台：顶部 = var(--dsh-frame-overlay-top,20px)；底部 = 126px（工具条 + 缩略图条）；左右 32px
├─ 底部工具条（居中，高 48，圆角 14，底部 22）
│  ├─ [页码 ‹ 2/3 ›]（组内 ≥2 张才出现）
│  ├─ [文件名 · 尺寸]（窄窗口隐藏）
│  ├─ [− 百分比 + 适配]（缩放组）
│  ├─ [复制] [下载]
│  └─ [关闭 Esc]
├─ 缩略图条（组内 ≥2 张且宽度 ≥760 时出现）：58×34、当前项白描边
└─ Toast（复制/下载反馈，工具条上方）
```

- **没有右上角 ×**；关闭 = 工具条"关闭"按钮 / `Esc` / 点击遮罩。三个入口都保留。
- 顶部 40px（Windows）/ 68px（macOS 非全屏）完全不画预览控件；图像舞台顶部也避开窗口按钮。
- 工具条在底部居中，避开 Remote Deck 快捷面板（左下 370px，z-index 1001）。

### 4.2 缩放与平移

| 操作 | 行为 |
|---|---|
| 滚轮 / 触控板捏合（`ctrlKey+wheel`） | 以**指针位置为锚点**连续缩放 25%–800%；阻止页面缩放 |
| 双击图像 | 「适配」↔「100%」切换 |
| 放大后按住拖动 | 平移（`pointerdown/move/up`，抓手指针；不可拖动时显示默认指针） |
| 工具条 `−` / `+` | 按 1.25 倍步进缩放 |
| 工具条百分比按钮 | 点击回到 100%；显示当前实际比例（适配时显示计算值，如 70%） |
| 工具条「适配」 | 回到适配视口（fit） |
| 键盘 `+` / `-` / `0` | 放大 / 缩小 / 100% |
| 关闭或翻页 | 缩放复位为「适配」，避免带着 3× 跳到下一张 |

实现要点：单张 `<img>`（或容器）只做 CSS `transform: translate()+scale()`，不重排、不重复解码；原图只加载一次；GIF 动画与 SVG 保持原有行为。大图仍走现有 blob URL。

### 4.3 多图翻页（v0.3.0）

- **范围：同一条消息**。覆盖：
  - 用户消息里一次粘贴的多张图（`UserContent` 每张图一个 slot 实例，`images:[one]`）；
  - 助手消息里的连续 image blocks（一个 slot 实例拿到数组）；
  - 工具结果里的多张图（`tool.call.images` 数组）。
- 数据来源：
  - 数组型（助手/工具）：直接用 slot props 的 `images`。
  - 用户消息多图：slot props 里只有一张图，用 slot 的 `standardProps.useChat`（`ChatSnapshot.legacy.nodes`，`ConversationNode[]`）按 `attachmentId` 找到所属消息，收集该消息内的 `ContentBlock`（`{type:'image', attachment}`）得到完整有序列表。`useChat` 是槽位标准属性，官方契约已提供；找不到时**降级为单图**，不阻塞预览。
- 交互：`←`/`→` 键、工具条箭头、点击缩略图；页码 `n / total`；翻页复位适配；不满 2 张不显示任何翻页 UI。
- 边界：流式追加图片时列表增长，保持当前 index 稳定；offloaded 图片按普通附件处理；提交回显（本地预览 URL）不参与跨实例收集。

### 4.4 键盘与无障碍

- `Esc` 关闭（优先级最高，`capture` 阶段拦截）；`← →` 翻页（菜单打开时不生效）；`+ - 0` 缩放；`Tab` 只在工具条内循环。
- `role="dialog" aria-modal="true"`；工具条按钮都有 `aria-label`；页码用 `aria-live="polite"` 播报；关闭后焦点回到原缩略图。
- 尊重 `prefers-reduced-motion`：缩放不做过渡动画。

### 4.5 与 v0.1.0 既有交互的关系

- 缩略图 hover 圆钮、右键菜单、复制/下载管线全部保留；右键菜单在预览里继续可用。
- 菜单定位带上安全区夹取（顶部至少避开 40px 标题栏带），避免菜单压到窗口控件。

---

## 5. 兼容性设计（本方案的重点）

### 5.1 Windows / macOS / 全屏 / 窄窗口

| 场景 | 处理 |
|---|---|
| Windows 桌面 | 顶部 40px 让给原生控件；舞台顶部 = `--dsh-frame-overlay-top`（60px）；不放任何可点元素 |
| 全屏 | `--dsh-frame-overlay-top` 自动变 20px，同一套底部工具条 |
| macOS | 红绿灯在左上；顶部安全区 68px；底部工具条同样适用；不做平台判断，只读 DSH 变量 |
| 窄窗口 520px | 工具条只留图标（复制/下载/关闭/页码）；隐藏文件名与缩略图条；不换行遮挡图像 |
| 深色主题 | 全部使用 `--dsw-*` token（`bg-layer-2`、`label-*`、`border-l2`、`bg-mask-1`、focus ring） |
| 浏览器 web profile | 没有 `data-windows-titlebar`，`var(--dsh-frame-overlay-top, 20px)` 回退 20px，布局不变 |

### 5.2 与 DSH 自身浮层/壳层

- 预览继续留在 `shell.overlay`（官方覆盖层，`pointer-events:none` 图层 + 子元素 `auto`），**不 portal 到 `body`、不读别的插件 DOM**。
- 不在顶部放控件，因此与窗口 caption、Windows 菜单栏（preload 注入，`z-index:1100`，占顶部 40px 左半）都不重叠。
- 与 Remote Deck：其快捷面板 `z-index:1001`、对话框 `1200`、下载 toast `9999`（`dsh-remote-deck/client.js:386-390, 607, 583`），层级高于 `shell.overlay`（20）。本方案**不抢 z-index**：工具条底部居中，避开左下 370px 面板区；模态对话框本来就该盖住预览。
- 与官方右侧栏/文档预览：预览打开时全屏遮罩盖住右侧栏，关闭即恢复；不改右侧栏任何行为。

### 5.3 远程会话（Remote Deck / SSH）

事实链（v0.1.0 已验证过一半）：

1. 消息图片是**本机附件**：`@deepseek-ai/dsh-attachment-local` 直接读写 `DSH_HOME/attachments/v1`，不经过 `ctx.fs`。
2. 远程插件只改工作区文件读写路径（`ctx.fs` → SSH）、注册侧栏面板/连接状态；**不碰附件服务与图片槽位**。
3. 远程工具产出的图片（远端截图、`read_image`）同样先落本机附件，再进 `tool.call.images`。
4. 因此预览拿到的仍是本机 blob URL：缩放/翻页是纯本地渲染，复制写本机剪贴板，下载落本机磁盘；动作全程没有 SSH 往返。
5. 远程状态（头部胶囊、侧栏 SSH 连接、会话行"远程"标记）位于预览遮罩之后，不被影响；预览也不依赖连接状态。

**本期验收必须包含远程会话用例**（见 §8）。已知限制：Remote Deck 的快捷面板/下载 toast 层级更高，可浮在预览之上；预览工具条已避开其面板区域，属可接受。

---

## 6. 技术改动面（实现时按此执行）

`client.js` 内改动，不新增依赖、不改 Host：

1. **store**：`preview` 从单张图改为 `{ images: [(spec, info)], index, anchor }`；新增 `zoom` 状态（`fit | number`，只属于预览、关闭即复位）。
2. **数据**：`ImageGallery` 组装 `images` 列表；用户消息多图经 `useChat` 补全（失败降级单图）；`infoOf()` 复用现有结构。
3. **预览组件**：`<img>` 外包一层缩放容器；指针/滚轮/键盘事件；工具条重排（页码组 + 缩放组 + 动作组 + 关闭）；缩略图条。
4. **安全区**：CSS 使用 `var(--dsh-frame-overlay-top, 20px)` 做舞台顶部；工具条/缩略图条固定在底部；菜单定位夹取到安全区。
5. **生命周期**：`ctx.effect` 清理事件；会话切换时关闭预览（订阅会话/位置变化）；焦点归还原缩略图。
6. **无新增 import**：保持 v0.1.0 "不 require 其他 Client 包"的约定（官方 `ZoomControls` 在模块表里可用，但本方案自绘 60 行即可，避免新增依赖面）。
7. 版本：`package.json` / `client.js` 的 `BUILD` / `CHANGELOG.md` 三处同步；`npm run check`、`npm test`、`npm run pack:dry`。

---

## 7. 版本计划与工作量

| 版本 | 内容 | 估时 |
|---|---|---|
| **v0.2.0** | 底部工具条重排（去顶部 ×）、缩放/平移、双击复位、键盘、安全区、深色/窄窗、会话切换关闭 | 0.5–1 天 |
| **v0.3.0** | 组内翻页（用户多图经 useChat 补全 + 助手/工具数组）、缩略图条、页码、`← →`、翻页复位 | 0.5 天 |
| v0.4（可选，先方案） | 跨消息/整会话图片索引：Host 侧按会话列出图片附件，或在侧栏做"会话图片"面板；覆盖用户逐条发的图 | 1–2 天 + 风险 |

默认决策（你无法现在回答的三问，我按此执行，确认后开工）：

1. 缩放触发：**无修饰滚轮**（灯箱内更直觉）+ 触控板捏合；同时拦截 `ctrl+wheel` 防止页面缩放。
2. 翻页口径：**先做同一条消息**（覆盖一次粘贴多图 / 助手多图 / 工具多图），跨消息放到 v0.4。
3. 缩略图条：**默认显示**（≥2 张且宽度 ≥760），窄窗口自动收起；不使用数字角标，只保留当前项描边。

---

## 8. 验收计划

1. `npm run check` / `npm test` / `npm run pack:dry`。
2. 隔离 profile `imagecheck`：`install.ps1 -Profile imagecheck` + `-Doctor`，独立 host 启动。
3. CDP 截图（1440×900 @2x）：浅色/深色、适配、200% 放大、多图翻页、520px 窄窗、远程会话各一张；对照本目录效果图记录偏差。
4. 真实 GUI（`desktop` profile，重启后生效）复核：
   - 点右上角窗口关闭按钮不会被预览 `×` 干扰（顶部已无控件）；
   - 滚轮/双击/拖动、`← →`、`Esc`、点遮罩；
   - 用户一条消息多图、助手多图、工具多图三种翻页来源；
   - 复制原图字节、下载原格式（SHA-256 对比附件库）。
5. **远程会话用例**：Remote Deck 连一台远程机（假数据/测试环境即可），在远程工作区会话里：
   - 粘贴一张本机截图 → 预览、缩放、复制、下载；
   - 让远程工具产出一张图 → 预览、翻页、下载；
   - 确认头部"已连接"胶囊、侧栏 SSH 状态正常，预览关闭后状态不丢。
6. 控制台无报错、无泄漏 listener/timer；卸载插件后官方图片行为恢复。
7. 通过后提交 git，再更新 `desktop`（需重启 DSH）；市场需重新提交新版本。

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| `useChat.legacy.nodes` 形状变化 | 用户消息多图无法组队 | 全程存在性判断，失败降级单图；翻页只在拿到 ≥2 张时出现 |
| 官方槽位 props 变化 | 预览/缩略图回归 | 保持 v0.1.0 的四槽位接管与降级策略；升级 DSH 后重跑验收 |
| 顶部安全区变量在 web profile 缺失 | 顶部多留 20px | `var(--dsh-frame-overlay-top, 20px)` 回退；不写死 40/60 |
| Remote Deck 面板/对话浮层更高 | 面板盖住预览一角 | 工具条居中避开左下；对话框打开时预览让位；文档写明 |
| 大图缩放性能 | 拖动卡顿 | 只做 transform；不重复解码；`will-change: transform` 仅放大时加 |
| 交互抢占 | 与 DSH 全局快捷键冲突 | 预览打开时只拦截 `Esc/← →/+ -/0`，其余放行；菜单打开时方向键给菜单 |
| 跨消息翻页需求 | v0.3 不满足"整个会话连续看" | v0.4 用 Host 会话附件索引补；先如实告知范围 |

---

## 10. 效果图清单

| 文件 | 内容 |
|---|---|
| `01-preview-fit.png` | 适配预览 + 新底部工具条；标注顶部 40px 归属与关闭三入口 |
| `02-preview-zoom.png` | 205% 放大 + 拖动平移状态；缩放控件与双击复位提示 |
| `03-preview-paging.png` | 同一条消息 3 图翻页（2/3）+ 缩略图条 + 页码 |
| `04-compat-spec.png` | 兼容规格：旧版重叠问题、Windows 安全区、macOS/全屏、窄窗+深色、Remote Deck 共存、尺寸与快捷键 |
| `05-remote-session.png` | 远程会话里预览/翻页/复制正常工作；标注附件链路与远程状态 |

源文件：`source/*.html` + `source/base.css`，用 `source/render.ps1` 渲染（1440×900 @2x，Chrome headless）。
所有示意内容均为虚构（主机名 `build-01.example.net`、IP `203.0.113.21`、工作区 `demo-app`）。
