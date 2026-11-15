// dsh-science — 项目作用域解析（ProjectContext，T0.4 spike → 阶段 1 正式 module）
//
// 设计真源 §7：客户端不得提交任意 projectId/root session/磁盘路径；宿主根据当前
// session 在服务端解析 ProjectRef。本模块是唯一的 session → scope 解析 seam：
// host 工具、Project Remote act、HTTP 路由都必须经它取 scope，不得自行推断。
//
// 解析规则（spike 冻结版，阶段 1 按此扩展）：
// 1. 只认 live session（ctx.sessions.get）；查不到 → unknown-session，不猜。
// 2. 队友身份必须由 roster 证明（team.json 成员的 childId + spawn 时记录的
//    parentSessionId）；官方 ctx.agentTeams.tryMembership 可用时优先采用。
//    只有 parentSession 不构成队友证据——普通 fork 也有父 session。
// 3. 有 parentSession 但不在 roster → fork：写时复制隔离，绝不继承父项目。
// 4. root/attached 绑定查 Project Store：primaryRootSessionId 或 attachedRootSessionIds。
// 5. 未绑定时 relationship='unbound'：读取放行（空状态），首次持久写才建项目。

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDirOf } from './store.js'
import { workspaceFactOf, workspaceKeyOf } from './workspace-key.js'

function log(msg) {
  console.log(`[dsh-science project-context] ${msg}`)
}

// ---- roster（身份事实的只读视图）---------------------------------------------
// team.json 是本插件自管团队的 roster（成员=命名子代理，spawn 时记录 childId 与
// 真实父会话）。这里只读 members，绝不写；损坏按空 roster 处理（宁缺毋滥）。
function rosterMembers() {
  try {
    const file = join(dataDirOf(), 'team.json')
    if (!existsSync(file)) return []
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const members = Array.isArray(parsed && parsed.members) ? parsed.members : []
    return members.filter((m) => m && typeof m === 'object' && typeof m.name === 'string')
  } catch {
    return []
  }
}

// 官方 Agent Team 身份在工具执行路径（有 agent 实例）经 tryMembership 核对；
// scope 解析只有 sessionId，统一用自管 roster 的 childId 精确匹配（spawn 时记录，等价可信）。

/**
 * 把当前 session 解析为 ProjectRef。这是唯一 scope seam。
 * @param ctx Cordis host context（需要 sessions 服务）
 * @param sessionId 当前会话 id —— 客户端只能提交这一项
 * @param opts.store Project Store（resolveProjectRef 用；测试注入）
 */
