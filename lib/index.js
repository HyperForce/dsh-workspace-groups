/**
 * dsh-workspace-groups host half (v0.2.0): persists workspace group assignments for
 * the web GUI. The state is a single JSON document at <home>/.dsh/workspace-groups.json
 * — inside the dsh-data volume, so it rides volume backups. Two verbs on one
 * exact route:
 *   GET  /api/workspace-groups/state  → current state document
 *   POST /api/workspace-groups/state  → full-state save (sanitized, size-capped)
 * Requests are same-origin fenced; failures answer JSON, never crash the host.
 *
 * v0.2.0 changes vs v0.1.0: the static `export const inject = ['webServer']`
 * is gone (a static inject hands apply() a FILTERED cordis context — services
 * injected later inside it never fire); the route now registers through a
 * dynamic ctx.inject. Storage path can be overridden with DSH_WORKSPACE_GROUPS_PATH
 * (smoke tests).
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const STATE_PATH = process.env.DSH_WORKSPACE_GROUPS_PATH || join(homedir(), '.dsh', 'workspace-groups.json')
const MAX_BODY_BYTES = 256 * 1024
const MAX_GROUPS = 200
const MAX_ID = 64
const MAX_NAME = 120
const MAX_WORKSPACE_KEY = 256

const EMPTY_STATE = Object.freeze({ version: 1, groups: [], assignments: {} })

/** Validate an incoming document; undefined when malformed. */
function sanitizeState(input) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined
  if (input.groups !== undefined && !Array.isArray(input.groups)) return undefined
  const rawGroups = Array.isArray(input.groups) ? input.groups : []
  if (rawGroups.length > MAX_GROUPS) return undefined
  const groups = []
  const ids = new Set()
  for (const group of rawGroups) {
    if (typeof group !== 'object' || group === null) return undefined
    if (typeof group.id !== 'string' || group.id === '' || group.id.length > MAX_ID) return undefined
    if (typeof group.name !== 'string' || group.name === '' || group.name.length > MAX_NAME) return undefined
    if (ids.has(group.id)) return undefined
    ids.add(group.id)
    groups.push({ id: group.id, name: group.name })
  }
  const rawAssignments = typeof input.assignments === 'object' && input.assignments !== null && !Array.isArray(input.assignments)
    ? input.assignments
    : {}
  const assignments = {}
  for (const [key, value] of Object.entries(rawAssignments)) {
    if (key === '' || key.length > MAX_WORKSPACE_KEY) return undefined
    // Drop dangling targets silently (a deleted group must not strand rows).
    if (typeof value !== 'string' || !ids.has(value)) continue
    assignments[key] = value
  }
  return { version: 1, groups, assignments }
}

function readState() {
  try {
    if (!existsSync(STATE_PATH)) return { ...EMPTY_STATE }
    const parsed = JSON.parse(readFileSync(STATE_PATH, 'utf8'))
    return sanitizeState(parsed) ?? { ...EMPTY_STATE }
  } catch (error) {
    console.error('[workspace-groups] state read failed:', error)
    return { ...EMPTY_STATE }
  }
}

function writeState(state) {
  const tmp = `${STATE_PATH}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, STATE_PATH)
}

function writeJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

/**
 * Same-origin fence, mirroring the verified implementation in better-workspace's
 * host half: browser GETs carry no Origin header and this embedded Chromium
 * sends no Sec-Fetch-Site either, so a bare request (neither header) is
 * admitted; cross-site browser requests DO carry Sec-Fetch-Site: cross-site
 * (rejected) or an Origin to compare — hostname-only, because the reverse
 * proxy strips the port from the upstream Host header.
 */
function sameOrigin(req) {
  const site = req.headers['sec-fetch-site']
  if (site === 'same-origin') return true
  if (site === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return site === undefined
  const host = req.headers.host
  if (typeof origin !== 'string' || origin === '' || typeof host !== 'string' || host === '') return false
  try {
    return new URL(origin).hostname === new URL(`http://${host}`).hostname
  } catch {
    return false
  }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body-too-large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export function apply(ctx) {
  // Dynamic inject only (see module docblock): a static export would filter
  // the context this component sees for the rest of its lifetime.
  ctx.inject(['webServer'], (wctx) => {
    const route = {
      kind: 'exact',
      path: '/api/workspace-groups/state',
      handler: async (req, res) => {
        try {
          if (!sameOrigin(req)) return writeJson(res, 403, { ok: false, error: 'forbidden' })
          if (req.method === 'GET') return writeJson(res, 200, readState())
          if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
          if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
            return writeJson(res, 415, { ok: false, error: 'json-required' })
          }
          const raw = await readBody(req, MAX_BODY_BYTES)
          let parsed
          try {
            parsed = JSON.parse(raw)
          } catch {
            return writeJson(res, 400, { ok: false, error: 'invalid-json' })
          }
          const clean = sanitizeState(parsed)
          if (clean === undefined) return writeJson(res, 400, { ok: false, error: 'invalid-state' })
          writeState(clean)
          return writeJson(res, 200, { ok: true, state: clean })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const code = message === 'body-too-large' ? 413 : 500
          try {
            writeJson(res, code, { ok: false, error: message })
          } catch {
            // Headers already sent: nothing left to answer with.
          }
        }
      },
    }
    const dispose = wctx.webServer.register(route)
    return () => {
      try {
        dispose()
      } catch {
        // Server already tearing down.
      }
    }
  })
}
