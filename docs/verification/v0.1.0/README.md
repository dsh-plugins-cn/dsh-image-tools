# v0.1.0 验收记录

- 包：`dsh-image-tools@0.1.0`
- 环境：隔离 profile `imagecheck`，独立 host `http://127.0.0.1:3099`，Chrome headless 1440×900 @2x
- 结论：**通过**（验证边界见最后一节）

## 自动检查

| 项 | 结果 |
|---|---|
| `npm run check` | `manifest ok: dsh-image-tools@0.1.0` |
| `npm test` | 6 个测试全部通过 |
| `install.ps1 -Doctor -Profile imagecheck` | bundle registered `True`、installed `0.1.0`、host build `0.1.0` |
| 页面槽位注册探针 `__DSH_IMAGE_TOOLS__` | 四个图片槽位 + `shell.overlay` 全部 `true` |
| 卸载恢复（重启 host 后） | `.dit-gallery` = 0、官方画廊仍在、全局探针消失 |

## 截图

| 文件 | 状态 |
|---|---|
| `10-chat.png` | 用户消息单图，240×150（原图 640×400，按官方 singleFit 规则缩放） |
| `11-hover.png` | 悬停浮出复制/下载两个圆钮 |
| `12-menu.png` | 右键菜单：文件名、640 × 400 · 22 KB、两个动作、说明行 |
| `13-preview.png` | 全屏预览 + 底部工具条 |
| `14-copy-toast.png` | 复制成功的 toast |
| `15-download.png` | 下载开始的 toast |
| `20-dark-preview.png` | 深色主题预览 |
| `21-dark-menu.png` | 深色主题菜单（背景 rgb(44,44,46)） |
| `30-trajectory.png` | 轨迹视图；该会话的图片行以文本汇总呈现，未出现缩略图 |
| `31-plugin-list.png` | 插件列表中的「图片复制与下载」条目 |

## 功能证据

- **复制**：点击复制后，页面内 `navigator.clipboard.read()` 返回 `["image/png"]`。
- **下载**：得到 `deploy-sample.png`，22,806 字节，SHA-256 `bbe23fe9…94d262`，与源文件完全一致（原始字节、无转码）。
- **深色**：`prefers-color-scheme: dark` 下菜单与工具条自动切换，无需额外配置。
- **主题**：所有颜色来自 `--dsw-*` token 或 `currentColor`；无写死主题色。

## 验证边界（如实记录）

1. 测试会话在隔离 profile 中创建，该 profile 没有有效 API Key，模型调用返回「API 密钥无效」。这只影响模型回复，**不影响图片渲染与插件的复制/下载**；截图中的错误条与插件无关。
2. `tool.call.images` 与 `conversation.trajectory.images` 的**注册已确认**（探针为 true），但本机没有"既包含工具图片、又可以安全只读打开"的旧会话样本；这两个槽位与已验证的两个槽位共用同一组件，建议装到 `desktop` 后由真实会话复核。
3. 未捕获 1200px 窄窗口、图片加载失败重试、超大图跳过复制这三种状态。
4. 验证期间创建的测试会话可在会话列表里删除；截图中的工作区与会话信息已脱敏。


## desktop 安装（2026-11-05）

- 已将 `0.1.0` 装入 `desktop` profile 的 `node_modules` 与 `package.json`，**没有重启**正在运行的 DSH（端口 54026 保持在线）。
- 运行中的实例不会热加载新 bundle；下次重启 DSH 后生效。
- 安装前备份：`<profile>\package.json.bak-before-image-tools`。
- 回滚：`install.ps1 -Rollback -Profile desktop`。
## 脱敏

共享截图里的侧栏（工作区、会话标题、账号入口）已做高斯模糊，只保留插件相关界面。

## 回滚

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Rollback -Profile imagecheck
```