export function resolveProjectContext(ctx, sessionId, opts = {}) {
  const sid = String(sessionId || '')
  if (!sid) return { ok: false, code: 'unknown-session', message: '缺少会话 id' }
  if (!ctx) return { ok: false, code: 'unknown-session', message: '宿主上下文不可用' }
  let sessions = null
  try {
    sessions = ctx.get('sessions')
  } catch {
    try {
      sessions = ctx.sessions
    } catch {
      sessions = null
    }
  }
  let session = null
  let noSessionService = false
  if (!sessions || typeof sessions.get !== 'function') {
    // 无 sessions 服务（纯 host/headless 组合）：把调用者视作独立 root 会话——
    // sessionId 来自宿主 agent（host 侧事实），隔离语义不变；web 组合始终有 sessions。
    noSessionService = true
  } else {
    try {
      session = sessions.get(sid)
    } catch (err) {
      log(`sessions.get failed: ${err && err.message}`)
      session = undefined
    }
    if (!session) return { ok: false, code: 'unknown-session', message: `会话 ${sid} 不在线` }
  }

  const header = noSessionService ? { id: sid, parentSession: null } : (session.header || {})
  const parentSessionId = header.parentSession ? String(header.parentSession) : null

  // 队友证据：roster 的 childId 精确匹配（scope 解析只有 sessionId，拿不到 agent 实例，
  // 官方 tryMembership(agent) 无法在此调用；自管 roster 的 childId 即子会话 id，等价可信）。
  let teammateOf = null
  const members = rosterMembers()
  const member = members.find((m) => String(m.childId || '') === sid)
  if (member && member.parentSessionId) {
    teammateOf = String(member.parentSessionId)
  }

  const store = opts.store || null
  if (teammateOf) {
    // 队友与队长共用 root；绑定来自队长的 root session，不来自队友自己。
    const binding = store ? store.bindingOfRootSession(teammateOf) : null
    return {
      ok: true,
      ref: {
        projectId: binding ? binding.projectId : null,
        rootSessionId: teammateOf,
        currentSessionId: sid,
        relationship: 'teammate',
        capabilities: { read: true, propose: true, writePaper: false, dispatch: false },
      },
    }
  }

  if (parentSessionId) {
    // 普通 fork / 非成员子代理：写时复制隔离。父项目的绑定不继承（首版无自动 merge）。
    // L2：fork 的能力标志全 false——其写能力只能经"新建项目/显式 attach"流程显式授予。
    return {
      ok: true,
      ref: {
        projectId: null,
        rootSessionId: sid,
        currentSessionId: sid,
        relationship: 'fork',
        forkOf: parentSessionId,
        capabilities: { read: false, propose: false, writePaper: false, dispatch: false },
      },
    }
  }

  // root session：查自己的绑定（primary 或 attached）。
  const binding = store ? store.bindingOfRootSession(sid) : null
  if (binding) {
    const isCaptain = binding.primaryRootSessionId === sid
    return {
      ok: true,
      ref: {
        projectId: binding.projectId,
        rootSessionId: binding.primaryRootSessionId,
        currentSessionId: sid,
        relationship: isCaptain ? 'root' : 'attached',
        capabilities: {
          read: true,
          propose: true,
          writePaper: isCaptain,
          dispatch: isCaptain,
        },
      },
    }
  }
  return {
    ok: true,
    ref: {
      projectId: null,
      rootSessionId: sid,
      currentSessionId: sid,
      relationship: 'unbound',
      capabilities: { read: true, propose: true, writePaper: true, dispatch: true },
    },
  }
}

// ---- 写权限断言（领域边界，供 execute 前调用）--------------------------------
export const CAPABILITY_ERRORS = {
  'no-project': '当前会话尚未绑定科研项目',
  'forbidden': '当前会话没有论文语义写权限（成员只能提交提案与任务回报）',
  'fork-isolated': '普通 fork 与父项目写时复制隔离，不能直接写入父项目',
}

export function assertPaperWriteAllowed(ref) {
  if (!ref || !ref.capabilities) return { ok: false, code: 'no-project' }
  if (ref.relationship === 'fork') return { ok: false, code: 'fork-isolated' }
  if (!ref.capabilities.writePaper) return { ok: false, code: 'forbidden' }
  return { ok: true }
}

export function assertReadAllowed(ref) {
  if (!ref || !ref.capabilities) return { ok: false, code: 'no-project' }
  if (ref.relationship === 'fork') return { ok: false, code: 'fork-isolated' }
  if (!ref.capabilities.read) return { ok: false, code: 'forbidden' }
  return { ok: true }
}

// ---- 台账条目的项目归属（路线 B T1）--------------------------------------------
// reviews.json / figures.json / figure-plans.json 是升级前的全局 JSON 台账。
// 归属判定优先级（唯一授权仍是 session→ProjectRef）：
//   1. 记录显式携带 projectId（T1 之后的新写入）——必须与当前 ref.projectId 相同；
//   2. 记录显式携带 rootSessionId（派单任务、图件/图件计划新写入）——必须与
//      当前 ref.rootSessionId 相同；
//   3. 记录的 sessionId 是稳定链接：经 roster（成员 childId→父会话）或 Project Store
//      的 root 绑定解析出 rootSessionId（能唯一确定时同时得到 projectId）——视为已回填；
//   4. 都无法确定 → legacy-unscoped：只在 legacy 只读视图出现，不进入任何项目卡片。
// 注意：不得用跨项目重复的 res-N 或“未绑定 Result”推断归属。
function rosterRootMap() {
  const map = new Map()
  for (const m of rosterMembers()) {
    if (m.childId && m.parentSessionId) map.set(String(m.childId), String(m.parentSessionId))
  }
  return map
}

export function projectAttributionOf(ref) {
  return {
    projectId: ref && ref.projectId ? String(ref.projectId) : null,
    rootSessionId: ref && ref.rootSessionId ? String(ref.rootSessionId) : null,
  }
}

