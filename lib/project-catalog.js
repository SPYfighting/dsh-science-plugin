// dsh-science — 工作区 Project Catalog（路线 B T7 / T-A6）
//
// 输入只能是当前 sessionId。输出是课题摘要和 opaque open handle。
// 打开课题只返回已绑定 root，供 uiWorkspace.openSession 使用，不静默 attach。

import { createHmac, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDirOf } from './store.js'
import { resolveProjectContext } from './project-context.js'
import { liveSessionOf, workspaceFactOf, workspaceKeyOf } from './workspace-key.js'

export const LEGACY_UNASSIGNED = 'legacy-unassigned'
export const WORKSPACE_ASSIGNED = 'assigned'

const STAGE_LABELS = Object.freeze({
  explore: '研究探索',
  frame: '文章结构',
  execute: '任务细化',
  synthesize: '分析与绘图',
  draft: '论文写作',
  audit: '汇报与投稿',
})

const RUNNING = new Set(['claimed', 'in_progress', 'running', 'working'])
const QUESTION_EXCERPT = 160
const FORBIDDEN_SUMMARY_KEYS = ['projectId', 'rootSessionId', 'workspaceKey', 'workspace_key', 'path', 'cwd', 'snapshot', 'sqlite']

export function openHandleOf(secret, { sessionId, projectId, rootSessionId }) {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    s: String(sessionId || ''),
    p: String(projectId || ''),
    r: String(rootSessionId || ''),
  })).toString('base64url')
  const mac = createHmac('sha256', String(secret || '')).update(payload).digest('base64url')
  return `${payload}.${mac}`
}

export function verifyOpenHandle(secret, handle, sessionId) {
  const text = String(handle || '')
  const dot = text.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = text.slice(0, dot)
  const mac = text.slice(dot + 1)
  const expected = createHmac('sha256', String(secret || '')).update(payload).digest('base64url')
  const left = Buffer.from(expected)
  const right = Buffer.from(mac)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  let body = null
  try { body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) } catch { return null }
  if (!body || body.v !== 1 || String(body.s || '') !== String(sessionId || '')) return null
  if (!body.p || !body.r) return null
  return { projectId: String(body.p), rootSessionId: String(body.r) }
}

function loadTeamTasks() {
  try {
    const file = join(dataDirOf(), 'team.json')
    if (!existsSync(file)) return []
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(parsed && parsed.tasks) ? parsed.tasks : []
  } catch {
    return []
  }
}

function tasksFor(projectId, rootSessionId) {
  return loadTeamTasks().filter((task) => {
    if (!task || typeof task !== 'object') return false
    if (task.projectId && String(task.projectId) === String(projectId)) return true
    if (!task.projectId && task.rootSessionId && String(task.rootSessionId) === String(rootSessionId)) return true
    return false
  })
}

function isBlocked(task) {
  if (!task) return false
  if (task.status === 'blocked' || task.isBlocked === true || task.blocked === true) return true
  return Array.isArray(task.blockers) && task.blockers.length > 0
}

export function attentionOf(snapshot, tasks) {
  const paper = snapshot && snapshot.paper && typeof snapshot.paper === 'object' ? snapshot.paper : {}
  const core = paper.core && typeof paper.core === 'object' ? paper.core : null
  let attention = 0
  if (core && (core.claim || core.title) && core.confirmed !== true) attention += 1
  for (const result of Array.isArray(paper.results) ? paper.results : []) {
    if (!result || result.confirmed === true) continue
    if (result.status === 'dropped' || result.manuscriptRole === 'excluded') continue
    attention += 1
  }
  let running = 0
  let blocked = 0
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (RUNNING.has(String(task.status || ''))) running += 1
    if (isBlocked(task)) blocked += 1
    else if (task.status === 'failed') attention += 1
  }
  return { attention, running, blocked }
}

function excerptOf(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  if (value.length <= QUESTION_EXCERPT) return value
  return `${value.slice(0, QUESTION_EXCERPT)}…`
}

function publicSummary(row, snapshot, { current, openable, handle }) {
  const paper = snapshot && snapshot.paper && typeof snapshot.paper === 'object' ? snapshot.paper : {}
  const stage = String(paper.stage || 'explore')
  const counts = attentionOf(snapshot, tasksFor(row.projectId, row.rootSessionId))
  return {
    title: String((snapshot && snapshot.metadata && snapshot.metadata.title) || row.title || '未命名课题'),
    questionExcerpt: excerptOf(paper.question || ''),
    stage,
    stageLabel: STAGE_LABELS[stage] || '研究探索',
    attentionCount: counts.attention,
    runningCount: counts.running,
    blockedCount: counts.blocked,
    updatedAt: Number((snapshot && snapshot.metadata && snapshot.metadata.updatedAt) || row.updatedAt || 0),
    current: current === true,
    openable: openable === true,
    openHandle: handle,
  }
}

