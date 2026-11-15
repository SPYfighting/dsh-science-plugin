// dsh-science — 科研团队（自研实现，建在稳定的 ctx.subagents spawn/fork 原语上）
// 说明：npm 的 experimental agent-team 包（0.1.5-alpha.2）与 dsh 0.2.2-rc.1 不兼容（启动即禁用），
// 因此参照 agent-teams 插件的做法：成员 = 命名子代理（spawn, fresh context, delivery 'parent'），
// 任务板 = 本插件文件状态（$DSH_HOME/dsh-science/team.json + 工作区镜像），派发 = 建任务 + sendMessage 唤醒成员。
// 队长 = 主会话（lead），Router 约束由 index.js 的 systemPrompt section 提供。

import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { dataDirOf, blockedGateOf } from './store.js'
import { normalizedBlockedBy } from './dag.js'
import { ROLES, DEFAULT_TEAM, rolePrompt, roleLabel } from './roles.js'
import { alignTaskToResult, pruneTasksFromResults } from './blueprint.js'
import { readScope, blueprintViewOf, sessionIdOf } from './project-adapter.js'
import { resolveProjectContext } from './project-context.js'
import { assertDispatchGate } from './project-domain.js'
import { ensureRouterSection } from './router.js'
// v0.9.0 角色级 skill 菜单：spawn 提示词末尾追加「扩展技能库」段（已安装技能 INDEX.md 路径清单）
// + simulator 专属的通用计算模拟规范（新工具上手 8 步规范绝对路径）。技能不进全局 registry，
// 只经这段提示词对对应角色成员生效（跨角色隔离），成员用读文件工具按需取用。
import { roleSkillSectionText, universalOnboardingText, formatSkillWakeText, setMemberWakeHook } from './skillmenu.js'

function log(msg) {
  console.log(`[dsh-science team] ${msg}`)
}

const teamFile = () => join(dataDirOf(), 'team.json')

// T2：registerTeamTools 注入的 Project Store。旧全局团队台账（成员无 parentSessionId、
// 任务无 rootSessionId）在升级时只有能唯一确定所属 root 才回填，否则保持 legacy-unscoped。
let activeStore = null

const REVIEW_SCOPES = ['turn', 'computation', 'evidence', 'journal']
const REVIEW_SCOPE_TEXT = {
  turn: '审查最近一轮回复：数字溯源/断言-执行一致性/伪造迹象。',
  computation: '审查计算过程：软件版本、参数、随机种子、收敛证据四要素；输入文件是否经过查手册协议。',
  evidence: '审查文章证据：每个 claim 的证据链、图表与描述一致性（表格程序化解析）。',
  journal: '期刊审稿模拟：以目标期刊审稿人视角出 major/minor 意见（新颖性/方法/统计/结论强度）。',
}
// 依赖闸门的「终态」：failed/cancelled 也已结束，若仍视为未满足会让下游任务永久卡死。
const DONE_STATUSES = new Set(['completed', 'failed', 'cancelled', 'deleted'])

// 队长协议懒注册（v0.6.0 fix1）：全局 section 已删，协议单一来源在 lib/router.js（scoped）。
// 队长调用建队/派单工具时补挂一次（ensureRouterSection 内部有幂等与成员豁免守卫）。
function ensureLeadProtocol(ctx, exec) {
  try {
    ensureRouterSection(ctx, exec && exec.agent)
  } catch {
    /* 注册失败不影响工具执行 */
  }
}

// 任务板损坏隔离（X3，对齐 blueprint fix4）：解析失败或结构非法（members/tasks 缺失或非数组）
// → 坏文件改名备份为 team.json.corrupt-<ts>（quarantine，备份保留）+ console.error 报警，
// 返回空任务板。文件不存在（首跑常态）不算损坏。
function quarantineTeam(reason) {
  const backupName = `team.json.corrupt-${Date.now()}`
  try {
    renameSync(teamFile(), join(dataDirOf(), backupName))
    console.error(`[dsh-science team] team.json ${reason}，已隔离备份为 ${backupName}`)
  } catch (berr) {
    console.error(`[dsh-science team] team.json ${reason}且隔离备份失败（${berr && berr.message}）`)
  }
}

// T2：旧全局团队台账的迁移归属。
// 升级前 members 只有 parentSessionId、tasks 只有可选的 rootSessionId；它们没有 projectId。
// 只有稳定链接能唯一确定 root 时才回填（成员父会话链 / 任务唯一同名成员）；其余一律标
// legacy-unscoped：不进入任何项目视图，也不参与项目内工具查找。禁止用“当前只有一个项目”
// 之类的安装形状推断归属——项目可能建立在旧数据之后。

function attributedMember(member, scope) {
  if (scope && (scope.projectId || scope.rootSessionId)) {
    return {
      ...member,
      projectId: member.projectId ? String(member.projectId) : (scope.projectId || null),
      rootSessionId: member.rootSessionId ? String(member.rootSessionId) : (scope.rootSessionId || null),
    }
  }
  return { ...member, legacyUnscoped: true }
}

