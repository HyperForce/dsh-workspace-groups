# dsh-workspace-groups

[English](#english) | [中文](#中文)

---

<a id="english"></a>

## English

Single-purpose workspace grouping for the DeepSeek Harness (DSH) web sidebar:
organize workspaces into collapsible groups. Takes over the sidebar seat that
dsh-better-workspace used.

### Features

- Collapsible, multi-level workspace groups in the sidebar tree.
- Row actions: new session, move to group, inline rename, delete (two-step),
  archive.
- View options (grouping / sort) ride the host's native menu; new-workspace
  rides the host's own directory flow.
- Fully compatible with dsh-workspace-lock.

> Data lives in `<home>/.dsh/workspace-groups.json` (inside the dsh-data
> volume).

Full history: [CHANGELOG.md](CHANGELOG.md).

### Install

Requires DSH >= 0.1.5-rc.1 (tested on 0.1.5-rc.2). To take over the sidebar,
remove dsh-better-workspace first:

```bash
dsh plugin --profile web remove dsh-better-workspace
dsh plugin --profile web add link:/path/to/this/repo
docker restart dsh-harness
```

### Compatibility

- The client requires only `react` and the host's own UI primitives
  (`@deepseek-ai/dsh-client-ui-primitives`); no build step.
- dsh-workspace-lock: fully compatible, no configuration needed.

### License

MIT

---

<a id="中文"></a>

## 中文

一个只做分组的 DSH 侧栏插件：把工作区归入可折叠的分组，接替
dsh-better-workspace 的侧栏工作区树。

### 功能说明

- 侧栏工作区树：可折叠、多层分组。
- 行操作：新会话、移到分组、内联重命名、两步删除、归档。
- 视图选项（分组/排序）走宿主原生菜单；新建工作区走宿主自己的目录流程。
- 与 dsh-workspace-lock 完全兼容。

> 数据存在 `<home>/.dsh/workspace-groups.json`（dsh-data 卷）。

完整历史见 [CHANGELOG.md](CHANGELOG.md)。

### 安装

要求 DSH >= 0.1.5-rc.1（在 0.1.5-rc.2 上开发测试）。要接管侧栏请先移除
dsh-better-workspace：

```bash
dsh plugin --profile web remove dsh-better-workspace
dsh plugin --profile web add link:/path/to/this/repo
docker restart dsh-harness
```

### 兼容性

- 客户端只 require `react` 与宿主自己的 UI 基础组件
  （`@deepseek-ai/dsh-client-ui-primitives`），无构建步骤。
- dsh-workspace-lock：完全兼容，无需任何配置。

### 许可证

MIT