export function summaryLeaks(value) {
  const found = []
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return
    for (const [key, child] of Object.entries(node)) {
      if (FORBIDDEN_SUMMARY_KEYS.includes(key)) found.push(path ? `${path}.${key}` : key)
      if (child && typeof child === 'object') walk(child, path ? `${path}.${key}` : key)
    }
  }
  walk(value, '')
  return found
}

function chosenWorkspaceFact(ctx, sessionId, ref) {
  const own = workspaceFactOf(ctx, sessionId)
  if (own.status === 'unique' || own.status === 'ambiguous') return own
  if (ref && ref.rootSessionId && String(ref.rootSessionId) !== String(sessionId)) {
    return workspaceFactOf(ctx, ref.rootSessionId)
  }
  return own
}

export function backfillWorkspaceKeys(store, ctx) {
  const rows = store.listProjectAuthRows()
  const out = []
  for (const row of rows) {
    if (row.workspaceStatus === WORKSPACE_ASSIGNED && row.workspaceKey) {
      out.push({ projectId: row.projectId, status: WORKSPACE_ASSIGNED, changed: false })
      continue
    }
    const fact = workspaceFactOf(ctx, row.rootSessionId)
    if (fact.status !== 'unique') {
      out.push({ projectId: row.projectId, status: LEGACY_UNASSIGNED, changed: false, reason: fact.status })
      continue
    }
    const assigned = store.assignWorkspaceKey(row.projectId, workspaceKeyOf(fact.path))
    out.push({ projectId: row.projectId, status: WORKSPACE_ASSIGNED, changed: assigned.changed })
  }
  return out
}

export function catalogForSession(ctx, sessionId, { store }) {
  const scope = resolveProjectContext(ctx, sessionId, { store })
  if (!scope.ok) return { status: 404, body: { error: scope.code || 'unknown-session' } }
  const chosen = chosenWorkspaceFact(ctx, sessionId, scope.ref)
  if (chosen.status === 'ambiguous') {
    return { status: 200, body: { catalogRevision: 0, generatedAt: Date.now(), assignment: 'ambiguous', projects: [] } }
  }
  if (chosen.status !== 'unique') {
    const assignment = scope.ref && scope.ref.projectId ? 'workspace-unknown' : 'unbound'
    return { status: 200, body: { catalogRevision: 0, generatedAt: Date.now(), assignment, projects: [] } }
  }
  backfillWorkspaceKeys(store, ctx)
  const key = workspaceKeyOf(chosen.path)
  const rows = store.listCatalogProjects(key)
  const secret = store.catalogSecret()
  const currentId = scope.ref && scope.ref.projectId ? String(scope.ref.projectId) : ''
  const currentAuth = currentId ? store.projectAuthOf(currentId) : null
  let assignment = 'unbound'
  if (currentAuth && currentAuth.workspaceStatus === LEGACY_UNASSIGNED) assignment = LEGACY_UNASSIGNED
  else if (currentAuth && currentAuth.workspaceStatus === WORKSPACE_ASSIGNED) assignment = WORKSPACE_ASSIGNED
  const projects = rows.map((row) => {
    const snap = store.snapshotOf(row.projectId)
    const snapshot = snap && !snap.corrupt ? snap.snapshot : null
    return publicSummary(row, snapshot, {
      current: currentId !== '' && row.projectId === currentId,
      openable: Boolean(liveSessionOf(ctx, row.rootSessionId)),
      handle: openHandleOf(secret, { sessionId, projectId: row.projectId, rootSessionId: row.rootSessionId }),
    })
  })
  const revision = projects.reduce((max, item) => Math.max(max, Number(item.updatedAt) || 0), 0)
  return {
    status: 200,
    body: { catalogRevision: revision, generatedAt: Date.now(), assignment, projects },
  }
}

export function openCatalogProject(ctx, sessionId, body, { store }) {
  const scope = resolveProjectContext(ctx, sessionId, { store })
  if (!scope.ok) return { status: 404, body: { error: scope.code || 'unknown-session' } }
  const chosen = chosenWorkspaceFact(ctx, sessionId, scope.ref)
  if (chosen.status !== 'unique') return { status: 403, body: { error: 'forbidden' } }
  const verified = verifyOpenHandle(store.catalogSecret(), body && body.openHandle, sessionId)
  if (!verified) return { status: 403, body: { error: 'forbidden' } }
  const auth = store.projectAuthOf(verified.projectId)
  if (!auth || auth.workspaceStatus !== WORKSPACE_ASSIGNED || auth.workspaceKey !== workspaceKeyOf(chosen.path)) {
    return { status: 403, body: { error: 'forbidden' } }
  }
  if (String(auth.rootSessionId) !== verified.rootSessionId) return { status: 403, body: { error: 'forbidden' } }
  if (!liveSessionOf(ctx, auth.rootSessionId)) {
    return {
      status: 409,
      body: {
        kind: 'unavailable',
        message: '原会话当前不在线。请先在 DSH 工作区中打开该会话，或回到当时的对话。当前会话不会被改绑到这个课题。',
      },
    }
  }
  return { status: 200, body: { kind: 'open', sessionId: String(auth.rootSessionId) } }
}
