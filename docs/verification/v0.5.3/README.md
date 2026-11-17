# v0.5.3 验收记录

- 包：`dsh-image-tools@0.5.3`
- 类型：**工具栏布局修复**（翻页时按钮横向漂移）
- 结论：通过（隔离 profile 实测 + v0.3/v0.4 回归；本地 desktop 已更新，待发布）

## 改动

- `.dit-tb-page` 固定 `width:76px`（兼容三位数页码）
- `.dit-tb-file` 固定 `width:226px`，超长文件名省略，`title` 保留全名
- `.dit-tb-pct` 固定 `width:56px`
- 其余按钮本来就固定宽，整条工具栏内容总宽恒定
- 设计对比：`docs/design/preview-toolbar/`（现状 / 方案 A / 方案 B）

核心翻页、缩放、平移、复制、下载逻辑未改。

## 测试

隔离 profile `imagecheck` + headless Chrome，用 16 张文件名长度差异很大的真实会话图验证：

| 断言 | 结果 |
|---|---|
| 16 页翻页过程中工具栏宽度 | 恒为 950.6px |
| 工具栏 left | 恒为 244.7px |
| 文件名块宽度 | 恒为 250px（CSS 226 + padding），无跳动 |
| 页码槽宽度 | 恒为 76px |
| 缩放百分比槽宽度 | 恒为 56px |
| 缩放按钮组起点 | 恒为 683.7px，按钮不横移 |
| 长文件名 | 3 个超长名称正确省略，tooltip 保留全名 |
| v0.3/v0.4 回归（3 图新会话） | 全部断言通过 |
| `npm run check` / `npm test` | 通过 |

## 截图

修复后的实际会话截图未入库（含会话内容）；设计对比图在
`docs/design/preview-toolbar/`。

## 状态

本地 desktop 已更新到 0.5.3；GitHub 以 tag `v0.5.3` 发布，市场提交记录见 dsh.so submission issue。