// 条目级归一（H2）+ 项目归属迁移（T2）：合法顶层形状也可能夹带 null/标量成员或任务、
// blockedBy 非数组；这些条目无法被任何工具使用，读档时直接剔除/归一。
// opts.store：调用方注入的 Project Store（保留给迁移/调试；归属迁移只依据稳定链接）。
export function sanitizeTeamState(parsed, opts = {}) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { members: [], tasks: [], taskSeq: 0 }
  }
  const rawMembers = (Array.isArray(parsed.members) ? parsed.members : []).filter(
    (m) => m && typeof m === 'object' && typeof m.name === 'string',
  )
  const rawTasks = (Array.isArray(parsed.tasks) ? parsed.tasks : [])
    .filter((t) => t && typeof t === 'object' && typeof t.id === 'string')
    .map((t) => ({ ...t, blockedBy: normalizedBlockedBy(t) }))

  const byChildId = new Map()
  for (const m of rawMembers) if (m.childId) byChildId.set(String(m.childId), m)
  const resolvedRoots = new Map()
  const resolving = new Set()
  const scopeOfMember = (member) => {
    if (!member) return null
    if (resolvedRoots.has(member)) return resolvedRoots.get(member)
    if (resolving.has(member)) return null // 环形 parent 链：不猜测归属
    resolving.add(member)
    let scope = null
    if (member.projectId || member.rootSessionId) {
      scope = {
        projectId: member.projectId ? String(member.projectId) : null,
        rootSessionId: member.rootSessionId ? String(member.rootSessionId) : null,
      }
    } else if (member.parentSessionId) {
      const parent = byChildId.get(String(member.parentSessionId))
      const parentScope = parent ? scopeOfMember(parent) : null
      scope = parentScope && (parentScope.projectId || parentScope.rootSessionId)
        ? parentScope
        : { projectId: null, rootSessionId: String(member.parentSessionId) }
    }
    resolving.delete(member)
    resolvedRoots.set(member, scope)
    return scope
  }
  const members = rawMembers.map((member) => attributedMember(member, scopeOfMember(member)))

  const membersByName = new Map()
  for (const member of members) {
    const key = String(member.name)
    if (!membersByName.has(key)) membersByName.set(key, [])
    membersByName.get(key).push(member)
  }
  const tasks = rawTasks.map((task) => {
    if (task.projectId || task.rootSessionId) return task
    // 旧任务能由唯一同名成员唯一确定 root 时回填（审查任务尤其依赖这条迁移路径）。
    const candidates = (membersByName.get(String(task.assignee || '')) || []).filter((m) => m.rootSessionId && !m.legacyUnscoped)
    const roots = [...new Set(candidates.map((m) => String(m.rootSessionId)))]
    if (roots.length === 1) {
      const owner = candidates.find((m) => String(m.rootSessionId) === roots[0])
      return {
        ...task,
        projectId: owner && owner.projectId ? String(owner.projectId) : null,
        rootSessionId: roots[0],
      }
    }
    return { ...task, legacyUnscoped: true }
  })
  return {
    ...parsed,
    members,
    tasks,
    taskSeq: typeof parsed.taskSeq === 'number' ? parsed.taskSeq : 0,
  }
}

function loadTeam() {
  let raw = null
  try {
    raw = readFileSync(teamFile(), 'utf8')
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.error(`[dsh-science team] team.json read failed (treated as empty): ${err && err.message}`)
    }
    return { members: [], tasks: [], taskSeq: 0 }
  }
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    quarantineTeam(`解析失败（${err && err.message}）`)
    return { members: [], tasks: [], taskSeq: 0 }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.members) || !Array.isArray(parsed.tasks)) {
    quarantineTeam('结构非法（不是任务板对象或缺 members/tasks 数组）')
    return { members: [], tasks: [], taskSeq: 0 }
  }
  const clean = sanitizeTeamState(parsed, { store: activeStore })
  // v0.8.0：taskSeq 与现存 task-N 最大序号对齐（同 lib/blueprint.js normalizeIdSeq 思路）——
  // 历史会话/并发写回可能让 taskSeq 落后于实际任务数（实测：34 条任务 taskSeq=31），再派发
  // 就会生成重复 task-N id（presenter 首派即撞 task-31）。读档即对齐，一次性自愈。
  let maxTaskSeq = 0
  for (const t of clean.tasks) {
    const m = /^task-(\d+)$/.exec(t.id)
    if (m) maxTaskSeq = Math.max(maxTaskSeq, Number(m[1]))
  }
  if (maxTaskSeq > clean.taskSeq) {
    log(`taskSeq ${clean.taskSeq} 落后于现存最大 task id（task-${maxTaskSeq}），读档对齐`)
    clean.taskSeq = maxTaskSeq
  }
  return clean
}

// T2：成员身份 = (rootSessionId, name)。同一显示名可在不同项目各有一份；查找从不跨 root。
function memberRootOf(member) {
  return member && member.rootSessionId ? String(member.rootSessionId) : null
}

function findMember(state, rootSessionId, memberName) {
  const root = String(rootSessionId || '')
  if (!root) return null
  return (state.members || []).find(
    (m) => m && String(m.name) === String(memberName) && memberRootOf(m) === root,
  ) || null
}

function membersInRoot(state, rootSessionId) {
  const root = String(rootSessionId || '')
  if (!root) return []
  return (state.members || []).filter((m) => m && memberRootOf(m) === root)
}

// 不依赖 agent 实例的 root 解析（技能唤醒等模块级调用用）：优先 roster 的父会话，
// 其次 Project Store 的 root 绑定；都不命中时视为独立 root 会话自身。
function rootSessionIdOfAgent(ctx, agent, store) {
  const sid = sessionIdOf({ agent })
  if (!sid) return null
  const scope = resolveScopeOf(ctx, sid, store)
  return scope && scope.rootSessionId ? String(scope.rootSessionId) : String(sid)
}

function resolveScopeOf(ctx, sessionId, store) {
  const s = String(sessionId || '')
  if (!s) return null
  try {
    const scope = resolveProjectContext(ctx, s, { store })
    return scope && scope.ok ? scope.ref : null
  } catch {
    return null
  }
}

