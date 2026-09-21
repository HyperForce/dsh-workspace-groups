/**
 * dsh-workspace-groups browser half (v0.2.0, sidebar tree). Hand-written loader
 * module (no build step): the same `window.__ModuleLoader__.load({id,
 * factory})` shape the core bundler emits for plugins.
 *
 * v0.2.0 replaces better-workspace as the sidebar workspace browser: it
 * registers into the host's `sidebar.workspaces` slot at priority -1
 * (ascending priority, lowest renders — the same seat dsh-better-workspace
 * used), rendering the workspaces grouped. Group data persists host-side
 * (/api/workspace-groups/state, see lib/index.js); collapse state is per-browser
 * localStorage. `react` is the ONLY require — the component renders inside
 * the app's own React tree via the slot, so react-dom/client is not needed.
 *
 * ⚠ dsh-workspace-lock compatibility contract (do not break): workspace-lock recognizes
 * WORKSPACE rows as `.bw-row` elements carrying `.bw-row-count` or
 * `.bw-row-actions`, reads the title from `.bw-row-label`, and scopes a
 * workspace's session rows by document order (rows following the workspace
 * row until the next workspace row). Therefore:
 *   - every workspace AND session row carries the `bw-row` class;
 *   - workspace rows contain .bw-row-label + .bw-row-count + .bw-row-actions;
 *   - session rows contain only .bw-row-label / .bw-row-time — their hover
 *     actions use the plugin-only class `workspace-groups-session-actions`;
 *   - session rows render immediately after their workspace row;
 *   - group headers use `workspace-groups-group-head` (no bw-row) so the decorator
 *     ignores them.
 *
 * All host-service access is lazy (resolved at call time): rc.2 has been
 * observed to run apply() before every service is registered. Everything
 * schedules with setTimeout(0) — requestAnimationFrame never fires in this
 * embedded renderer even though document.visibilityState reports visible.
 * Rendering happens inside the host React tree, so no MutationObserver
 * self-healing is needed. Failure policy: problems are logged, never
 * thrown — an external plugin must not take the GUI down.
 */
