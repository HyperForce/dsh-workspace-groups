# dsh-workspace-groups

[English](#english) | [中文](#中文)

Single-purpose workspace grouping for the DeepSeek Harness (DSH) web sidebar:
organize workspaces into collapsible groups. Takes over the sidebar seat that
dsh-better-workspace used.

一个只做分组的 DSH 侧栏插件：把工作区归入可折叠的分组，接替
dsh-better-workspace 的侧栏工作区树。

<a id="english"></a>

## Why / 特点

- **Single purpose / 只做分组** — groups, assignment, collapse. No styling
  options, no drag-and-drop, no settings page.
- **Simple / 简洁** — hand-written, no build step; the client requires only
  `react` and the host's own UI primitives.
- **Native-first / 最大程度兼容原生** — renders through the host's official
  `sidebar.workspaces` slot (the same seat dsh-better-workspace used), draws
  the host's own icons and `--dsw-*` theme colors, and keeps all editing in
  lightweight in-plugin UI. Zero native prompt/confirm dialogs.

<a id="中文"></a>

## 功能说明（中文）

- **分组树**：单层分组，可折叠；组头 = 打开文件夹图标，工作区行 = 关闭文件夹
  图标（均为宿主原生图标集）；未分组桶在第一个分组出现时自动出现。
- **工作区行**：点击展开/收起会话列表；悬浮操作 = 新会话 · 移到分组（弹层
  选择/新建）· 内联重命名 · 两步确认删除。
- **会话行**：点击打开会话；内联重命名 · 归档；运行状态点 + 相对时间。
- **搜索**：按会话标题实时过滤。
- **收起自隐藏**：侧栏收起成图标栏时整棵树隐藏，不留残影。
- **与 dsh-workspace-lock 完全兼容**：加锁菜单、徽标、会话隐藏原样工作。

> 数据存在 `<home>/.dsh/workspace-groups.json`（dsh-data 卷），卸载或重启不丢失。

## Install / 安装

Requires DSH >= 0.1.5-rc.1 (tested on 0.1.5-rc.2). To take over the sidebar,
remove dsh-better-workspace first / 要接管侧栏请先移除 dsh-better-workspace：

```bash
dsh plugin --profile web remove dsh-better-workspace
dsh plugin --profile web add link:/path/to/this/repo
docker restart dsh-harness
```

## Compatibility / 兼容性

- DSH 0.1.5-rc.2 上开发测试，目标 >= 0.1.5-rc.1。客户端只 require 原生种子模块
  （`react`、`@deepseek-ai/dsh-client-ui-primitives`），不依赖闭源的
  `@deepseek-ai/dsh-client-runtime`，无构建步骤。
- dsh-workspace-lock：完全兼容，无需任何配置。

## License

MIT