// 唤醒单个成员：signal 必传（SubagentSendMessageOptions.signal 必填，dispose 竞态下
// deliverFollowup 调 options.signal.throwIfAborted()）；任何 throw 一律视为失败——
// 不再特判 throwIfAborted（v0.11.0 HIGH-1：该分支只覆盖假阳性路径，真实投递从未发生）。
// T2：成员按 (rootSessionId, name) 查找——跨项目同名成员不会被误唤醒。
async function wakeMember(ctx, agent, memberName, text, { rootSessionId = null, store = null } = {}) {
  const state = loadTeam()
  const root = rootSessionId || rootSessionIdOfAgent(ctx, agent, store)
  const m = root ? findMember(state, root, memberName) : null
  const childId = m && m.childId
  if (!childId) {
    return { woken: false, error: `成员 ${memberName} 不在当前项目（或未记录 childId）。先在本项目 sci_team_spawn，不要跨项目唤醒。` }
  }
  try {
    await ctx.subagents.sendMessage(
      agent, childId, [{ type: 'text', text }],
      { signal: AbortSignal.timeout(15000) },
    )
    return { woken: true }
  } catch (err) {
    const msg = String(err && err.message)
    // HIGH-3：跨会话成员不可达（UNAUTHORIZED）→ 清除过期 childId；成员身份（root+name）保留，
    // 下次 spawn 会在本项目内重新激活同一成员。
    if (msg.includes('not belong') || msg.includes('unauthorized') || msg.includes('UNAUTHORIZED')) {
      if (m) {
        m.childId = null
        m.parentSessionId = null
        try {
          // L12：与 persist 同款原子写（tmp+rename），避免崩溃窗口损坏 roster
          const text = JSON.stringify(state, null, 2)
          const tmp = `${teamFile()}.tmp`
          try {
            writeFileSync(tmp, text, 'utf8')
            renameSync(tmp, teamFile())
          } catch {
            writeFileSync(teamFile(), text, 'utf8')
          }
        } catch { /* 清除失败不影响错误上报 */ }
        log(`stale childId cleared for ${memberName}@${root} (cross-session): ${msg}`)
      }
      return { woken: false, error: `成员 ${memberName} 属于其他父会话（childId 已清除，请重新 sci_team_spawn）：${msg}`, staleMember: true }
    }
    return { woken: false, error: msg }
  }
}

// spawn 后新装 skill 自动唤醒（brief 待办 8）：只唤醒当前 root 下已 spawn 的本角色成员。
export async function wakeRoleMembers(ctx, agent, role, entry, opts = {}) {
  const store = opts.store || activeStore
  const root = rootSessionIdOfAgent(ctx, agent, store)
  const state = loadTeam()
  const targets = root ? membersInRoot(state, root).filter((m) => m && m.role === role && m.childId) : []
  const text = formatSkillWakeText(entry)
  const woken = []
  const failed = []
  for (const m of targets) {
    const r = await wakeMember(ctx, agent, m.name, text, { rootSessionId: root, store })
    if (r.woken) woken.push(m.name)
    else failed.push({ name: m.name, error: r.error || 'unknown' })
  }
  log(`skill auto-wake: role=${role} root=${root || '?'} targets=${targets.length} woken=${woken.length} failed=${failed.length}`)
  return { woken, failed, targets: targets.length }
}