/**
 * 创建一个带缓存的台账作用域解析器（一次请求内解析 roster/绑定，避免逐条读盘）。
 * @param opts.store Project Store（读取 root 绑定；测试可注入）
 */
export function createRecordScopeResolver({ store } = {}) {
  const rootCache = new Map()
  const memberRoots = rosterRootMap()
  const bindingOf = (rootSessionId) => {
    if (!store || typeof store.bindingOfRootSession !== 'function') return null
    try {
      return store.bindingOfRootSession(String(rootSessionId)) || null
    } catch {
      return null
    }
  }
  const rootSessionIdOf = (sessionId) => {
    const sid = String(sessionId || '')
    if (!sid) return null
    if (rootCache.has(sid)) return rootCache.get(sid)
    let root = memberRoots.get(sid) || null
    if (!root) {
      const binding = bindingOf(sid)
      root = binding && binding.primaryRootSessionId ? String(binding.primaryRootSessionId) : null
    }
    // 普通 root 会话是自己的 root；无法证明是成员子会话时按自身处理（仍不会跨项目匹配）。
    if (!root) root = sid
    rootCache.set(sid, root)
    return root
  }
  function scopeOf(record) {
    if (!record || typeof record !== 'object') {
      return { projectId: null, rootSessionId: null, source: 'invalid' }
    }
    const projectId = record.projectId ? String(record.projectId) : null
    const rootSessionId = record.rootSessionId ? String(record.rootSessionId) : null
    if (projectId || rootSessionId) return { projectId, rootSessionId, source: 'attributed' }
    if (record.sessionId) {
      const root = rootSessionIdOf(record.sessionId)
      if (root) {
        const binding = bindingOf(root)
        return {
          projectId: binding && binding.projectId ? String(binding.projectId) : null,
          rootSessionId: root,
          source: 'session-link',
        }
      }
    }
    return { projectId: null, rootSessionId: null, source: 'legacy-unscoped' }
  }
  function inScope(record, ref) {
    if (!record || !ref) return false
    const scope = scopeOf(record)
    if (scope.projectId) return Boolean(ref.projectId) && String(scope.projectId) === String(ref.projectId)
    if (scope.rootSessionId) return Boolean(ref.rootSessionId) && String(scope.rootSessionId) === String(ref.rootSessionId)
    return false
  }
  return { rootSessionIdOf, scopeOf, inScope }
}

// 单条判定便捷入口（少量记录/测试用；批量过滤请复用 createRecordScopeResolver）。
export function isRecordInProjectScope(record, ref, { store } = {}) {
  if (!record || !ref) return false
  return createRecordScopeResolver({ store }).inScope(record, ref)
}

// ---- 首写建项目（设计 §7.2.1）--------------------------------------------------
// 只看卡片、点技能或普通聊天不得制造空项目：只有第一笔持久写（ensureProject 显式调用）
// 才创建 project + captain 绑定。队友的队长 root 未绑定时返回 needs-binding（不猜测归属）。
export function ensureProject(ctx, sessionId, { store, title = '' } = {}) {
  const scope = resolveProjectContext(ctx, sessionId, { store })
  if (!scope.ok) return scope
  const ref = scope.ref
  if (ref.projectId) return { ok: true, ref, created: false }
  if (ref.relationship === 'fork') return { ok: false, code: 'fork-isolated', message: CAPABILITY_ERRORS['fork-isolated'] }
  if (ref.relationship === 'teammate') return { ok: false, code: 'needs-binding', message: '队长的会话尚未绑定项目；请在队长会话中建立研究问题后再协作' }
  if (!ref.capabilities.writePaper) return { ok: false, code: 'forbidden', message: CAPABILITY_ERRORS.forbidden }
  const fact = workspaceFactOf(ctx, ref.rootSessionId)
  const workspaceKey = fact.status === 'unique' ? workspaceKeyOf(fact.path) : ''
  const projectId = store.createProject({ rootSessionId: ref.rootSessionId, title, workspaceKey })
  const reread = resolveProjectContext(ctx, sessionId, { store })
  return { ok: true, ref: reread.ref || { ...ref, projectId }, created: true }
}
