# v0.5.1 验收记录

- 包：`dsh-image-tools@0.5.1`
- 类型：**仅展示元数据与文案刷新，无功能/逻辑改动**
- 结论：通过

## 核心逻辑未变

- `git diff v0.5.0 -- client.js`：**空**（浏览器半区与 v0.5.0 完全一致）
- 只改：`package.json`（version/description/keywords）、`index.js`（BUILD）、`locale/zh.json`、`locale/en.json`、`README.md`、`CHANGELOG.md`
- 无新增/删除代码路径，不影响缩放、平移、翻页、复制、下载、Markdown 桥接行为

## 展示验证（隔离 profile imagecheck）

| 项 | 结果 |
|---|---|
| 插件列表标题 | 「图片预览工具」显示 |
| 插件列表描述 | 新描述显示（含“缩放/平移/跨轮次翻页/复制下载/Markdown”） |
| 旧标题 | 「图片复制与下载」不再出现 |
| 详情页 | 标题「图片预览工具」、版本 `v0.5.1`、新描述与 README 首段一致 |

## 其他检查

| 项 | 结果 |
|---|---|
| `npm run check` | `manifest ok: dsh-image-tools@0.5.1` |
| `npm test` | 6 个测试通过（含 BUILD/version 一致性） |
| desktop profile 安装 | `0.5.1`，Doctor 通过 |

## 说明

市场条目（`dsh-image-tools-3`）仍停留在 0.1.0 的旧描述，需要重新提交新版本后才会更新，不在本版自动生效。
