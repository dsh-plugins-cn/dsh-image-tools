# v0.3.0 验收记录

- 包：`dsh-image-tools@0.3.0`
- 环境：隔离 profile `imagecheck`（`E:\ai-workspace\Deepseek Harness\.dsh`），独立 host `http://127.0.0.1:3099`，headless Chrome `1440×900 @2x`
- 结论：**通过**（验证边界见最后一节）

## 自动检查

| 项 | 结果 |
|---|---|
| `npm run check` | `manifest ok: dsh-image-tools@0.3.0` |
| `npm test` | 6 个测试全部通过 |
| 隔离 host + CDP 真实交互 `scripts/verify-preview.mjs`（3 张图） | 全部断言通过（`report.json`） |

## 多图翻页证据

测试消息在**一条用户消息里粘贴 3 张图**（`sample-a/b/c.png`，900×600）。用户消息在 DSH 里每张图是独立的 slot 实例，因此这同时验证了"单图 slot 通过会话快照找兄弟图"的链路：

| 项 | 证据 |
|---|---|
| 图组识别 | 3 个 gallery、3 个缩略图、3 张图 |
| 打开第 1 张 | 页码「第 1 / 3 张」，缩略图条 3 项，当前项在第 0 位 |
| 工具栏下一页 | 「第 2 / 3 张」，缩略图当前项第 1 位 |
| 翻页复位缩放 | 放大到 120% 后翻页 → 回到适配 100% |
| 键盘 | `→` 到 3/3，再 `→` 不越界；`←` 回 2/3 |
| 点缩略图 | 点第 1 个缩略图回到「第 1 / 3 张」 |
| 从第 3 张打开 | 从第 3 个缩略图打开，页码直接是「第 3 / 3 张」（index 映射正确） |
| 会话快照收集器 | 伪造 assistant/tool/user 节点验证：assistant 2 张、tool 1 张、user 1 张、未知附件 0 |
| 回归 | v0.2 的缩放、拖动、双击、键盘、复制、下载、右键菜单、顶部安全区断言全部保持通过 |

## 截图

| 文件 | 状态 |
|---|---|
| `10-preview-fit.png` | 3 图消息打开第 1 张（100%） |
| `11-preview-zoom.png` | 滚轮放大 |
| `12-copy-toast.png` | 复制成功 toast |
| `13-preview-dark.png` | 深色主题 |
| `14-preview-narrow.png` | 760×800 窄窗口（缩略图条自动隐藏） |
| `15-thumbnail-menu.png` | 缩略图右键菜单 |
| `20-paging-next.png` | 翻到第 2 张：页码 + 缩略图当前项同步 |
| `21-paging-third.png` | 从第 3 张缩略图打开，页码 3/3 |

**隐私说明**：截图在验证时把背景遮罩加深并模糊（仅截图注入样式），避免带出侧栏会话/工作区信息；插件本身使用 DSH 的 `--dsw-alias-bg-mask-1` / `--dsw-mask-blur` token，与官方灯箱一致。

## 数据来源与降级

- 助手连续图片、工具结果图片：slot props 自带数组，直接组队。
- 用户消息多图：每个 slot 只有一张图，插件用 slot 标准属性 `useChat` 读取 `ChatSnapshot.legacy.nodes`，按 `attachmentId` 找到所属消息并收集该消息的 `ContentBlock` / assistant blocks，顺序与消息内容一致。
- 取不到时（例如未来快照结构变化）自动降级为单图预览，不阻塞打开。
- 范围：**同一条消息**。跨消息/整会话连续浏览不在此版本（README 已注明）。

## 验证边界（如实记录）

1. headless Chrome 没有 Windows 原生 caption 按钮；测试用 `html[data-windows-titlebar]` + 40px 变量复现桌面安全区，并断言预览按钮最小 `top=765`、图像舞台 `top=68`。
2. 本轮未重启用户的 `desktop` DSH 实例；桌面真实窗口与远程会话观感需在用户重启后复核。
3. 未建立真实远程主机会话：远程链路自 v0.1.0 起未改动（附件仍为本机附件、预览为纯浏览器渲染），本轮回归覆盖了插件与附件/blob 的全部代码路径；远程实测建议在桌面重启后用一条远程会话图复核。
4. 窄窗只覆盖 760px；520px 最小宽度未截图。
5. 助手连续图片 / 工具结果图片走 slot 数组路径，本机没有可安全构造的助手多图会话；该路径由会话快照收集器对 assistant/tool 节点的断言覆盖，用户消息多图为真实端到端用例。
5. 验证过程中创建的测试会话可在会话列表中删除。

## 复跑

```powershell
.\install.ps1 -Profile imagecheck
# 启动隔离 host（记录 URL 里的 token）
dsh --profile imagecheck --port 3099 --no-open
# 启动带 CDP 的 Chrome
chrome --headless=new --remote-debugging-port=9222 --user-data-dir=%TEMP%\dsh-chrome about:blank
# 三张图一起粘贴，驱动翻页/缩放/复制/下载并截图
node scripts/verify-preview.mjs "<url>" docs/verification/v0.3.0 <downloadDir> "docs/verification/v0.3.0/fixtures/sample-a.png,docs/verification/v0.3.0/fixtures/sample-b.png,docs/verification/v0.3.0/fixtures/sample-c.png" 9222
```

## 回滚

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Rollback -Profile imagecheck
```

