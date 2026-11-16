# v0.2.0 验收记录

- 包：`dsh-image-tools@0.2.0`
- 环境：隔离 profile `imagecheck`（`E:\ai-workspace\Deepseek Harness\.dsh`），独立 host `http://127.0.0.1:3099`，headless Chrome `1440×900 @2x`
- 结论：**通过**（验证边界见最后一节）

## 自动检查

| 项 | 结果 |
|---|---|
| `npm run check` | `manifest ok: dsh-image-tools@0.2.0` |
| `npm test` | 6 个测试全部通过 |
| 隔离 host + CDP 真实交互 `scripts/verify-preview.mjs` | 32 项断言全部通过（`report.json`） |

## 功能证据

| 项 | 证据 |
|---|---|
| 预览打开 | 1600×900 原图，适配比例 81%，图像区域 1303×733 |
| 顶部无控件 | 预览内所有 `button` 的最小 `top = 822`（视口 900），顶部 60px 安全区内没有任何按钮 |
| 标题栏安全区 | 模拟 `html[data-windows-titlebar]` + `--dsh-windows-titlebar-height: 40px` 后，`--dsh-frame-overlay-top = calc(40px + 20px)`，图像舞台 `top = 68px` |
| 滚轮缩放 | 指针位置锚定，81% → 98% |
| 拖动平移 | `matrix(...)` 位移随拖动变化；拖动中 `data-dragging="true"` |
| 双击复位 | 回到适配 81%，与打开时 transform 完全一致 |
| 键盘 | `+` 缩放（→102%）、`0` 回到适配、`Esc` 关闭 |
| 复制 | toast「已复制图片到剪贴板」，剪贴板读取到 `image/png` |
| 下载 | `sample-large.png` 10842 字节，SHA-256 与源文件一致（`3b1d18…cdd75`） |
| 深色 / 窄窗 | 760×800 下工具条在视口内、顶部 60px 内无控件 |
| 右键菜单 | 缩略图右键仍出现「复制图片 / 下载原图」 |

## 截图

| 文件 | 状态 |
|---|---|
| `10-preview-fit.png` | 适配预览 + 底部工具条（顶部无按钮） |
| `11-preview-zoom.png` | 滚轮放大后（指针锚定） |
| `12-copy-toast.png` | 复制成功 toast |
| `13-preview-dark.png` | 深色主题 |
| `14-preview-narrow.png` | 760×800 窄窗口 |
| `15-thumbnail-menu.png` | 缩略图右键菜单 |

**隐私说明**：仓库里的截图在验证时把背景遮罩加深并做 10px 模糊（仅截图注入样式），避免带出侧栏会话/工作区信息；插件本身仍使用 DSH 的 `--dsw-alias-bg-mask-1` / `--dsw-mask-blur` token，与官方灯箱一致。

## 与 v0.1.0 的差异

- 移除右上角关闭按钮（原位置与 Windows 原生窗口关闭按钮重叠），关闭改为工具条按钮 / `Esc` / 点遮罩。
- 工具条重排为：文件名与尺寸、缩放组、复制、下载、关闭；窄窗口自动隐藏文件名与文字标签。
- 新增缩放/平移/双击/键盘行为；关闭与翻页重置缩放（翻页在 v0.3.0）。

## 验证边界（如实记录）

1. headless Chrome 没有 Windows 原生 caption 按钮，测试通过 `html[data-windows-titlebar]` + 40px 变量复现桌面安全区；「不在顶部放控件」与「舞台 top ≥ 60px」为自动化断言。
2. 本轮未重启用户的 `desktop` DSH 实例；桌面真实窗口下的观感需在用户重启后复核。
3. 远程会话链路未在 v0.2.0 重跑：预览改动全部在浏览器半区，附件仍为本地 blob，与 v0.1.0 已验证的远程链路相同；远程用例计划随 v0.3.0 验收或桌面重启后复核。
4. 窄窗只覆盖 760px；520px 最小宽度未截图。
5. 验证过程中创建的测试会话可在会话列表中删除。

## 复跑

```powershell
# 1) 安装到隔离 profile
.\install.ps1 -Profile imagecheck

# 2) 启动隔离 host（记录 URL 里的 token）
dsh --profile imagecheck --port 3099 --no-open

# 3) 启动带 CDP 的 Chrome
chrome --headless=new --remote-debugging-port=9222 --user-data-dir=%TEMP%\dsh-chrome about:blank

# 4) 驱动真实预览并截图
node scripts/verify-preview.mjs "<url>" docs/verification/v0.2.0 <downloadDir> docs/verification/v0.2.0/fixtures/sample-large.png 9222
```

## 回滚

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Rollback -Profile imagecheck
```
