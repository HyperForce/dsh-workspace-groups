# dsh-workspace-groups

[English](#english) | [中文](#中文)

---

<a id="english"></a>

## English

Single-purpose workspace grouping for the DeepSeek Harness (DSH) web sidebar:
organize workspaces into collapsible groups. Takes over the sidebar seat that
dsh-better-workspace used.

### Features

- **Group tree** — multi-level nesting (v0.3.0), collapsible; a hover button on
  group heads creates subgroups; the move-to-group popover renders all groups
  as an indented tree; deleting a middle-level group promotes its children and
  their workspaces fall back to ungrouped. Workspace rows draw the host's own
  closed-folder icon (IconFolderClose16), group heads a layers/stack icon; the
  ungrouped bucket appears automatically with the first group.
- **Workspace rows** — click to expand/collapse the session list; hover
  actions: new session · move to group (popover select/create) · inline rename
  · two-step confirm delete.
- **Session rows** — click to open; inline rename · archive; running status
  dot + relative time.
- **View options (native menu)** — grouping mode (by group / flat list) and
  sort order (default / recently updated), reusing the host's own Menu
  component and icons; the choice persists in the browser.
- **New workspace** — the header "+" button starts the host's own
  add-workspace flow (native dialog: breadcrumbs, new folder, hidden files,
  composed by host capability).
- **Search** — live filter by session title.
- **Collapse self-hide** — when the sidebar collapses to the icon rail, the
  whole tree hides with it.
- **Fully compatible with dsh-workspace-lock** — lock menu, badge and session
  hiding work unchanged on this tree.

> Data lives in `<home>/.dsh/workspace-groups.json` (inside the dsh-data
> volume); it survives restarts and reinstalls.

### Install

Requires DSH >= 0.1.5-rc.1 (tested on 0.1.5-rc.2). To take over the sidebar,
remove dsh-better-workspace first:

```bash
dsh plugin --profile web remove dsh-better-workspace
dsh plugin --profile web add link:/path/to/this/repo
docker restart dsh-harness
```

### Compatibility

- Developed and tested on DSH 0.1.5-rc.2; targets >= 0.1.5-rc.1. The client
  requires only `react` and the host's own UI primitives
  (`@deepseek-ai/dsh-client-ui-primitives`), never imports the closed-source
  `@deepseek-ai/dsh-client-runtime`, and has no build step.
- dsh-workspace-lock: fully compatible, no configuration needed.

### License

MIT

---

<a id="中文"></a>

## 中文

一个只做分组的 DSH 侧栏插件：把工作区归入可折叠的分组，接替
dsh-better-workspace 的侧栏工作区树。

### 功能说明

- **分组树**：**多层嵌套分组**（v0.3.0），可折叠；组头悬浮"新建子分组"按钮，
  移动弹层按树形缩进展示全部分组；删除中间层组时子组自动上提、其工作区回落
  未分组；工作区行 = 宿主原生关闭文件夹图标（IconFolderClose16），组头 =
  层叠/集合图标；未分组桶在第一个分组出现时自动出现。
- **工作区行**：点击展开/收起会话列表；悬浮操作 = 新会话 · 移到分组（弹层
  选择/新建）· 内联重命名 · 两步确认删除。
- **会话行**：点击打开会话；内联重命名 · 归档；运行状态点 + 相对时间。
- **视图选项（原生菜单）**：分组方式（按分组 / 单列表）+ 排序方式（默认顺序
  / 最近更新），复用宿主自己的 Menu 组件与图标，选择持久化在浏览器本地。
- **新建工作区**：头部 ＋ 按钮，直接启动**宿主自己的添加工作区流程**（原生
  对话框：面包屑、新建文件夹、显示隐藏文件，按宿主能力自动组合原生选择器/
  应用内浏览）。
- **搜索**：按会话标题实时过滤。
- **收起自隐藏**：侧栏收起成图标栏时整棵树隐藏，不留残影。
- **与 dsh-workspace-lock 完全兼容**：加锁菜单、徽标、会话隐藏原样工作。

> 数据存在 `<home>/.dsh/workspace-groups.json`（dsh-data 卷），卸载或重启
> 不丢失。

### 安装

要求 DSH >= 0.1.5-rc.1（在 0.1.5-rc.2 上开发测试）。要接管侧栏请先移除
dsh-better-workspace：

```bash
dsh plugin --profile web remove dsh-better-workspace
dsh plugin --profile web add link:/path/to/this/repo
docker restart dsh-harness
```

### 兼容性

- 在 DSH 0.1.5-rc.2 上开发测试，目标 >= 0.1.5-rc.1。客户端只 require
  `react` 与宿主自己的 UI 基础组件
  （`@deepseek-ai/dsh-client-ui-primitives`），不依赖闭源的
  `@deepseek-ai/dsh-client-runtime`，无构建步骤。
- dsh-workspace-lock：完全兼容，无需任何配置。

### 许可证

MIT
