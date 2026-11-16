# v0.4.0 验收记录

- 包：`dsh-image-tools@0.4.0`
- 环境：隔离 profile `imagecheck`（`E:\ai-workspace\Deepseek Harness\.dsh`），独立 host `http://127.0.0.1:3099`，headless Chrome `1440×900 @2x`
- 结论：**通过**（验证边界见最后一节）

## 这版修了什么

用户反馈："新发的图有底部操作条，老图没有。" 复现后确认原因：

- 用户上传的图片是结构化图片块，走 `conversation.chat.user.images` 等 Slot，v0.2/v0.3 已接管。
- 助手正文 / 工具输出里用 Markdown 嵌入的图片（`![..](..)`）由 DSH 自带的 Markdown 渲染器直接渲染，并自带官方灯箱；这条路径**没有 Slot 可替换**，所以点开是"右上角圆形 X、底部什么都没有"的官方预览。
- 浏览器 bundle 里该渲染器直接调用官方 `ImageLightbox`（`_imageButton_` 按钮 + `onClick` 打开灯箱），没有插件扩展点。

v0.4.0 增加一个**点击桥接层**：只在点击官方 Markdown 图片按钮时接管，读取被点图片与同一 Markdown 块内的兄弟图片，打开插件预览（缩放/平移/复制/下载/翻页）。它不修改官方 DOM；识别不到模式时直接放行，退回官方预览。

## 自动检查

| 项 | 结果 |
|---|---|
| `npm run check` | `manifest ok: dsh-image-tools@0.4.0` |
| `npm test` | 6 个测试全部通过 |
| v0.3 回归（`scripts/verify-preview.mjs`，3 图消息） | 42 项断言全部通过 |
| Markdown 桥接（`scripts/verify-markdown.mjs`，历史会话） | 全部断言通过 |

## Markdown 桥接证据

测试对象：一个包含 Markdown 嵌入图片的历史会话（标题不写入仓库）。会话中有 2 张 Markdown 图片。

| 项 | 证据 |
|---|---|
| 点击 Markdown 图片 | 打开的是插件预览：`role=dialog` class = `dit-preview`（不是官方灯箱） |
| 工具条 | 上一张 / 下一页 / 缩小 / 100% / 放大 / 适配 / 复制图片 / 下载原图 / 关闭 Esc |
| 翻页 | 页码「第 1 / 2 张」，缩略图条 2 项 |
| 缩放 | 滚轮 81% → 97%，指针锚定 |
| 复制 | toast「已复制图片到剪贴板」，剪贴板读回 `image/png` |
| 下载 | 158762 字节，SHA-256 `97a1b722…286def1e`（原始字节，文件名沿用图片 alt/URL） |
| 关闭 | `Esc` 关闭后无残留 `dit-preview`，也没有官方灯箱 backdrop |
| 焦点 | 关闭后焦点回到被点击的 Markdown 图片按钮 |

## 截图与隐私

本轮截图包含用户历史会话里的真实图片内容，**没有提交到仓库**。证据以 `report.json` 的断言记录为准；本地截图保留在临时目录（`%TEMP%\dsh-imagecheck\v04-evidence\30-markdown-preview.png`、`31-markdown-zoom.png`）。

复跑时使用自己的含 Markdown 图片的会话即可生成同类截图：

```powershell
.\install.ps1 -Profile imagecheck
dsh --profile imagecheck --port 3099 --no-open
chrome --headless=new --remote-debugging-port=9222 --user-data-dir=%TEMP%\dsh-chrome about:blank
node scripts/verify-markdown.mjs "<url>" "<含 Markdown 图片的会话标题>" docs/verification/v0.4.0 9222
```

## 验证边界（如实记录）

1. 桥接依赖官方 Markdown 渲染器的两个特征：图片按钮的 `cursor: zoom-in` 与祖先 `class*="markdown"`。DSH 改版后如果特征消失，插件会放行官方预览（功能退化但不破坏），需要重新适配。
2. 只覆盖带官方"点击预览"行为的 Markdown 图片；纯 `<img>`（无灯箱）不接管；Composer 输入框草稿缩略图仍是官方预览。
3. 翻页范围是**同一个 Markdown 块**内的图片；跨消息/整会话连续浏览仍未做。
4. 未重启用户的 `desktop` 实例；桌面真实窗口下的观感需用户重启后复核。远程会话未单独重跑（桥接在浏览器半区，与附件链路无关）。
5. 本版引入的是唯一一处 DOM 读取（v0.1–v0.3 的"不读官方 DOM"约定在此处为兼容 Markdown 图片而让步），已在 README 中注明。

## 回滚

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Rollback -Profile imagecheck
```