window.__ModuleLoader__.load({
  id: 'dsh-workspace-groups',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const react = require('react')
    // Children are passed varargs-style (createElement signature), NOT as
    // jsx-runtime props.children — do not swap this for react/jsx-runtime.
    const h = react.createElement

    const API = '/api/workspace-groups/state'
    const STYLE_ID = 'workspace-groups-style'
    const LS_GROUPS = 'workspace-groups.groupsCollapsed'      // {groupId: true} = folded
    const LS_WORKSPACES = 'workspace-groups.workspacesCollapsed' // {workspaceId: true} = folded (default open)
    const LS_VIEW = 'workspace-groups.view' // {mode: 'grouped'|'flat', orderBy: 'default'|'updated'}
    const UNGROUPED_KEY = '__ungrouped'
    const MAX_GROUPS = 200

    // ---------------------------------------------------------------- texts

    const TEXT = {
      zh: {
        search: '搜索会话',
        viewOptionsLabel: '视图选项',
        groupByLabel: '分组方式',
        groupByGrouped: '按分组',
        groupByFlat: '单列表',
        orderByLabel: '排序方式',
        orderByDefault: '默认顺序',
        orderByUpdated: '最近更新',
        newGroup: '新建分组',
        newSubGroup: '新建子分组',
        subgroupHint: '子分组归属：',
        addWorkspace: '新建工作区',
        ungrouped: '未分组',
        moveTo: '移到分组',
        ungroup: '移出分组',
        renameGroup: '重命名分组',
        deleteGroup: '删除分组（工作区变为未分组）',
        renameWorkspace: '重命名工作区',
        deleteWorkspace: '删除工作区',
        renameSession: '重命名会话',
        archiveSession: '归档会话',
        newSession: '新建会话',
        renameGroupPrompt: '输入新的分组名称',
        newGroupPrompt: '输入分组名称',
        loadFailed: '分组加载失败',
        saveFailed: '分组保存失败',
        addWorkspaceFailed: '新建工作区失败',
        noResults: '无匹配会话',
        noWorkspaces: '暂无工作区',
        loading: '加载中…',
        cancel: '取消',
        create: '创建',
        confirmDelete: '确认删除',
        useHeroPicker: '此环境不支持系统目录选择框，请通过对话区的新建工作区入口创建',
      },
      en: {
        search: 'Search sessions',
        viewOptionsLabel: 'View options',
        groupByLabel: 'Grouping',
        groupByGrouped: 'By groups',
        groupByFlat: 'Flat list',
        orderByLabel: 'Sorting',
        orderByDefault: 'Default order',
        orderByUpdated: 'Recently updated',
        newGroup: 'New group',
        newSubGroup: 'New sub-group',
        subgroupHint: 'Will be created under: ',
        addWorkspace: 'New workspace',
        ungrouped: 'Ungrouped',
        moveTo: 'Move to group',
        ungroup: 'Remove from group',
        renameGroup: 'Rename group',
        deleteGroup: 'Delete group (members become ungrouped)',
        renameWorkspace: 'Rename workspace',
        deleteWorkspace: 'Delete workspace',
        renameSession: 'Rename session',
        archiveSession: 'Archive session',
        newSession: 'New session',
        renameGroupPrompt: 'Enter the new group name',
        newGroupPrompt: 'Enter a group name',
        loadFailed: 'Failed to load groups',
        saveFailed: 'Failed to save groups',
        addWorkspaceFailed: 'Failed to create workspace',
        noResults: 'No matching sessions',
        noWorkspaces: 'No workspaces yet',
        loading: 'Loading…',
        cancel: 'Cancel',
        create: 'Create',
        confirmDelete: 'Confirm delete',
        useHeroPicker: 'No native directory chooser here — create workspaces from the picker in the conversation area',
      },
    }
    const ZH = String((typeof navigator !== 'undefined' && navigator.language) || 'en').toLowerCase().startsWith('zh')
    const T = (k) => (TEXT[ZH ? 'zh' : 'en'][k] ?? k)

    // ---------------------------------------------------------------- icons
    // Native-first (user request: 尽量用原生的,保证兼容性和简洁性): every glyph
    // comes from the host's own primitives package (a frozen seed module — the
    // same source dsh-better-workspace consumed, verified present on rc.2 and
    // 0.1.6-alpha.1 alike). Only the move-to-group arrow has no native
    // equivalent and stays hand-drawn (16×16, currentColor, Outline16 weight).
    const ui = require('@deepseek-ai/dsh-client-ui-primitives')
    const iconOf = (name, size) => {
      const C = ui[name]
      return C ? h(C, { size: size || 16 }) : null
    }
    // Group glyph (user request: workspace keeps the native folder icon,
    // group = a clearly different layers/stack — no native equivalent exists).
    const SVG_LAYERS = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.8 14 4.6 8 7.4 2 4.6Z"/><path d="M2.6 8.2 8 10.8l5.4-2.6M2.6 11.6l5.4 2.6 5.4-2.6"/></svg>'
    const SVG_MOVE = '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M2.5 8h8M7.5 5l3 3-3 3"/><path d="M13.5 3.5v9"/></svg>'

    // ---------------------------------------------------------------- styles
    // The tree lives inside the host app, so theme tokens are the host's own
    // --dsw-* custom properties (with fallbacks — the same trick better-workspace
    // used); they follow the app's light/dark switch automatically. The ONLY
    // exception is the floating popover, which gets an explicit dark override
    // at the very END of this stylesheet so it wins the cascade.

    const CSS = `
      .workspace-groups-root{height:100%;display:flex;flex-direction:column;min-height:0;position:relative;color:var(--dsw-alias-label-primary,#e6e6e6)}
      .workspace-groups-header{flex:none;display:flex;align-items:center;gap:4px;padding:8px 10px 4px}
      .workspace-groups-input{flex:1;min-width:0;height:26px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1));border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));border-radius:6px;color:inherit;padding:0 8px;font-size:12px;outline:none;font-family:inherit}
      .workspace-groups-input:focus{border-color:var(--dsw-alias-brand-primary,#5b8def)}
      .workspace-groups-input::placeholder{color:var(--dsw-alias-label-quaternary,#8a8a8a)}
      .workspace-groups-error{flex:none;padding:2px 10px 4px;font-size:12px;color:#e5534b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .workspace-groups-tree{flex:1;overflow-y:auto;overflow-x:hidden;padding:2px 6px 12px;min-height:0}
      .workspace-groups-icon-btn{flex:none;width:24px;height:24px;border:none;background:transparent;border-radius:6px;display:grid;place-items:center;color:var(--dsw-alias-label-secondary,#b8b8b8);cursor:pointer;padding:0}
      .workspace-groups-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.15));color:var(--dsw-alias-label-primary,#e6e6e6)}
      .workspace-groups-icon-btn:disabled{opacity:.4;cursor:default}
      .workspace-groups-icon-btn:disabled:hover{background:transparent}
      .workspace-groups-row-icon{flex:none;display:grid;place-items:center;color:var(--dsw-alias-label-tertiary,#9a9a9a)}
      /* group header — deliberately NOT a .bw-row (invisible to workspace-lock) */
      .workspace-groups-group-head{display:flex;align-items:center;gap:6px;min-height:30px;margin-top:8px;padding:0 6px;border-radius:6px;cursor:pointer;user-select:none;font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-secondary,#b8b8b8);position:relative}
      .workspace-groups-group-head:hover{background:var(--dsw-specific-sidebar-nav-item-hover,var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12)))}
      .workspace-groups-group-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .workspace-groups-group-count{flex:none;font-size:11px;font-weight:400;color:var(--dsw-alias-label-quaternary,#8a8a8a)}
      .workspace-groups-group-actions{flex:none;display:none;align-items:center;gap:2px}
      .workspace-groups-group-head:hover .workspace-groups-group-actions{display:flex}
      .workspace-groups-group-head:hover .workspace-groups-group-count{display:none}
      /* rows — the bw dialect dsh-workspace-lock scans for (see module docblock) */
      .bw-row{display:flex;align-items:center;gap:6px;min-height:28px;padding-right:6px;border-radius:6px;cursor:pointer;user-select:none;font-size:13px;color:var(--dsw-alias-label-primary,#e6e6e6);position:relative}
      .bw-row:hover{background:var(--dsw-specific-sidebar-nav-item-hover,var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12)))}
      .bw-row-current{background:var(--dsw-specific-sidebar-nav-item-active,rgba(91,141,239,.15))}
      .workspace-groups-chevron{flex:none;display:grid;place-items:center;color:var(--dsw-alias-label-tertiary,#9a9a9a);transition:transform .15s ease}
      .workspace-groups-chevron-open{transform:rotate(90deg)}
      .bw-row-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px;margin:-3px}
      .bw-row-count{flex:none;font-size:11px;color:var(--dsw-alias-label-quaternary,#8a8a8a)}
      .bw-row-time{flex:none;font-size:11px;color:var(--dsw-alias-label-quaternary,#8a8a8a)}
      .bw-row-actions{flex:none;display:none;align-items:center;gap:2px}
      .bw-row:hover .bw-row-actions{display:flex}
      .bw-row:hover .bw-row-time,.bw-row:hover .bw-row-count{display:none}
      .workspace-groups-session-row{font-size:12.5px;color:var(--dsw-alias-label-secondary,#b8b8b8);min-height:26px}
      .workspace-groups-session-row:hover{color:var(--dsw-alias-label-primary,#e6e6e6)}
      /* session hover ops: plugin-only class — a session row must never gain
         .bw-row-count/.bw-row-actions (workspace-lock workspace-row markers) */
      .workspace-groups-session-actions{flex:none;display:none;align-items:center;gap:2px}
      .bw-row:hover .workspace-groups-session-actions{display:flex}
      .workspace-groups-dot{flex:none;width:7px;height:7px;border-radius:50%;background:transparent}
      .workspace-groups-dot-running{background:#5b8def}
      .workspace-groups-dot-done{background:#3fb950}
      .workspace-groups-empty{padding:24px 12px;text-align:center;font-size:12px;color:var(--dsw-alias-label-dimmed,#7a7a7a)}
      /* outer wrapper: container queries let the tree detect the collapsed
         sidebar rail (~35px wide) and hide itself instead of leaking stray
         chevrons into the strip */
      .workspace-groups-outer{height:100%;min-height:0;container-type:inline-size}
      @container (max-width: 119px){
        .workspace-groups-root{display:none}
      }
      .workspace-groups-inline-input{flex:1;min-width:0;height:22px;background:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.1));border:1px solid var(--dsw-alias-brand-primary,#5b8def);border-radius:5px;color:inherit;font:inherit;font-size:inherit;padding:0 6px;outline:none}
      .workspace-groups-inline-input::placeholder{color:var(--dsw-alias-label-quaternary,#8a8a8a)}
      .workspace-groups-btn{border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.25));background:transparent;color:inherit;border-radius:6px;padding:3px 10px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
      .workspace-groups-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.15))}
      .workspace-groups-btnPrimary{background:var(--dsw-alias-brand-primary,#5b8def);border-color:transparent;color:#fff}
      .workspace-groups-btnPrimary:hover{opacity:.9}
      .workspace-groups-del-danger{flex:none;border:0;background:transparent;color:#e5534b;font:inherit;font-size:12px;cursor:pointer;padding:2px 6px;border-radius:6px;white-space:nowrap}
      .workspace-groups-del-danger:hover{background:rgba(229,83,75,.15)}
      /* move-to-group / create-group popover */
      .workspace-groups-popover-back{position:fixed;inset:0;z-index:1200}
      .workspace-groups-popover{position:fixed;z-index:1201;min-width:176px;max-width:250px;background:#ffffff;color:#1f2328;border:1px solid rgba(0,0,0,.12);border-radius:10px;padding:4px;box-shadow:0 8px 30px rgba(20,30,50,.18);font-size:13px}
      .workspace-groups-pop-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:0;background:transparent;color:inherit;border-radius:7px;padding:7px 10px;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
      .workspace-groups-pop-item:hover{background:rgba(127,127,127,.15)}
      .workspace-groups-pop-check{flex:none;width:14px;display:inline-flex}
      .workspace-groups-pop-sep{height:1px;margin:3px 6px;background:rgba(127,127,127,.3)}
      .workspace-groups-pop-hint{padding:6px 8px 0;font-size:11.5px;color:var(--dsw-alias-label-quaternary,#8a8a8a);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .workspace-groups-pop-inputrow{display:flex;align-items:center;gap:6px;padding:6px}
      .workspace-groups-pop-btnrow{display:flex;justify-content:flex-end;gap:6px;padding:0 6px 6px}
      @media (prefers-color-scheme: dark){
        .workspace-groups-popover{background:#22262d;color:#e6e8eb;border-color:#3c424c;box-shadow:0 8px 30px rgba(0,0,0,.5)}
      }
    `

    function ensureStyles() {
      if (document.getElementById(STYLE_ID) !== null) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    function removeStyles() {
      const style = document.getElementById(STYLE_ID)
      if (style !== null) style.remove()
    }

    // ------------------------------------------------------------- helpers

    function loadMap(key) {
      try {
        const raw = window.localStorage.getItem(key)
        if (raw === null) return {}
        const parsed = JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
      } catch {
        return {}
      }
    }

    function saveMap(key, map) {
      try { window.localStorage.setItem(key, JSON.stringify(map)) } catch { /* storage unavailable: collapse state just won't persist */ }
    }

    /**
     * Official visibility rule (dsh tree.ts sessionVisible, as used by
     * better-workspace): subagent children live in their parent's catalog,
     * archived sessions are visible nowhere, and a blank row is the
     * provisional New Session of the current selection.
     */
    function sessionVisible(summary, current, archivedSet) {
      return !!summary
        && summary.origin !== 'subagent'
        && !(archivedSet && archivedSet.has(summary.id))
        && (!summary.blank || summary.id === current)
    }

    function titleOf(summary) {
      if (!summary) return ''
      if (summary.title) return String(summary.title)
      return String(summary.displayTitle || '')
    }

    function normalizeTime(ts) {
      if (typeof ts !== 'number' || !(ts > 0)) return 0
      return ts < 1e12 ? ts * 1000 : ts
    }

    function timeLabel(updatedAt) {
      const ms = normalizeTime(updatedAt)
      if (ms === 0) return ''
      const seconds = Math.max(0, (Date.now() - ms) / 1000)
      if (seconds < 60) return ZH ? '刚刚' : 'now'
      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) return minutes + 'm'
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return hours + 'h'
      const days = Math.floor(hours / 24)
      if (days < 30) return days + 'd'
      const d = new Date(ms)
      return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    /**
     * The refusal a host serving the OTHER picker capability throws
     * (uiWorkspace.pickDirectory/listDirectory wrap the RPC failure in a
     * plain Error, so only the sentence survives). Same probe trick
     * better-workspace used: `listDirectory(undefined)` resolves exactly on
     * a browse host and is refused on a native-chooser host — one silent
     * call answers both worlds without opening a chooser.
     */
    function isPickerRefusal(error) {
      if (error && typeof error === 'object' && error.rpcError && error.rpcError.code === 'directory-picker/unavailable') return true
      const message = String((error && error.message) || error || '')
      return message.indexOf('needs the native capability') !== -1 || message.indexOf('directory-picker/unavailable') !== -1
    }

    // ----------------------------------------------------------- components

    class Boundary extends react.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }
      static getDerivedStateFromError() {
        return { failed: true }
      }
      componentDidCatch(error) {
        console.error('[workspace-groups] render error:', error)
      }
      render() {
        return this.state.failed ? null : this.props.children
      }
    }

    function Chevron(props) {
      return h('span', {
        className: 'workspace-groups-chevron' + (props.open ? ' workspace-groups-chevron-open' : ''),
      }, iconOf('IconTriangleRightFill14', 14))
    }

    /**
     * In-place rename input (Enter/blur commits, Escape cancels) — replaces
     * every former window.prompt use with the plugin's own UI.
     */
    function InlineInput(props) {
      const { initial, placeholder, onCommit, onCancel } = props
      const [value, setValue] = react.useState(String(initial || ''))
      const ref = react.useRef(null)
      react.useEffect(() => {
        const el = ref.current
        if (el !== null && typeof el.focus === 'function') {
          el.focus()
          try { el.select() } catch { /* stub DOM */ }
        }
      }, [])
      const commit = () => {
        const trimmed = value.trim()
        if (trimmed === '') onCancel()
        else onCommit(trimmed)
      }
      return h('input', {
        ref,
        className: 'bw-row-label workspace-groups-inline-input',
        type: 'text',
        value,
        placeholder: placeholder || '',
        onChange: (e) => setValue(e.target.value),
        onClick: (e) => e.stopPropagation(),
        onKeyDown: (e) => {
          e.stopPropagation()
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') onCancel()
        },
        onBlur: commit,
      })
    }

    function GroupHead(props) {
      const { group, count, open, depth, editing, onToggle, onStartAddChild, onStartRename, onCommitRename, onCancelRename, onDelete } = props
      return h('div', { className: 'workspace-groups-group-head', style: { paddingLeft: depth }, onClick: onToggle, role: 'treeitem', 'aria-expanded': open },
        h(Chevron, { open }),
        h('span', { className: 'workspace-groups-row-icon', dangerouslySetInnerHTML: { __html: SVG_LAYERS } }),
        editing
          ? h(InlineInput, { initial: group.name, onCommit: onCommitRename, onCancel: onCancelRename })
          : h('span', { className: 'workspace-groups-group-name', title: group.name }, group.name),
        count > 0 && !editing ? h('span', { className: 'workspace-groups-group-count' }, String(count)) : null,
        !editing ? h('span', { className: 'workspace-groups-group-actions', onClick: (e) => e.stopPropagation() },
          h('button', { type: 'button', className: 'workspace-groups-icon-btn', title: T('newSubGroup'), onClick: onStartAddChild }, iconOf('IconPlusOutline16', 13)),
          h('button', { type: 'button', className: 'workspace-groups-icon-btn', title: T('renameGroup'), onClick: onStartRename }, iconOf('IconEditOutline16', 13)),
          h('button', { type: 'button', className: 'workspace-groups-icon-btn', title: T('deleteGroup'), onClick: onDelete }, iconOf('IconTrashOutline16', 13)),
        ) : null,
      )
    }

    function WorkspaceEntry(props) {
      const { workspace, count, open, currentInside, depth, editing, confirmingDelete, onToggle, onNewSession, onMove, onStartRename, onCommitRename, onCancelRename, onStartDelete, onConfirmDelete, onCancelDelete } = props
      return h('div', {
        className: 'bw-row workspace-groups-workspace-row' + (currentInside ? ' bw-row-current' : ''),
        role: 'treeitem',
        'aria-expanded': open,
        style: { paddingLeft: depth },
        onClick: onToggle,
      },
        h(Chevron, { open }),
        h('span', { className: 'workspace-groups-row-icon' }, iconOf('IconFolderClose16', 14)),
        editing
          ? h(InlineInput, { initial: workspace.title || workspace.workspaceId, onCommit: onCommitRename, onCancel: onCancelRename })
          : h('span', {
              className: 'bw-row-label',
              title: typeof workspace.path === 'string' && workspace.path !== '' && workspace.path !== workspace.title ? workspace.path : (workspace.title || workspace.workspaceId),
            }, workspace.title || workspace.workspaceId),
        count > 0 && !editing ? h('span', { className: 'bw-row-count' }, String(count)) : null,
        h('span', { className: 'bw-row-actions', onClick: (e) => e.stopPropagation() },
          confirmingDelete ? [
            h('button', { key: 'confirm', type: 'button', className: 'workspace-groups-del-danger', title: T('deleteWorkspace'), onClick: onConfirmDelete }, T('confirmDelete')),
            h('button', { key: 'cancel', type: 'button', className: 'workspace-groups-btn', onClick: onCancelDelete }, T('cancel')),
          ] : [
            h('button', { key: 'new', type: 'button', className: 'workspace-groups-icon-btn', title: T('newSession'), onClick: onNewSession }, iconOf('IconPlusOutline16', 14)),
            h('button', { key: 'move', type: 'button', className: 'workspace-groups-icon-btn', title: T('moveTo'), onClick: onMove, dangerouslySetInnerHTML: { __html: SVG_MOVE } }),
            h('button', { key: 'rename', type: 'button', className: 'workspace-groups-icon-btn', title: T('renameWorkspace'), onClick: onStartRename }, iconOf('IconEditOutline16', 13)),
            h('button', { key: 'delete', type: 'button', className: 'workspace-groups-icon-btn', title: T('deleteWorkspace'), onClick: onStartDelete }, iconOf('IconTrashOutline16', 13)),
          ],
        ),
        // Session rows are rendered by the caller right after this row: the
        // workspace-lock decorator scopes a workspace's sessions by document order.
      )
    }

    function SessionRow(props) {
      const { session, current, extraTitle, depth, editing, onOpen, onStartRename, onCommitRename, onCancelRename, onArchive } = props
      const state = session.running ? 'running' : (session.completed ? 'done' : '')
      return h('div', {
        className: 'bw-row workspace-groups-session-row' + (current ? ' bw-row-current' : ''),
        role: 'treeitem',
        style: { paddingLeft: depth },
        title: extraTitle ? `${extraTitle} · ${session.title}` : session.title,
        onClick: () => onOpen(session.id),
      },
        h('span', { className: 'workspace-groups-dot' + (state !== '' ? ' workspace-groups-dot-' + state : '') }),
        editing
          ? h(InlineInput, { initial: session.title || session.id, onCommit: onCommitRename, onCancel: onCancelRename })
          : h('span', { className: 'bw-row-label' }, session.title || session.id),
        session.updatedAt > 0 && !editing ? h('span', { className: 'bw-row-time' }, timeLabel(session.updatedAt)) : null,
        // ⚠ workspace-lock contract: NO .bw-row-count/.bw-row-actions inside session
        // rows — they are how a WORKSPACE row is recognized.
        !editing ? h('span', { className: 'workspace-groups-session-actions', onClick: (e) => e.stopPropagation() },
          h('button', { type: 'button', className: 'workspace-groups-icon-btn', title: T('renameSession'), onClick: onStartRename }, iconOf('IconEditOutline16', 13)),
          h('button', { type: 'button', className: 'workspace-groups-icon-btn', title: T('archiveSession'), onClick: onArchive }, iconOf('IconArchiveOutline20', 13)),
        ) : null,
      )
    }

    /** Name-input row + 创建/取消 buttons, rendered inside the popover. */
    function CreateGroupRow(props) {
      const { hint, onCreate, onCancel } = props
      const [value, setValue] = react.useState('')
      const ref = react.useRef(null)
      react.useEffect(() => {
        const el = ref.current
        if (el !== null && typeof el.focus === 'function') el.focus()
      }, [])
      const commit = () => {
        const trimmed = value.trim()
        if (trimmed === '') onCancel()
        else onCreate(trimmed)
      }
      return [
        hint ? h('div', { className: 'workspace-groups-pop-hint' }, hint) : null,
        h('div', { className: 'workspace-groups-pop-inputrow' },
          h('input', {
            ref,
            className: 'workspace-groups-inline-input',
            type: 'text',
            value,
            placeholder: T('newGroupPrompt'),
            onChange: (e) => setValue(e.target.value),
            onKeyDown: (e) => {
              if (e.key === 'Enter') commit()
              else if (e.key === 'Escape') onCancel()
            },
          }),
        ),
        h('div', { className: 'workspace-groups-pop-btnrow' },
          h('button', { type: 'button', className: 'workspace-groups-btn', onClick: onCancel }, T('cancel')),
          h('button', { type: 'button', className: 'workspace-groups-btn workspace-groups-btnPrimary', onClick: commit }, T('create')),
        ),
      ]
    }

    function Popover(props) {
      const { anchor, groupEntries, parentName, currentGroupId, creating, onPick, onNew, onUngroup, onCreate, onClose } = props
      // Panel clamped inside the viewport (anchored at the row's button).
      const left = Math.max(6, Math.min(anchor.x, (window.innerWidth || 1024) - 244))
      const top = Math.max(6, Math.min(anchor.y, (window.innerHeight || 768) - 320))
      return h('div', {
        className: 'workspace-groups-popover-back',
        onClick: onClose,
        onContextMenu: (e) => { e.preventDefault(); onClose() },
      },
        h('div', { className: 'workspace-groups-popover', style: { left, top }, onClick: (e) => e.stopPropagation() },
          creating ? h(CreateGroupRow, { hint: parentName ? T('subgroupHint') + parentName : undefined, onCreate, onCancel: onClose }) : [
            groupEntries.map((entry) => h('button', {
              key: entry.group.id,
              type: 'button',
              className: 'workspace-groups-pop-item',
              style: { paddingLeft: 10 + entry.level * 14 },
              onClick: () => onPick(entry.group.id),
            },
              h('span', { className: 'workspace-groups-pop-check' }, currentGroupId === entry.group.id ? iconOf('IconCheckOutline16', 12) : null),
              entry.group.name,
            )),
            h('div', { className: 'workspace-groups-pop-sep', key: 'sep' }),
            h('button', { key: 'new', type: 'button', className: 'workspace-groups-pop-item', onClick: onNew },
              h('span', { className: 'workspace-groups-pop-check' }, iconOf('IconPlusOutline16', 12)),
              T('newGroup'),
            ),
            currentGroupId ? h('button', { key: 'ungroup', type: 'button', className: 'workspace-groups-pop-item', onClick: onUngroup },
              h('span', { className: 'workspace-groups-pop-check' }),
              T('ungroup'),
            ) : null,
          ],
        ),
      )
    }

    // ----------------------------------------------------------- main view

    function WsgBrowser(props) {
      const {
        startSession, open,
        renameWorkspace, deleteWorkspace, renameSession: renameSessionApi, archiveSession: archiveSessionApi,
        createWorkspace, pickDirectory, listDirectory,
      } = props
      const hooksOk = typeof props.useWorkspaces === 'function' && typeof props.useSessions === 'function'
      const itemsRaw = hooksOk ? props.useWorkspaces((s) => s.items) : []
      const archivedIds = hooksOk ? (props.useWorkspaces((s) => s.archivedSessionIds) || []) : []
      const list = hooksOk ? props.useSessions((s) => s) : null

      const [doc, setDoc] = react.useState(null) // {groups, assignments} — null until first fetch lands
      const [docError, setDocError] = react.useState('')
      const [collapsedGroups, setCollapsedGroups] = react.useState(() => loadMap(LS_GROUPS))
      const [collapsedWorkspaces, setCollapsedWorkspaces] = react.useState(() => loadMap(LS_WORKSPACES))
      // View options (restores the native browser's 视图选项 menu): grouped vs
      // flat list, and workspace ordering. Persisted per browser.
      const [view, setView] = react.useState(() => {
        const stored = loadMap(LS_VIEW)
        return {
          mode: stored.mode === 'flat' ? 'flat' : 'grouped',
          orderBy: stored.orderBy === 'updated' ? 'updated' : 'default',
        }
      })
      const [viewMenuOpen, setViewMenuOpen] = react.useState(false)
      const [query, setQuery] = react.useState('')
      const setViewOpt = (patch) => {
        const next = { ...view, ...patch }
        setView(next)
        saveMap(LS_VIEW, next)
      }
      const [popover, setPopover] = react.useState(null) // {x, y, workspaceId|null, creating}
      const [editing, setEditing] = react.useState(null) // {kind: 'group'|'workspace'|'session', id}
      const [deleteCandidate, setDeleteCandidate] = react.useState(null) // workspaceId in two-step confirm
      const [pickerKind, setPickerKind] = react.useState('unknown') // 'native' | 'browse' | 'unknown'
      const [addBusy, setAddBusy] = react.useState(false)

      const archivedSet = react.useMemo(() => new Set(archivedIds), [archivedIds])

      react.useEffect(() => {
        if (!hooksOk) return undefined
        let alive = true
        fetch(API, { cache: 'no-store' })
          .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
          .then((body) => {
            if (!alive) return
            setDoc({
              groups: Array.isArray(body && body.groups) ? body.groups : [],
              assignments: body && body.assignments && typeof body.assignments === 'object' ? body.assignments : {},
            })
          })
          .catch((error) => {
            if (!alive) return
            setDoc({ groups: [], assignments: {} })
            setDocError(`${T('loadFailed')}: ${String(error)}`)
          })
        return () => { alive = false }
      }, [hooksOk])

      // Picker capability probe (same trick better-workspace used): one
      // silent listDirectory call resolves on a browse host and is refused
      // on a native-chooser host. On browse hosts the sidebar "+" cannot
      // work, so it is not rendered at all; unknown keeps it with a
      // graceful fallback (see addWorkspace).
      react.useEffect(() => {
        if (!hooksOk || typeof listDirectory !== 'function') return undefined
        let alive = true
        Promise.resolve()
          .then(() => listDirectory(undefined, undefined))
          .then(() => { if (alive) setPickerKind('browse') })
          .catch((error) => { if (alive && isPickerRefusal(error)) setPickerKind('native') })
        return () => { alive = false }
      }, [hooksOk])

      if (!hooksOk) {
        console.error('[workspace-groups] standard snapshot hooks missing; tree renders nothing')
        return null
      }

      const byId = list && list.byId ? list.byId : {}
      const current = list ? list.current : undefined

      const sessionsOf = (workspace) => {
        const rows = []
        const ids = Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []
        for (const id of ids) {
          const summary = byId[id]
          if (!sessionVisible(summary, current, archivedSet)) continue
          rows.push({
            id,
            title: titleOf(summary),
            running: !!summary.running,
            completed: summary.completed === true,
            updatedAt: summary.updatedAt,
          })
        }
        return rows
      }

      const items = (Array.isArray(itemsRaw) ? itemsRaw : []).filter(
        (it) => it !== null && typeof it === 'object' && typeof it.workspaceId === 'string' && it.workspaceId !== '',
      )
      const groups = doc ? doc.groups : []
      const assignments = doc ? doc.assignments : {}
      const byGroup = new Map(groups.map((g) => [g.id, []]))
      const ungrouped = []
      for (const workspace of items) {
        const groupId = assignments[workspace.workspaceId]
        if (groupId && byGroup.has(groupId)) byGroup.get(groupId).push(workspace)
        else ungrouped.push(workspace)
      }
      // Multi-level grouping (v0.3.0): resolve parents once; a dangling or
      // cyclic parentId degrades that group to top level (server validates
      // too, this is only the render-side safety net).
      const validParentOf = (group) => {
        if (typeof group.parentId !== 'string' || group.parentId === group.id) return undefined
        return groups.some((g) => g.id === group.parentId) ? group.parentId : undefined
      }
      const childGroupsOf = new Map()
      const rootGroups = []
      for (const group of groups) {
        const parentId = validParentOf(group)
        if (parentId !== undefined && childGroupsOf.has(parentId)) childGroupsOf.get(parentId).push(group)
        else if (parentId !== undefined) childGroupsOf.set(parentId, [group])
        else rootGroups.push(group)
      }
      const MAX_DEPTH = 8
      // 最近更新 ordering: last session activity per workspace, newest first.
      const lastUpdated = (workspace) => {
        let latest = 0
        const ids = Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []
        for (const id of ids) {
          const ts = normalizeTime(byId[id] !== undefined ? byId[id].updatedAt : undefined)
          if (ts > latest) latest = ts
        }
        return latest
      }
      const byUpdated = (a, b) => lastUpdated(b) - lastUpdated(a)
      if (view.orderBy === 'updated') {
        for (const [groupId, list] of byGroup) byGroup.set(groupId, [...list].sort(byUpdated))
        ungrouped.sort(byUpdated)
      }
      // 单列表 mode: every workspace in one flat list (groups untouched on disk).
      const flatList = view.mode === 'flat'
        ? (view.orderBy === 'updated' ? [...items].sort(byUpdated) : [...items])
        : null

      // ---- group-doc mutations (optimistic, revert on failure) ------------

      const persist = (next) => {
        const prev = doc
        setDoc(next)
        fetch(API, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version: 1, groups: next.groups, assignments: next.assignments }),
        })
          .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status) })
          .then(() => { setDocError('') })
          .catch((error) => {
            if (prev !== null) setDoc(prev)
            setDocError(`${T('saveFailed')}: ${String(error)}`)
          })
      }

      const createGroup = (name, parentGroupId) => {
        const trimmed = String(name || '').trim()
        if (trimmed === '' || doc === null || doc.groups.length >= MAX_GROUPS) return null
        const group = { id: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: trimmed.slice(0, 120) }
        // Enforce the depth cap: walk up from the requested parent.
        if (parentGroupId) {
          let level = 1
          let cursor = parentGroupId
          while (cursor !== undefined) {
            if (level >= MAX_DEPTH) return null
            level += 1
            const parent = doc.groups.find((g) => g.id === cursor)
            cursor = validParentOf(parent !== undefined ? parent : {})
          }
          group.parentId = parentGroupId
        }
        persist({ groups: [...doc.groups, group], assignments: doc.assignments })
        return group
      }

      const deleteGroup = (group) => {
        if (doc === null) return
        // Its workspaces fall back to 未分组; child groups are PROMOTED to the
        // deleted group's own parent so the subtree structure survives.
        const promotedParent = validParentOf(group)
        const nextGroups = []
        for (const g of doc.groups) {
          if (g.id === group.id) continue
          if (validParentOf(g) === group.id) {
            const promoted = { id: g.id, name: g.name }
            if (promotedParent !== undefined) promoted.parentId = promotedParent
            nextGroups.push(promoted)
          } else nextGroups.push(g)
        }
        const nextAssignments = {}
        for (const [key, value] of Object.entries(doc.assignments)) {
          if (value !== group.id) nextAssignments[key] = value
        }
        persist({ groups: nextGroups, assignments: nextAssignments })
      }

      const assign = (workspaceId, groupId) => {
        if (doc === null) return
        const nextAssignments = { ...doc.assignments }
        if (groupId) nextAssignments[workspaceId] = groupId
        else delete nextAssignments[workspaceId]
        persist({ groups: doc.groups, assignments: nextAssignments })
        setPopover(null)
      }

      /** Inline-rename commit, dispatched by what is being renamed. */
      const commitEditing = (name) => {
        const job = editing
        setEditing(null)
        if (!job || doc === null) return
        if (job.kind === 'group') {
          const group = doc.groups.find((g) => g.id === job.id)
          if (!group || name === group.name) return
          persist({ groups: doc.groups.map((g) => (g.id === job.id ? { ...g, name: name.slice(0, 120) } : g)), assignments: doc.assignments })
        } else if (job.kind === 'workspace') {
          const workspace = items.find((it) => it.workspaceId === job.id)
          if (!workspace || name === workspace.title) return
          Promise.resolve().then(() => renameWorkspace(job.id, name)).catch(guard('renameWorkspace'))
        } else if (job.kind === 'session') {
          Promise.resolve().then(() => renameSessionApi(job.id, name)).catch(guard('renameSession'))
        }
      }

      // ---- collapse state (localStorage, per browser) ---------------------

      const toggleMapKey = (setter, map, key, lsKey) => {
        const next = { ...map }
        if (next[key]) delete next[key]
        else next[key] = true
        setter(next)
        saveMap(lsKey, next)
      }

      // ---- workspace / session actions ------------------------------------

      const guard = (what) => (error) => console.error(`[workspace-groups] ${what} failed:`, error)

      const newSessionInWorkspace = (workspace) => {
        // force-expand the row: the user must SEE the new session appear
        toggleMapKey(setCollapsedWorkspaces, collapsedWorkspaces, workspace.workspaceId, LS_WORKSPACES)
        try {
          const result = startSession(workspace.workspaceId)
          if (result && typeof result.catch === 'function') result.catch(guard('startSession'))
        } catch (error) { guard('startSession')(error) }
      }

      const archiveSessionRow = (session) => {
        try {
          const result = archiveSessionApi(session.id)
          if (result && typeof result.catch === 'function') result.catch(guard('archiveSession'))
        } catch (error) { guard('archiveSession')(error) }
      }

      const confirmDeleteWorkspace = () => {
        const workspaceId = deleteCandidate
        setDeleteCandidate(null)
        if (!workspaceId) return
        Promise.resolve().then(() => deleteWorkspace(workspaceId)).catch(guard('deleteWorkspace'))
      }

      const openCreatePopover = (e, parentGroupId) => {
        const rect = typeof e.currentTarget.getBoundingClientRect === 'function'
          ? e.currentTarget.getBoundingClientRect()
          : { left: 40, bottom: 60 }
        setPopover({ x: rect.left, y: rect.bottom + 4, workspaceId: null, parentGroupId: parentGroupId || null, creating: true })
      }

      const openMovePopover = (e, workspaceId) => {
        const rect = typeof e.currentTarget.getBoundingClientRect === 'function'
          ? e.currentTarget.getBoundingClientRect()
          : { right: 200, top: 200 }
        setPopover({ x: rect.right + 4, y: rect.top, workspaceId, parentGroupId: null, creating: false })
      }

      const handlePopoverCreate = (name) => {
        const job = popover
        const group = createGroup(name, job !== null ? job.parentGroupId : null)
        if (job !== null && job.workspaceId && group !== null) assign(job.workspaceId, group.id)
        else setPopover(null)
      }

      const addWorkspace = () => {
        if (addBusy) return
        setAddBusy(true)
        // The host chooser resolves a path (falsy = cancelled). A browse-
        // backend host refuses the native capability — remember that verdict
        // (the button disappears) and point at the host's own picker instead.
        Promise.resolve()
          .then(() => pickDirectory())
          .then((path) => {
            if (!path) return undefined
            return createWorkspace({ path: String(path) })
          })
          .then(() => { setDocError('') })
          .catch((error) => {
            if (isPickerRefusal(error)) {
              setPickerKind('browse')
              setDocError(T('useHeroPicker'))
            } else {
              setDocError(`${T('addWorkspaceFailed')}: ${String(error)}`)
            }
          })
          .then(() => { setAddBusy(false) })
      }

      // ---- render ----------------------------------------------------------

      const renderWorkspace = (workspace, level) => {
        const depth = 6 + level * 12
        const sessions = sessionsOf(workspace)
        // workspaceOpen — deliberately not `open`, which would shadow the
        // open() action prop used by the session-row onOpen handlers below.
        const workspaceOpen = !collapsedWorkspaces[workspace.workspaceId]
        const currentInside = current !== undefined && current !== null && Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(current)
        const rows = [
          h(WorkspaceEntry, {
            key: `workspace-${workspace.workspaceId}`,
            workspace,
            count: sessions.length,
            open: workspaceOpen,
            currentInside,
            depth,
            editing: editing !== null && editing.kind === 'workspace' && editing.id === workspace.workspaceId,
            confirmingDelete: deleteCandidate === workspace.workspaceId,
            onToggle: () => toggleMapKey(setCollapsedWorkspaces, collapsedWorkspaces, workspace.workspaceId, LS_WORKSPACES),
            onNewSession: () => newSessionInWorkspace(workspace),
            onMove: (e) => openMovePopover(e, workspace.workspaceId),
            onStartRename: () => { setDeleteCandidate(null); setEditing({ kind: 'workspace', id: workspace.workspaceId }) },
            onCommitRename: commitEditing,
            onCancelRename: () => setEditing(null),
            onStartDelete: () => { setEditing(null); setDeleteCandidate(workspace.workspaceId) },
            onConfirmDelete: confirmDeleteWorkspace,
            onCancelDelete: () => setDeleteCandidate(null),
          }),
        ]
        if (workspaceOpen) {
          for (const session of sessions) {
            rows.push(h(SessionRow, {
              key: `session-${session.id}`,
              session,
              current: current === session.id,
              depth: depth + 12,
              editing: editing !== null && editing.kind === 'session' && editing.id === session.id,
              onOpen: (id) => {
                try {
                  const result = open(id)
                  if (result && typeof result.catch === 'function') result.catch(guard('open'))
                } catch (error) { guard('open')(error) }
              },
              onStartRename: () => setEditing({ kind: 'session', id: session.id }),
              onCommitRename: commitEditing,
              onCancelRename: () => setEditing(null),
              onArchive: () => archiveSessionRow(session),
            }))
          }
        }
        return rows
      }

      // Recursive multi-level group rendering (v0.3.0). A group's subtree
      // renders as: head, member workspaces (+ their sessions), then child
      // groups — workspace rows stay contiguous with their sessions
      // (workspace-lock document-order scoping).
      const subtreeWorkspaceCount = (rootId) => {
        const seen = new Set()
        const count = (groupId) => {
          if (seen.has(groupId)) return 0
          seen.add(groupId)
          const kids = childGroupsOf.get(groupId) || []
          return (byGroup.get(groupId) || []).length + kids.reduce((sum, kid) => sum + count(kid.id), 0)
        }
        return count(rootId)
      }
      const renderGroup = (group, level) => {
        const members = byGroup.get(group.id) || []
        const children = childGroupsOf.get(group.id) || []
        const groupOpen = !collapsedGroups[group.id]
        const rows = [h(GroupHead, {
          key: `group-${group.id}`,
          group,
          count: subtreeWorkspaceCount(group.id),
          open: groupOpen,
          depth: 6 + level * 12,
          editing: editing !== null && editing.kind === 'group' && editing.id === group.id,
          onToggle: () => toggleMapKey(setCollapsedGroups, collapsedGroups, group.id, LS_GROUPS),
          onStartAddChild: (e) => openCreatePopover(e, group.id),
          onStartRename: () => setEditing({ kind: 'group', id: group.id }),
          onCommitRename: commitEditing,
          onCancelRename: () => setEditing(null),
          onDelete: () => deleteGroup(group),
        })]
        if (groupOpen) {
          for (const workspace of members) rows.push(...renderWorkspace(workspace, level + 1))
          for (const child of children) rows.push(...renderGroup(child, level + 1))
        }
        return rows
      }
      // Depth-capped DFS order for the move-popover tree.
      const groupEntries = []
      {
        const seen = new Set()
        const pushLevel = (parentId, level) => {
          const kids = parentId === null ? rootGroups : (childGroupsOf.get(parentId) || [])
          for (const group of kids) {
            if (seen.has(group.id) || level > MAX_DEPTH) continue
            seen.add(group.id)
            groupEntries.push({ group, level })
            pushLevel(group.id, level + 1)
          }
        }
        pushLevel(null, 0)
      }

      const trimmedQuery = query.trim().toLowerCase()
      const searching = trimmedQuery !== ''
      const bodyRows = []

      if (searching) {
        const hits = []
        for (const workspace of items) {
          for (const session of sessionsOf(workspace)) {
            if (String(session.title).toLowerCase().includes(trimmedQuery)) hits.push({ workspace, session })
          }
        }
        if (hits.length === 0) bodyRows.push(h('div', { className: 'workspace-groups-empty', key: 'nores' }, T('noResults')))
        for (const hit of hits) {
          bodyRows.push(h(SessionRow, {
            key: `q-${hit.session.id}`,
            session: hit.session,
            current: current === hit.session.id,
            extraTitle: hit.workspace.title,
            depth: 6,
            editing: editing !== null && editing.kind === 'session' && editing.id === hit.session.id,
            onOpen: (id) => {
              try {
                const result = open(id)
                if (result && typeof result.catch === 'function') result.catch(guard('open'))
              } catch (error) { guard('open')(error) }
            },
            onStartRename: () => setEditing({ kind: 'session', id: hit.session.id }),
            onCommitRename: commitEditing,
            onCancelRename: () => setEditing(null),
            onArchive: () => archiveSessionRow(hit.session),
          }))
        }
      } else if (flatList !== null) {
        // 单列表 (native view option): every workspace in one flat list,
        // groups hidden from view (data untouched).
        for (const workspace of flatList) bodyRows.push(...renderWorkspace(workspace, 0))
        if (bodyRows.length === 0) {
          bodyRows.push(h('div', { className: 'workspace-groups-empty', key: 'empty' }, doc === null ? T('loading') : T('noWorkspaces')))
        }
      } else if (groups.length === 0) {
        // Zero-state: no groups configured — render a plain workspace list,
        // so installing the plugin alone changes nothing visually.
        for (const workspace of ungrouped) bodyRows.push(...renderWorkspace(workspace, 0))
        if (bodyRows.length === 0) {
          bodyRows.push(h('div', { className: 'workspace-groups-empty', key: 'empty' }, doc === null ? T('loading') : T('noWorkspaces')))
        }
      } else {
        for (const group of rootGroups) bodyRows.push(...renderGroup(group, 0))
        if (ungrouped.length > 0) {
          const ungroupedOpen = !collapsedGroups[UNGROUPED_KEY]
          bodyRows.push(h('div', {
            key: 'group-ungrouped',
            className: 'workspace-groups-group-head',
            onClick: () => toggleMapKey(setCollapsedGroups, collapsedGroups, UNGROUPED_KEY, LS_GROUPS),
            role: 'treeitem',
            'aria-expanded': ungroupedOpen,
          },
            h(Chevron, { open: ungroupedOpen }),
            h('span', { className: 'workspace-groups-row-icon', dangerouslySetInnerHTML: { __html: SVG_LAYERS } }),
            h('span', { className: 'workspace-groups-group-name' }, T('ungrouped')),
            h('span', { className: 'workspace-groups-group-count' }, String(ungrouped.length)),
          ))
          if (ungroupedOpen) for (const workspace of ungrouped) bodyRows.push(...renderWorkspace(workspace, 1))
        }
      }

      return h('div', { className: 'workspace-groups-outer' },
        h('div', { className: 'workspace-groups-root' },
          h('div', { className: 'workspace-groups-header' },
            h('input', {
              className: 'workspace-groups-input',
              type: 'text',
              placeholder: T('search'),
              value: query,
              onChange: (e) => setQuery(e.target.value),
            }),
            ui.Menu ? h(ui.Menu, {
              open: viewMenuOpen,
              onClose: () => setViewMenuOpen(false),
              items: [
                { type: 'label', id: 'group-by', text: T('groupByLabel') },
                { id: 'grouped', label: T('groupByGrouped') },
                { id: 'flat', label: T('groupByFlat') },
                { type: 'separator', id: 'order-by-separator' },
                { type: 'label', id: 'order-by', text: T('orderByLabel') },
                { id: 'default', label: T('orderByDefault') },
                { id: 'updated', label: T('orderByUpdated') },
              ],
              selectedIds: [view.mode, view.orderBy],
              onSelect: (id) => {
                if (id === 'grouped' || id === 'flat') setViewOpt({ mode: id })
                else if (id === 'default' || id === 'updated') setViewOpt({ orderBy: id })
                setViewMenuOpen(false)
              },
              align: 'end',
              dense: true,
              portal: true,
              anchor: h('button', {
                type: 'button',
                className: 'workspace-groups-icon-btn',
                title: T('viewOptionsLabel'),
                'aria-label': T('viewOptionsLabel'),
                onClick: () => setViewMenuOpen((v) => !v),
              }, iconOf('IconPersonalizationOutline16', 14)),
            }) : null,
            h('button', {
              type: 'button',
              className: 'workspace-groups-icon-btn',
              title: T('newGroup'),
              disabled: doc === null,
              onClick: openCreatePopover,
            }, iconOf('IconProjectAddOutline16', 14)),
            pickerKind === 'browse' ? null : h('button', {
              type: 'button',
              className: 'workspace-groups-icon-btn',
              title: T('addWorkspace'),
              disabled: addBusy,
              onClick: addWorkspace,
            }, iconOf('IconPlusOutline16', 14)),
          ),
          docError !== '' ? h('div', { className: 'workspace-groups-error' }, docError) : null,
          h('div', { className: 'workspace-groups-tree', role: 'tree' }, bodyRows),
          popover !== null ? h(Popover, {
            anchor: popover,
            groupEntries,
            parentName: popover.parentGroupId ? (groups.find((g) => g.id === popover.parentGroupId) || {}).name : undefined,
            currentGroupId: (popover.workspaceId && assignments[popover.workspaceId]) || '',
            creating: popover.creating === true,
            onPick: (groupId) => assign(popover.workspaceId, groupId),
            onNew: () => setPopover({ ...popover, creating: true }),
            onUngroup: () => assign(popover.workspaceId, ''),
            onCreate: handlePopoverCreate,
            onClose: () => setPopover(null),
          }) : null,
        ),
      )
    }

    // ------------------------------------------------------------------ apply

    function apply(ctx) {
      // A duplicated client injection must not mount a second tree.
      if (window.__workspaceGroupsApplied === true) return
      window.__workspaceGroupsApplied = true
      try {
        ensureStyles()
        let slots = null
        try { slots = ctx.get('slots') } catch (error) { console.error('[workspace-groups] slots unavailable:', error) }
        if (slots !== null && typeof slots.inject === 'function' && typeof slots.register === 'function') {
          // All host-service access is lazy (resolved at call time inside
          // these wrappers): services may still be registering while apply()
          // runs, and the actions only fire on real user interaction anyway.
          const actions = () => ({
            startSession: (workspaceId) => ctx.get('uiWorkspace').startSession(workspaceId),
            open: (sessionId) => ctx.get('sessions').open(sessionId),
            renameWorkspace: (workspaceId, title) => ctx.get('workspaces').rename(workspaceId, title),
            deleteWorkspace: (workspaceId) => ctx.get('workspaces').delete(workspaceId),
            renameSession: async (sessionId, title) => {
              const binding = ctx.get('sessions').binding(sessionId)
              const session = binding && binding.session
              if (!session) throw new Error(`unknown session "${sessionId}"`)
              const result = await session.rename(title)
              if (!result || !result.ok) throw new Error(result && result.error ? result.error.message : 'session rename failed')
            },
            archiveSession: (sessionId) => ctx.get('uiWorkspace').archiveSession(sessionId),
            createWorkspace: (input) => ctx.get('workspaces').create(input),
            pickDirectory: () => ctx.get('uiWorkspace').pickDirectory(),
            listDirectory: (path, signal) => ctx.get('uiWorkspace').listDirectory(path, signal),
          })
          try {
            // sidebar.workspaces at priority -1 (ascending, lowest renders):
            // the same seat better-workspace used to shadow the shipped
            // browser. A thrown register costs this one seat, never the
            // whole plugin fiber.
            slots.inject('sidebar.workspaces', () => {
              try {
                return slots.register(
                  { name: 'sidebar.workspaces', priority: -1, inject: actions },
                  (slotProps) => h(Boundary, null, h(WsgBrowser, slotProps)),
                )
              } catch (registerError) {
                console.error('[workspace-groups] register skipped for sidebar.workspaces:', registerError)
                return undefined
              }
            })
          } catch (injectError) {
            console.error('[workspace-groups] slots.inject failed:', injectError)
          }
        }
        ctx.effect(() => {
          return () => {
            removeStyles()
            window.__workspaceGroupsApplied = false
          }
        }, 'workspace-groups: ui')
      } catch (error) {
        window.__workspaceGroupsApplied = false
        console.error('[workspace-groups] apply failed:', error)
      }
    }

    exports.apply = apply
    exports.inject = ['slots', 'sessions', 'workspaces', 'uiWorkspace']
    return module.exports
  },
})