export function registerTeamTools(ctx, opts = {}) {
  const mirror = opts.mirror
  const store = opts.store || null
  activeStore = store

  // 原子写：先写 .tmp 再 renameSync 覆盖目标（rename 失败时退回直接写，避免状态丢失）
  function persist(state, exec) {
    const text = JSON.stringify(state, null, 2)
    const tmp = `${teamFile()}.tmp`
    try {
      writeFileSync(tmp, text, 'utf8')
      renameSync(tmp, teamFile())
    } catch (err) {
      log(`atomic persist fallback: ${err && err.message}`)
      writeFileSync(teamFile(), text, 'utf8')
    }
    if (mirror) mirror('team.json', text, exec)
  }

  // ---- 项目作用域（T2）--------------------------------------------------------
  // 所有团队工具先经这里解析当前 ProjectRef（服务端 session→scope 唯一 seam）；
  // 成员按 (rootSessionId, name) 查找，任务按 projectId/rootSessionId 判定归属。
  function scopeOfExec(exec) {
    const scopeRead = (() => {
      try {
        const r = readScope(ctx, exec, { store })
        return r && r.ok ? r.ref : null
      } catch {
        return null
      }
    })()
    if (scopeRead) return scopeRead
    const sid = sessionIdOf(exec)
    return sid
      ? { projectId: null, rootSessionId: String(sid), currentSessionId: String(sid), relationship: 'unknown', capabilities: { read: false, propose: false, writePaper: false, dispatch: false } }
      : null
  }
  function requireScope(exec) {
    const ref = scopeOfExec(exec)
    if (!ref) throw new Error('无法确定调用者：无法解析当前会话作用域（需要主会话/成员上下文）')
    return ref
  }
  function attributionOf(ref) {
    return {
      projectId: ref && ref.projectId ? String(ref.projectId) : null,
      rootSessionId: ref && ref.rootSessionId ? String(ref.rootSessionId) : null,
    }
  }
  function taskInScope(task, ref) {
    if (!task || !ref) return false
    if (task.projectId) return Boolean(ref.projectId) && String(task.projectId) === String(ref.projectId)
    if (task.rootSessionId) return Boolean(ref.rootSessionId) && String(task.rootSessionId) === String(ref.rootSessionId)
    // 旧全局任务板：只有尚未绑定项目、且不是隔离 fork 的会话保留兼容维护路径；
    // 一旦存在项目绑定，任务必须显式归属才能进入项目视图或工具作用域。
    return !ref.projectId && ref.relationship !== 'fork'
  }
  function memberInScope(member, ref) {
    if (!member || !ref) return false
    if (member.projectId) return Boolean(ref.projectId) && String(member.projectId) === String(ref.projectId)
    if (member.rootSessionId) return Boolean(ref.rootSessionId) && String(member.rootSessionId) === String(ref.rootSessionId)
    return !ref.projectId && ref.relationship !== 'fork'
  }
  const wakeInScope = (ref) => (agent, memberName, text) =>
    wakeMember(ctx, agent, memberName, text, { rootSessionId: ref && ref.rootSessionId ? ref.rootSessionId : null, store })

  // M1（M2 安全审查）：调用者身份断言——队长=不在 roster 的调用者；成员=childId 命中 roster。
  // 任务板是派单闸门与覆盖分析的执行事实源：成员只能推进自己名下任务到执行中/失败，
  // completed/cancelled/deleted 与删除/群发一律队长（整合与清理是队长的论文语义职责）。
  function callerOf(exec) {
    const agent = exec && exec.agent
    if (!agent) return { kind: 'anonymous' }
    const callerId = String(agent.id || '')
    const state = loadTeam()
    // childId 是全局唯一子会话 id，因此可用于证明成员身份；成员所属项目由记录里的
    // rootSessionId/projectId 决定（调用者不能用一个 childId 冒充其他 root 的成员）。
    const member = state.members.find((m) => m && m.childId && String(m.childId) === callerId)
    return member ? { kind: 'member', member, agent } : { kind: 'lead', agent }
  }
  function assertLead(exec, action) {
    const caller = callerOf(exec)
    if (caller.kind === 'member') {
      throw new Error(`只有队长可以${action}；当前调用者是团队成员 ${caller.member.name}。请把请求发回队长，由队长核对后执行。`)
    }
    // 安全复核：'lead' 原先只表示「不在 roster 里」，附挂（attached）只读会话也满足，
    // 因此必须再校验派单能力，否则只读会话能借队长身份建成员/改任务。
    // 只拒绝明确受限的关系：attached（附挂只读）、teammate（成员已在上分支拦下）、
    // fork（写时复制隔离）。root / unbound（独立根会话）/ unknown（无 session 服务）保留队长能力。
    const ref = scopeOfExec(exec)
    const relationship = ref && ref.relationship
    if (relationship === 'fork') {
      throw new Error(`只有队长可以${action}；fork 与父项目写时复制隔离，不能改动任务板。`)
    }
    if (relationship === 'attached' || relationship === 'teammate') {
      throw new Error(`只有队长可以${action}；当前会话没有派单权限（附挂会话只读）。`)
    }
    return caller
  }

  // T2：统一派单内核——普通派单与审查派单共用创建、持久化、唤醒、claimed、蓝图对齐
  // 与失败补偿（对齐失败清除 resultId 标记，唤醒失败任务保持 pending）。
  async function dispatchTask(exec, ref, {
    subject,
    desc,
    assignee = null,
    blockedBy = [],
    resultIds = [],
    isReview = false,
    taskRole = null,
  } = {}) {
    const agent = exec && exec.agent
    const state = loadTeam()
    state.taskSeq = (state.taskSeq || 0) + 1
    const id = `task-${state.taskSeq}`
    const ids = [...new Set((Array.isArray(resultIds) ? resultIds : []).map((value) => String(value || '').trim()).filter(Boolean))]
    const task = {
      id,
      subject: String(subject || '').slice(0, 200),
      desc: String(desc || '').slice(0, 4000),
      assignee: assignee ? String(assignee) : null,
      status: 'pending',
      blockedBy: (Array.isArray(blockedBy) ? blockedBy : []).map(String),
      ...(isReview ? { isReview: true } : {}),
      // 双向对齐回写（v0.6.0 fix5/X4）：task 对象也记录 resultId/resultIds
      //（团队 tab 任务行据此显示 res-N 徽章；对齐失败时清除该标记）。
      resultId: ids.length > 0 ? ids[0] : null,
      resultIds: ids,
      taskRole: taskRole || (ids.length > 1 ? 'shared' : 'result_specific'),
      ...attributionOf(ref),
      createdAt: Date.now(),
    }
    state.tasks.push(task)
    // 任务板截断（>200）：同时把被截掉的 task id 从蓝图 result.tasks 里摘除（防死引用）
    if (state.tasks.length > 200) {
      const removed = state.tasks.slice(0, state.tasks.length - 200).map((t) => t && t.id).filter(Boolean)
      state.tasks = state.tasks.slice(-200)
      if (removed.length > 0) {
        try {
          pruneTasksFromResults(ctx, removed, { store, exec, mirror })
        } catch (err) {
          log(`prune truncated tasks from blueprint failed: ${err && err.message}`)
        }
      }
    }
    persist(state, exec)
    let wakeResult = { woken: false }
    let taskAfterWake = task
    if (task.assignee) {
      const wakeText = `${isReview ? '新审查任务' : '新任务'} ${id}：${task.subject}\n\n${task.desc}${task.blockedBy.length ? `\n（依赖：${task.blockedBy.join(', ')}，若未完成请先在任务板确认）` : ''}\n\n完成后把结果作为消息发回队长。`
      wakeResult = await wakeInScope(ref)(agent, task.assignee, wakeText)
      if (wakeResult.woken) {
        // 唤醒成功即视为成员已领任务：pending → claimed（持久化到任务板）
        // 读-改-写：唤醒期间成员侧可能已回写任务板，先重读 state 再改，避免用 stale 副本覆盖
        const st2 = loadTeam()
        const t2 = st2.tasks.find((x) => x.id === id)
        if (t2) {
          t2.status = 'claimed'
          t2.claimedAt = Date.now()
          persist(st2, exec)
          taskAfterWake = t2
        }
      }
    }
    log(`task dispatched: ${id}@${ref.rootSessionId || '?'} → ${task.assignee || 'unowned'} (${taskAfterWake.status})`)
    // 文章蓝图对齐（v0.6.0）：带 result 时把任务挂到对应 result（对齐失败不阻断派发，只回报原因）。
    // 单 Result 保持对象形状（审查派单既有契约），多 Result 返回逐项数组。
    let alignment = null
    if (ids.length > 0) {
      try {
        alignment = ids.length === 1
          ? alignTaskToResult(ctx, id, ids[0], { store, exec, mirror })
          : ids.map((selectedId) => alignTaskToResult(ctx, id, selectedId, { store, exec, mirror }))
      } catch (err) {
        log(`blueprint align failed for ${id} → ${ids.join(',')}: ${err && err.message}`)
        alignment = { error: String(err && err.message) }
        // X4：对齐失败不给 task.resultId——回写清除，避免团队 tab 出现指向未对齐 result 的徽章
        try {
          const st3 = loadTeam()
          const t3 = st3.tasks.find((x) => x.id === id)
          if (t3 && (t3.resultId || t3.resultIds)) {
            t3.resultId = null
            t3.resultIds = []
            t3.updatedAt = Date.now()
            persist(st3, exec)
          }
        } catch (e2) {
          log(`clear resultId after failed align for ${id} failed: ${e2 && e2.message}`)
        }
      }
    }
    return { id, task: taskAfterWake, wake: wakeResult, alignment }
  }

  async function spawnMember(exec, role, nameOverride, ref) {
    const def = ROLES[role]
    if (!def) throw new Error(`未知角色 ${role}。可用：${Object.keys(ROLES).join(' | ')}`)
    const agent = exec && exec.agent
    if (!agent) throw new Error('无法确定调用者（需要主会话）')
    if (!ref || !ref.rootSessionId) throw new Error('无法确定当前项目作用域，不能生成团队成员')
    ensureLeadProtocol(ctx, exec)
    const prompt = rolePrompt(role)
    if (!prompt) throw new Error(`角色提示词缺失：${role}`)
    const name = (nameOverride || def.member).toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const state = loadTeam()
    // T2：成员身份是 (rootSessionId, name)。其他项目的同名成员不是冲突，也不同步复用。
    const existing = findMember(state, ref.rootSessionId, name)
    if (existing) {
      // HIGH-3 配套：spawn 按名复用时校验 role 一致（role=writer name=reviewer 会派错角色）。
      if (existing.role && existing.role !== role) {
        throw new Error(`成员 ${name} 在本项目已存在且角色为 ${existing.role}，与请求的 ${role} 不匹配。请换名或先清理该成员。`)
      }
      if (existing.childId) {
        return {
          ok: true,
          name,
          role: existing.role || role,
          childId: existing.childId,
          reused: true,
          note: '成员已存在，复用现有成员（返回 childId）——直接用 sci_team_send 按成员名唤醒即可。',
        }
      }
      // childId 已被 HIGH-3 清理（会话失效）：同一成员身份在本项目内重新激活，不需要改名。
      const reactivated = await activateChild(def, role, name, agent, prompt)
      existing.childId = reactivated
      existing.parentSessionId = (agent && (agent.id || agent.sessionId)) || null
      if (!existing.projectId && ref.projectId) existing.projectId = String(ref.projectId)
      existing.spawnedAt = Date.now()
      persist(state, exec)
      log(`member re-activated: ${name}@${ref.rootSessionId} (${role}) childId=${reactivated}`)
      return { ok: true, name, role, childId: reactivated, reused: true, reactivated: true }
    }
    const childId = await activateChild(def, role, name, agent, prompt)
    state.members.push({
      name,
      role,
      label: def.label,
      childId,
      // F5（v0.7.1）：记录 spawn 时的真实父会话 id（成员会话跳转用——客户端 openMemberSession
      // 优先于「当前主会话」推断；httpdata /state 对 team.members 原样透传）。
      // Agent 身份 = agent.id（dsh-agent/types Agent 接口；sessionId 为旧字段名兜底）
      parentSessionId: (agent && (agent.id || agent.sessionId)) || null,
      ...attributionOf(ref),
      spawnedAt: Date.now(),
    })
    persist(state, exec)
    log(`member spawned: ${name}@${ref.rootSessionId} (${role}) childId=${childId}`)
    return { ok: true, name, role, childId }
  }

  async function activateChild(def, role, name, agent, prompt) {
    // v0.9.0：团队协作规范之后追加 ① simulator 通用模拟规范（新工具 8 步上手）② 该角色已安装
    // 扩展技能的 INDEX.md 索引段（无已安装技能时 roleSkillSectionText 返回 ''，提示词保持精简）。
    const fullPrompt = `${prompt}\n\n${teamProtocolText()}${universalOnboardingText(role)}${roleSkillSectionText(role)}`
    const childId = `sci-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    try {
      const activation = await ctx.subagents.startActivation({
        delivery: 'parent',
        childId,
        provider: 'spawn',
        label: `dsh-science:${role}:${name}`,
        request: {
          prompt: [{ type: 'text', text: fullPrompt }],
          parent: agent,
        },
        signal: AbortSignal.timeout(120000),
      })
      return activation.childId || childId
    } catch (err) {
      log(`spawn FAILED stack: ${err && err.stack}`)
      throw err
    }
  }

  function teamProtocolText() {
    return [
      '## 团队协作规范（dsh-science）',
      '- 你是科研团队的专职成员，由队长（lead）通过消息给你派任务。',
      '- 收到任务消息后：按你的角色提示词执行，完成后把结果作为回复发回（结果会送达队长）。',
      '- 严格遵守角色提示词中的工具纪律与输出合同；超出职责/需要新资源时如实说明，不要编造。',
    ].join('\n')
  }

  // -- 生成成员 ---------------------------------------------------------------
  ctx.tools.register({
    name: 'sci_team_spawn',
    description: `生成科研团队专职成员（可续跑的命名子代理）。role 可选：${Object.keys(ROLES).join(' | ')}。需要主会话调用。`,
    parameters: {
      role: { type: 'string' /*必填*/, description: `角色 id：${Object.keys(ROLES).join(' | ')}` },
      name: { type: 'string', description: '成员名（缺省用角色默认名）' },
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args, exec) {
      assertLead(exec, '生成团队成员')
      const ref = requireScope(exec)
      return spawnMember(exec, String(args.role), args.name ? String(args.name) : undefined, ref)
    },
  })

  // -- 整队生成 ----------------------------------------------------------------
  ctx.tools.register({
    name: 'sci_team_spawn_all',
    description: `按默认科研编制一次性生成全部成员（${DEFAULT_TEAM.join(', ')}）。当前项目已有的跳过。`,
    parameters: {},
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args, exec) {
      assertLead(exec, '生成团队成员')
      const ref = requireScope(exec)
      const results = []
      for (const role of DEFAULT_TEAM) {
        try {
          const def = ROLES[role]
          const state = loadTeam()
          // T2：只看当前 root 的成员——其他项目已有同名默认成员不算“已存在”。
          if (findMember(state, ref.rootSessionId, def.member)) {
            results.push({ name: def.member, role, skipped: true })
            continue
          }
          results.push(await spawnMember(exec, role, def.member, ref))
        } catch (err) {
          results.push({ role, error: String(err && err.message) })
        }
      }
      return { ok: true, results }
    },
  })

  // -- 任务派发 ----------------------------------------------------------------
  ctx.tools.register({
    name: 'sci_team_dispatch',
    description:
      '仅供队长派发科研任务。单一工作传 result_id；共享质控/公共方法传 result_ids，全部目标 Result 与核心的当前修订均须已确认，否则创建任务前拒绝。assignee 填成员名；blocked_by 默认软警告，config.json 设 blockedGate=hard 时依赖未达终态拒绝。',
    parameters: {
      subject: { type: 'string' /*必填*/, description: '任务标题（一句话）' },
      task_desc: { type: 'string' /*必填*/, description: '任务详细描述：目标、输入、期望输出' },
      assignee: { type: 'string', description: '成员名（可缺省=待领）' },
      blocked_by: { type: 'array', description: '依赖任务 id 数组（task-1 等）；依赖须为终态（completed/failed/cancelled）才满足（闸门模式见工具描述）' },
      result_id: { type: 'string' /*必填*/, description: '必填：已获用户确认的文章蓝图 result id（res-N，见 sci_blueprint_overview）；文章核心与该 result 均须 confirmed=true' },
      result_ids: { type: 'array', description: '共享工作可传多个已确认 result id；与 result_id 二选一，重复项自动去除' },
      task_role: { type: 'string', description: 'result_specific | shared；绑定多个 Result 时自动为 shared' },
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args, exec) {
      const agent = exec && exec.agent
      if (!agent) throw new Error('无法确定调用者')
      ensureLeadProtocol(ctx, exec)
      // 任何执行派单都必须落到已确认的文章承诺上；检查发生在 taskSeq 递增前，
      // 因此拒绝不会留下任务板副作用。
      const resultIds = [...new Set([
        ...(Array.isArray(args && args.result_ids) ? args.result_ids : []),
        args && args.result_id,
      ].map((value) => String(value || '').trim()).filter(Boolean))]
      if (resultIds.length === 0) {
        throw new Error('result_id 或 result_ids 为必填项——每个执行任务必须归属至少一个已确认的 Result。先用 sci_blueprint_overview 查看蓝图；缺少结果时用 sci_result_add 创建并确认。')
      }
      const state = loadTeam()
      const callerId = String(agent.id || '')
      const callerMember = state.members.find((m) => m && m.childId && String(m.childId) === callerId)
      if (callerMember) {
        throw new Error(`只有队长可以派单；当前调用者是团队成员 ${callerMember.name || callerId}。请把任务建议发回队长，由队长核对蓝图确认状态后派发。`)
      }
      // 阶段 2：派单硬闸门改由 Project State 强制（核心与全部目标 Result 当前修订已确认）；
      // 断言在任务序号递增前执行——拒绝不产生任务板副作用。
      const scope = readScope(ctx, exec, { store })
      if (!scope.ok) throw new Error(`无法解析派单会话作用域：${scope.message || scope.code}`)
      // M3（语义审查）：正式派单是 captain 职责——attached root（dispatch=false）拒绝
      if (!scope.ref.capabilities || !scope.ref.capabilities.dispatch) {
        throw new Error('只有队长（captain root）可以派发执行任务；当前会话对该项目只有读取/提案权限。')
      }
      if (!scope.snapshot) {
        throw new Error('当前会话尚未绑定科研项目——先建立核心主张与 Result（sci_blueprint_set / sci_result_add）并确认后才能派单。')
      }
      try {
        assertDispatchGate(scope.snapshot, resultIds)
      } catch (err) {
        const msg = String((err && err.message) || err)
        if (/显式携带/.test(msg)) throw new Error('派单必须显式携带 result_id 或 result_ids——每个执行任务必须归属至少一个已确认的 Result。先用 sci_blueprint_overview 查看蓝图；缺少结果时用 sci_result_add 创建并确认。')
        if (/尚未建立/.test(msg)) throw new Error('文章蓝图核心尚未建立——未获用户确认的核心主张不能派发执行任务。先向用户复述核心主张与创新点并获明确同意，再调用 sci_blueprint_confirm kind=core。')
        if (/核心当前修订尚未确认/.test(msg)) throw new Error('文章蓝图核心尚未确认——未获用户确认的核心主张不能派发执行任务。先向用户复述核心主张与创新点并获明确同意，再调用 sci_blueprint_confirm kind=core。')
        throw err
      }
      const ref = scope.ref
      // blocked_by 闸门（v0.11.0）：依赖必须属于当前项目；未达终态 → 默认 warn，
      // config.json blockedGate=hard → 拒绝派发（任务板不新增）。跨项目/不存在按 missing 计。
      const blockedBy = Array.isArray(args.blocked_by) ? args.blocked_by.map(String) : []
      const gateMode = blockedGateOf()
      const unresolvedDeps = blockedBy
        .map((depId) => {
          const dep = state.tasks.find((t) => t && t.id === depId && taskInScope(t, ref))
          return { id: depId, status: dep ? String(dep.status || 'unknown') : 'missing' }
        })
        .filter((d) => !DONE_STATUSES.has(d.status))
      if (gateMode === 'hard' && unresolvedDeps.length > 0) {
        const detail = unresolvedDeps.map((d) => `${d.id}（${d.status === 'missing' ? '不存在或不属于当前项目' : d.status}）`).join('、')
        throw new Error(`依赖未满足，硬闸门拒绝派发：${detail}。先完成依赖任务再派发本任务；如需改为软警告，在 ${join(dataDirOf(), 'config.json')} 设 "blockedGate": "warn"。`)
      }
      // T2：assignee 必须在当前项目内——其他项目的同名成员不是可派单对象，也不要求改名。
      if (args.assignee) {
        const target = findMember(state, ref.rootSessionId, String(args.assignee))
        if (!target) {
          throw new Error(`成员 ${args.assignee} 不在当前项目（属于其他项目的会话），不能跨项目派单。先在本项目 sci_team_spawn。`)
        }
      }
      const dispatched = await dispatchTask(exec, ref, {
        subject: String(args.subject),
        desc: String(args.task_desc || ''),
        assignee: args.assignee ? String(args.assignee) : null,
        blockedBy,
        resultIds,
        taskRole: resultIds.length > 1 || args.task_role === 'shared' ? 'shared' : 'result_specific',
      })
      const out = { ok: true, taskId: dispatched.id, task: dispatched.task, wake: dispatched.wake }
      if (blockedBy.length > 0) out.dependencyGate = { mode: gateMode, unresolved: unresolvedDeps }
      if (dispatched.alignment) out.blueprintAlign = dispatched.alignment
      return out
    },
  })

  // -- 团队状态 ----------------------------------------------------------------
  ctx.tools.register({
    name: 'sci_team_status',
    description: '查看科研团队现状：成员（角色）与任务板（状态/负责人/依赖）。',
    parameters: {},
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args, exec) {
      const ref = requireScope(exec)
      const state = loadTeam()
      return {
        members: state.members.filter((m) => memberInScope(m, ref)).map((m) => ({
          name: String(m.name),
          role: String(m.role || ''),
          label: String(m.label || m.role || m.name),
          // 成员会话跳转只使用当前 root 下的 childId（其他项目的 childId 不下发）。
          childId: m.childId ? String(m.childId) : null,
        })),
        tasks: state.tasks.filter((t) => taskInScope(t, ref)).slice(-50).map((t) => ({
          id: String(t.id),
          subject: String(t.subject || ''),
          status: String(t.status || 'pending'),
          assignee: t.assignee ? String(t.assignee) : null,
          blockedBy: Array.isArray(t.blockedBy) ? t.blockedBy.map(String) : [],
          resultIds: [...new Set([...(Array.isArray(t.resultIds) ? t.resultIds : []), t.resultId].filter(Boolean).map(String))],
          taskRole: t.taskRole === 'shared' ? 'shared' : 'result_specific',
        })),
      }
    },
  })

  // -- 审查派发 ----------------------------------------------------------------
  ctx.tools.register({
    name: 'sci_review_send',
    description:
      '把审查工作派给团队 reviewer 成员（未生成则自动生成）。scope: turn(回答审查) | computation(计算过程) | evidence(文章证据) | journal(期刊审稿模拟)。审查任务默认不要求对齐到蓝图 result（质量闸门，非证据工作）；确需归档到某 result 时可传 result_id。',
    parameters: {
      scope: { type: 'string' /*必填*/, description: 'turn | computation | evidence | journal' },
      target: { type: 'string', description: '审查对象说明（turn 号/文件路径/章节名）' },
      note: { type: 'string', description: '补充要求' },
      result_id: { type: 'string', description: '可选：文章蓝图 result id（res-N）；提供时该审查任务挂入该 result（一般不需要）' },
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args, exec) {
      assertLead(exec, '派发审查任务')
      const scope = String(args.scope || '')
      if (!REVIEW_SCOPES.includes(scope)) {
        throw new Error(`scope 非法：${scope || '（空）'}（可选：${REVIEW_SCOPES.join(' | ')}）`)
      }
      ensureLeadProtocol(ctx, exec)
      const ref = requireScope(exec)
      const state = loadTeam()
      if (!membersInRoot(state, ref.rootSessionId).some((m) => m.role === 'reviewer')) {
        await spawnMember(exec, 'reviewer', ROLES.reviewer.member, ref)
      }
      const scopeText = {
        turn: REVIEW_SCOPE_TEXT.turn,
        computation: REVIEW_SCOPE_TEXT.computation,
        evidence: REVIEW_SCOPE_TEXT.evidence,
        journal: REVIEW_SCOPE_TEXT.journal,
      }[scope]
      // 蓝图深度绑定（v0.9.0 Track 2 B3）：evidence scope 自动带上蓝图 claims 逐条核对清单
      //（蓝图存在且有 result 时）——审查员逐条核对 claim 的证据链，而不是凭印象泛审。
      let claimsSection = ''
      if (scope === 'evidence') {
        try {
          const scopeRead = readScope(ctx, exec, { store })
          const bp = scopeRead.ok && scopeRead.snapshot ? blueprintViewOf(scopeRead.snapshot) : { results: [], core: {} }
          const claimed = (bp.results || []).filter((r) => r && (r.claim || '').trim())
          if (claimed.length > 0) {
            const rows = []
            for (const r of claimed) {
              const claims = (Array.isArray(r.claims) ? r.claims : []).filter((c) => c && c.status !== 'retired' && String(c.text || '').trim())
              const taskText = (Array.isArray(r.tasks) ? r.tasks : []).join('、') || '无'
              const figureText = (Array.isArray(r.figures) ? r.figures : []).join('、') || '无'
              if (claims.length === 0) rows.push(`- ${r.id}@r${r.revision || 1}: ${r.claim}；任务 ${taskText}，图表 ${figureText}`)
              else for (const claim of claims) rows.push(`- ${claim.id}@r${claim.revision || 1}: ${claim.text}；任务 ${taskText}，图表 ${figureText}`)
            }
            claimsSection = `\n\n蓝图 Claim 逐条核对清单（每条都要在 findings 里给出结论，check=blueprint-claim；claim 字段原样填写冒号前稳定标识符）：\n${rows.join('\n')}`
          }
        } catch {
          /* 蓝图缺失/损坏不阻断审查派发 */
        }
      }
      const subject = `[${scope}] 审查：${String(args.target || '最近工作').slice(0, 80)}`
      const desc = `${scopeText}${claimsSection}${args.note ? `\n补充要求：${args.note}` : ''}\n目标对象：${args.target || '最近工作'}\n\n输出 findings JSON。`
      const resultId = args.result_id ? String(args.result_id) : null
      // T2：审查派单与普通派单共用 dispatchTask 内核（创建/落盘/唤醒/claimed/对齐/失败补偿）。
      const dispatched = await dispatchTask(exec, ref, {
        subject,
        desc,
        assignee: 'reviewer',
        blockedBy: [],
        resultIds: resultId ? [resultId] : [],
        isReview: true,
      })
      log(`review dispatched: ${dispatched.id}@${ref.rootSessionId || '?'} (${dispatched.wake.woken ? 'claimed' : 'pending'}${resultId ? ', aligned' : ''})`)
      const out = { ok: true, taskId: dispatched.id, reviewer: 'reviewer', isReview: true, wake: dispatched.wake }
      if (dispatched.alignment) out.blueprintAlign = dispatched.alignment
      return out
    },
  })

  // -- 任务状态回写（队长在成员回报结果后标记完成）--------------------------------
  // X2：status 枚举扩展 cancelled（主动取消，区别于 failed）——coverage 对 cancelled 豁免对齐，
  // 客户端进度图例按灰色计数。
  const TASK_STATUSES = ['pending', 'claimed', 'in_progress', 'completed', 'failed', 'cancelled']
  ctx.tools.register({
    name: 'sci_team_update_task',
    description: '更新团队任务板状态。成员回报结果后由队长调用标记 completed（或 failed/in_progress/cancelled）。task_id 形如 task-3。',
    parameters: {
      task_id: { type: 'string' /*必填*/, description: '任务 id（task-N）' },
      status: { type: 'string' /*必填*/, description: `枚举：${TASK_STATUSES.join(' | ')}` },
      result_note: { type: 'string', description: '结果摘要（可选，记录成员产出要点）' },
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args, exec) {
      const ref = requireScope(exec)
      const state = loadTeam()
      const task = state.tasks.find((t) => t.id === String(args.task_id))
      if (!task) throw new Error(`任务 ${args.task_id} 不存在`)
      const status = String(args.status)
      if (!TASK_STATUSES.includes(status)) {
        throw new Error(`非法 status "${status}"（可用枚举：${TASK_STATUSES.join(' | ')}）`)
      }
      const caller = callerOf(exec)
      // T2：任务必须先属于调用者的项目作用域；跨项目只按“另一个会话”拒绝，不泄漏对方任务内容。
      const callerRef = caller.kind === 'member'
        ? { projectId: caller.member.projectId || ref.projectId || null, rootSessionId: caller.member.rootSessionId || ref.rootSessionId }
        : ref
      if (!taskInScope(task, callerRef)) {
        throw new Error(`任务 ${task.id} 属于另一个会话（${task.rootSessionId || task.projectId || '未归属的旧任务'}），不能跨项目操作任务板。`)
      }
      if (caller.kind === 'member') {
        // 成员仅可推进自己名下任务的执行状态；completed（整合完成）与 cancelled/deleted 由队长决定
        if (task.assignee !== caller.member.name) {
          throw new Error(`成员只能更新自己名下的任务；任务 ${task.id} 的负责人是 ${task.assignee || '（未分配）'}。`)
        }
        if (!['in_progress', 'failed'].includes(status)) {
          throw new Error(`成员只能把任务标记为 in_progress | failed；completed/cancelled 由队长核对回报后统一标记。请把结果发回队长。`)
        }
      }
      task.status = status
      if (args.result_note) task.result = String(args.result_note).slice(0, 2000)
      task.updatedAt = Date.now()
      persist(state, exec)
      return { ok: true, taskId: task.id, status: task.status }
    },
  })

  // -- 任务删除（X2）：标记 deleted（tombstone 保留在任务板上）+ 从蓝图 result.tasks 摘除 ----
  // 与 cancelled 的区别：deleted 表示"这条任务不该存在"（误派/废弃），终态且从文章归属中摘除；
  // 记录仍保留（墓碑），进度图例按灰色计数，审计可查。
  ctx.tools.register({
    name: 'sci_team_delete_task',
    description:
      '删除团队任务板上的任务：任务标记 deleted（墓碑保留，可审计），并从文章蓝图 result.tasks 中摘除对齐（若有）。误派/废弃任务用本工具清理；status 已是 deleted 时幂等返回。',
    parameters: {
      task_id: { type: 'string' /*必填*/, description: '任务 id（task-N）' },
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args, exec) {
      assertLead(exec, '删除任务')
      const ref = requireScope(exec)
      const state = loadTeam()
      const task = state.tasks.find((t) => t.id === String(args.task_id))
      if (!task) throw new Error(`任务 ${args.task_id} 不存在`)
      if (!taskInScope(task, ref)) {
        throw new Error(`任务 ${task.id} 属于另一个会话（${task.rootSessionId || task.projectId || '未归属的旧任务'}），不能跨项目删除。`)
      }
      if (task.status === 'deleted') {
        return { ok: true, taskId: task.id, status: 'deleted', note: '任务已是 deleted（幂等，无变化）。' }
      }
      task.status = 'deleted'
      task.deletedAt = Date.now()
      task.updatedAt = task.deletedAt
      persist(state, exec)
      // 蓝图摘除（调 lib/blueprint.js 摘除逻辑）：从所有 result.tasks 移除该任务 id（幂等）
      let blueprintPrune = { pruned: false }
      try {
        blueprintPrune = { pruned: pruneTasksFromResults(ctx, [task.id], { store, exec, mirror }) }
      } catch (err) {
        log(`blueprint prune failed for ${task.id}: ${err && err.message}`)
        blueprintPrune = { pruned: false, error: String(err && err.message) }
      }
      log(`task deleted: ${task.id}（tombstone 保留）`)
      return { ok: true, taskId: task.id, status: 'deleted', deletedAt: task.deletedAt, blueprintPrune }
    },
  })

  // -- 给成员发消息 --------------------------------------------------------------
  ctx.tools.register({
    name: 'sci_team_send',
    description: '向指定团队成员发消息（唤起其处理）。to 为成员名。',
    parameters: {
      to: { type: 'string' /*必填*/, description: '成员名' },
      message: { type: 'string' /*必填*/, description: '消息内容' },
    },
    output: {
      schema: { type: 'object' },
      render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }],
    },
    async execute(args, exec) {
      const agent = exec && exec.agent
      if (!agent) throw new Error('无法确定调用者')
      assertLead(exec, '向成员发消息')
      const ref = requireScope(exec)
      const wakeResult = await wakeInScope(ref)(agent, String(args.to), String(args.message).slice(0, 4000))
      if (!wakeResult.woken) throw new Error(`成员 ${args.to} 不在当前项目或不可达：${wakeResult.error}`)
      return { ok: true, to: args.to }
    },
  })

  // 新装 skill 自动唤醒：skillmenu.installSkill 成功后回调，按 role 唤醒已 spawn 成员
  setMemberWakeHook((agent, role, entry) => wakeRoleMembers(ctx, agent, role, entry, { store }))

  log('team tools registered (spawn/spawn_all/dispatch/status/review_send/send on ctx.subagents)')
}
