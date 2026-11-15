// dsh-science — web 档案数据通道（工作台面板的 HTTP 数据源）
// 先例：research/agent-teams src/index.ts 经 ctx.webServer 注册 GET /plugins/dsh-agent-teams/state。
// 本文件注册两条路由：
//   1) GET /plugins/dsh-science/state → $DSH_HOME/dsh-science/*.json 汇总 JSON
//      （团队/任务/图表/审查/db profile/SSH 主机/SSH 作业/文章蓝图）+ 工作区文件树（files，
//      以 web 服务器进程 cwd 为根，限深采样）+ 成员实时状态（memberLive：running/idle/offline，
//      经 ctx.agents.get(childId).status 推断，同 agent-teams memberActivity 思路）。
//      v0.6.0：快照新增 blueprint 字段（core/results/narrative/coverage——覆盖分析与
//      sci_blueprint_overview 工具共用 lib/blueprint.js coverageOf 同一实现，口径一致）。
//   2) GET /plugins/dsh-science/file?path=<相对或绝对路径> → 仅服务工作区根（进程 cwd）
//      或 $DSH_HOME/dsh-science 之内的单个文件（防目录穿越：resolve 后做前缀校验；
//      按扩展名给 content-type，单文件上限 20MB），供客户端 <img> 图表预览。
//   3) GET /plugins/dsh-science/assets/<file>.svg → 科研鲸鱼娘吉祥物（assets/mascots/
//      白名单之内，content-type image/svg+xml，长缓存）。
//   4) GET /plugins/dsh-science/review?run=<id>&sessionId=<id> → 单条审查 run 详情（含 findings，
//      剔除 raw）；必须由当前会话解析项目归属，跨项目/不存在统一 404（路线 B T1）。
//      /state 的 reviews 只含摘要，客户端展开审查行时才取详情，避免轮询载荷膨胀。
// web 档案才有 webServer 服务；桌面版没有 → 懒注册 + 探测失败即静默跳过（客户端会降级提示）。
// 鉴权：对齐 agent-teams 的 authenticatedWebRoutes 思路——经 ctx.get('connection').requestRejection(req)
// 复用浏览器会话的认证栅栏（同源 fetch 自带凭证）。

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { dataDirOf, PKG_ROOT_OF } from './store.js'
import { ROLES, LEAD_MASCOT } from './roles.js'
import { loadBlueprint, coverageOf, paperProgressOf, blueprintErrorOf } from './blueprint.js'
import { sanitizeTeamState } from './team.js'
import { reviewCoverageOf } from './reviewcov.js'
import { reviewSummariesOf, reviewRunOf } from './reviewruns.js'
import { decodeSvgText, svgActiveContentReason } from './figures.js'
import { paperSpineViewOf, isConfirmationCurrent } from './paperspine.js'
// 阶段 2：带 sessionId 时返回按会话解析的 Project State 视图（路线 B 主路径）；
// 不带 sessionId 时返回旧全局 JSON 的 legacy 只读视图（升级过渡）。
import { readScope, blueprintViewOf, contentHashOf } from './project-adapter.js'
// 路线 B T1：历史 JSON 台账按稳定项目归属过滤；无法归属的条目只在 legacy 视图出现。
import { resolveProjectContext, createRecordScopeResolver, isRecordInProjectScope } from './project-context.js'
// v0.9.0 角色技能库：/state 快照携带 catalog+installed（客户端勾选菜单）；POST /skill-manage
// 承接客户端勾选/自定义链接的安装与删除（鉴权与 state/file 同款会话栅栏）。
import { installSkill, removeSkill, skillMenuSnapshot } from './skillmenu.js'

function log(msg) {
  console.log(`[dsh-science httpdata] ${msg}`)
}

const WEB_SERVER_KEYS = ['webServer', 'httpServer']
const VERSION = '0.14.0'
const FILE_MAX_BYTES = 20 * 1024 * 1024
const FILE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
}
// 工作区文件树跳过目录（依赖/版本库/本插件状态目录等噪音）
const TREE_SKIP = new Set([
  'node_modules', '.git', '.dsh-home', '.dsh', '.dsh-science', '.cache',
  '.pnpm-store', 'dist', 'build', '.venv', '__pycache__',
])
const TREE_MAX_ENTRIES = 400
const TREE_MAX_DEPTH = 3

// 科研鲸鱼娘 SVG（assets/mascots/）：显式白名单服务（同 agent-teams 资产路由思路，
// 比目录列举 + realpath 更强——名单外一律 404，天然免疫路径穿越）。
const MASCOT_DIR = join(PKG_ROOT_OF(), 'assets', 'mascots')
// v0.7.0：thinking.svg 入列（任务流 DAG 的「有待办任务在身」思考姿态叠加图）
const MASCOT_ALLOWLIST = new Set([LEAD_MASCOT, ...Object.values(ROLES).map((d) => d.mascot), 'working.svg', 'idle.svg', 'thinking.svg'])

function loadJson(name) {
  try {
    return JSON.parse(readFileSync(join(dataDirOf(), name), 'utf8'))
  } catch {
    return null
  }
}

// 递归剔除敏感键（密码类），避免状态接口泄密
function redact(value) {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (/pass(word|phrase)|secret|token|credential/i.test(k)) continue
      if (/url/i.test(k) && typeof v === 'string') {
        try {
          const u = new URL(v)
          if (u.username || u.password) {
            u.username = ''
            u.password = ''
            out[k] = u.toString()
            continue
          }
        } catch { /* 非 URL 字符串照常递归 */ }
      }
      out[k] = redact(v)
    }
    return out
  }
  return value
}

// 键值对象 → 数组（带 name/id 字段，便于客户端渲染）
function toList(obj) {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj).map(([key, value]) => ({
    ...(redact(value) || {}),
    key,
  }))
}

function workspaceRoot() {
  try {
    return resolve(process.cwd())
  } catch {
    return ''
  }
}

// 文件服务允许的根集合：web 服务器进程工作区 + 插件数据目录（收割结果/下载件）
function workspaceRoots() {
  const roots = [workspaceRoot()]
  try {
    roots.push(resolve(dataDirOf()))
  } catch {
    /* ignore */
  }
  return roots.filter((r) => r && typeof r === 'string')
}

// 成员实时状态：agents 服务里能找到 childId 且 status==='running' → running；
// 找到但空闲 → idle；找不到（子代理会话未驻留/插件刚重启）→ 回退推断：
// 任务板上有该成员的 claimed/in_progress 任务 → 'claimed/working'，否则 offline。
function memberLiveOf(ctx, members, tasks) {
  const live = {}
  let agents = null
  try {
    agents = ctx.get('agents')
  } catch {
    agents = null
  }
  const board = Array.isArray(tasks) ? tasks : []
  for (const m of Array.isArray(members) ? members : []) {
    let status = 'offline'
    if (agents && m && m.childId && typeof agents.get === 'function') {
      try {
        const agent = agents.get(m.childId)
        if (agent) status = agent.status === 'running' ? 'running' : 'idle'
      } catch {
        status = 'offline'
      }
    }
    if (status === 'offline') {
      const hasOpenTask = board.some(
        (t) => t && t.assignee === m.name && (t.status === 'claimed' || t.status === 'in_progress'),
      )
      if (hasOpenTask) status = 'claimed/working'
    }
    live[m.name] = status
  }
  return live
}

// 工作区文件树（限深/限量采样，相对路径 posix 分隔；目录 size 记 0）
function listWorkspaceFiles() {
  const root = workspaceRoot()
  if (!root) return []
  const out = []
  const walk = (dir, rel, depth) => {
    if (depth > TREE_MAX_DEPTH || out.length >= TREE_MAX_ENTRIES) return
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (out.length >= TREE_MAX_ENTRIES) return
      if (e.name.startsWith('.') || TREE_SKIP.has(e.name)) continue
      const relPath = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        out.push({ path: relPath, dir: true, size: 0 })
        walk(join(dir, e.name), relPath, depth + 1)
      } else if (e.isFile()) {
        let size = 0
        try {
          size = statSync(join(dir, e.name)).size
        } catch {
          /* ignore */
        }
        out.push({ path: relPath, dir: false, size })
      }
    }
  }
  walk(root, '', 0)
  return out
}

// 浏览器会话认证栅栏：connection 服务缺失时不拦（回环地址本就仅本机可达）
function requestRejectionOf(ctx, req) {
  try {
    const conn = ctx.get('connection')
    if (conn && typeof conn.requestRejection === 'function') return conn.requestRejection(req)
  } catch {
    /* ignore */
  }
  return undefined
}

function sendJson(res, code, payload) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}

// 读取请求体（POST JSON，上限 64KB——skill-manage 的 body 只有 action/role/repoId/repoUrl/name）
function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolveP) => {
    const chunks = []
    let size = 0
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      if (!ok) return resolveP(null)
      try {
        resolveP(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolveP(null)
      }
    }
    req.on('data', (c) => {
      size += c.length
      if (size > maxBytes) {
        finish(false)
        return
      }
      chunks.push(c)
    })
    req.on('end', () => finish(true))
    req.on('error', () => finish(false))
  })
}

// /state 快照缓存（模块级 1s）：多标签/多请求并发轮询时避免重复读盘建树
const STATE_CACHE_MS = 1000
const stateCache = { ts: 0, payload: null }

// 敏感路径拒服务：凭据文件一律拒绝；工作区内 .dsh-home/.dsh 状态目录（会话/日志/profile）
// 不服务——插件自身数据目录（$DSH_HOME/dsh-science）内的登记产物（图表/收割件）除外。
function isSensitiveServedPath(realAbs, realWorkspaceRoot, realDataDir) {
  try {
    const base = String(realAbs).split(/[\\/]/).pop()
    if (/^\.credentials\./i.test(base)) return true
    if (!realWorkspaceRoot) return false
    const relWs = relative(realWorkspaceRoot, realAbs)
    if (!relWs || relWs.startsWith('..') || isAbsolute(relWs)) return false
    const firstSeg = relWs.split(/[\\/]/)[0]
    if (firstSeg !== '.dsh-home' && firstSeg !== '.dsh') return false
    // 在 dsh 状态目录内：仅插件数据目录之内放行
    if (!realDataDir) return true
    const relData = relative(realDataDir, realAbs)
    if (!relData || relData.startsWith('..') || isAbsolute(relData)) return true
    return false
  } catch {
    return true
  }
}

// path 参数 → 允许根之内绝对文件路径，否则 null
// 防目录穿越：resolve + realpathSync（穿透 symlink/大小写别名后）再做 relative 前缀校验
function resolveServedPath(raw) {
  if (!raw || typeof raw !== 'string' || raw.includes('\0')) return null
  const roots = workspaceRoots()
  const candidates = []
  if (isAbsolute(raw)) {
    candidates.push(resolve(raw))
  } else {
    for (const r of roots) candidates.push(resolve(r, raw))
  }
  // 根同样取真实路径，避免通过指向根外目录的 symlink 越界
  const realRoots = roots.map((r) => {
    try {
      return realpathSync(r)
    } catch {
      return resolve(r)
    }
  })
  let realWs = null
  try {
    realWs = workspaceRoot() ? realpathSync(workspaceRoot()) : null
  } catch {
    realWs = workspaceRoot() ? resolve(workspaceRoot()) : null
  }
  let realData = null
  try {
    realData = realpathSync(dataDirOf())
  } catch {
    try {
      realData = resolve(dataDirOf())
    } catch {
      realData = null
    }
  }
  for (const cand of candidates) {
    let real
    try {
      real = realpathSync(cand)
    } catch {
      continue
    }
    for (const root of realRoots) {
      const rel = relative(root, real)
      if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue
      if (!existsSync(real)) continue
      if (isSensitiveServedPath(real, realWs, realData)) continue
      let stat
      try {
        stat = statSync(real)
      } catch {
        continue
      }
      if (stat.isFile()) return real
    }
  }
  return null
}

// legacy 全局视图（无 sessionId 时）：旧 JSON 的只读汇总，标 legacy:true + 升级提示。
function buildLegacyStatePayload(ctx, store) {
  const team = sanitizeTeamState(loadJson('team.json'), { store })
  const members = team.members
  const sshProfiles = toList(loadJson('ssh-profiles.json'))
  const bp = loadBlueprint()
  const figuresRaw = loadJson('figures.json')
  const figurePlansRaw = loadJson('figure-plans.json')
  const reviewsRaw = loadJson('reviews.json')
  const reviewCoverage = reviewCoverageOf(bp, reviewsRaw)
  return {
    ts: Date.now(),
    version: VERSION,
    legacy: true,
    upgradeHint: '本快照来自旧全局状态文件（只读兼容）。新版本请带 sessionId 读取按项目隔离的研究状态。',
    blueprint: blueprintPayloadOf(bp, team, figuresRaw, reviewCoverage),
    blueprintError: blueprintErrorOf() || null,
    team: { members, tasks: Array.isArray(team.tasks) ? team.tasks : [] },
    figures: toList(figuresRaw).sort((a, b) => (b.registeredAt || 0) - (a.registeredAt || 0)),
    figurePlans: toList(figurePlansRaw).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)),
    reviews: reviewSummariesOf(reviewsRaw),
    dbProfiles: toList(loadJson('db-profiles.json')),
    sshProfiles,
    sshHosts: sshProfiles.map((p) => ({
      name: p.key,
      host: p.host,
      auth: p.auth,
      probedAt: p.probedAt,
      os: p.details && p.details.os,
      gpu: p.details && p.details.gpu,
    })),
    sshJobs: toList(loadJson('ssh-jobs.json')).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)),
    roles: rolesPayload(),
    skillMenu: skillMenuSnapshot(),
    mascotLead: LEAD_MASCOT,
    memberLive: memberLiveOf(ctx, members, team.tasks),
    files: listWorkspaceFiles(),
    workspaceRoot: workspaceRoot(),
    generatedAt: new Date().toISOString(),
  }
}

// 审查台账按项目归属过滤：同时支持对象键形态与数组形态（reviewruns.collectRuns 两种都认）。
function filterReviewLedger(raw, inScope) {
  if (Array.isArray(raw)) return raw.filter((record) => record && typeof record === 'object' && inScope(record))
  if (raw && typeof raw === 'object') {
    const out = {}
    for (const [key, record] of Object.entries(raw)) {
      if (record && typeof record === 'object' && !Array.isArray(record) && inScope(record)) out[key] = record
    }
    return out
  }
  return raw
}

// 按会话解析的项目视图（路线 B 主路径）：蓝图读 Project State；团队/图件/审查按项目过滤。
function buildSessionStatePayload(ctx, store, sessionId) {
  const scope = readScope(ctx, { agent: { session: { id: String(sessionId) } } }, { store })
  if (!scope.ok) {
    if (scope.code === 'unknown-session') return { status: 404, error: 'unknown-session' }
    return { status: 403, error: scope.code }
  }
  const ref = scope.ref
  const snapshot = scope.snapshot
  const bp = blueprintViewOf(snapshot)
  const figuresRaw = loadJson('figures.json')
  const figurePlansRaw = loadJson('figure-plans.json')
  const reviewsRaw = loadJson('reviews.json')
  const fullTeam = sanitizeTeamState(loadJson('team.json'), { store })
  // T1：项目视图只按稳定归属（projectId/rootSessionId）过滤；不再用跨项目重复的 res-N
  // 推断任务归属，也不再用“未绑定 Result”放行整本全局台账。
  const recordScope = createRecordScopeResolver({ store })
  const inScope = (record) => recordScope.inScope(record, ref)
  const tasks = (fullTeam.tasks || []).filter((t) => t && inScope(t))
  // T2：成员按 (rootSessionId, name) 归属过滤；无归属的旧成员不进入项目卡，
  // 客户端成员会话跳转只拿当前 root 下的 childId。
  const members = (fullTeam.members || []).filter((m) => m && inScope(m))
  const scopedTeam = { members, tasks, taskSeq: fullTeam.taskSeq || 0 }
  // 图件/图件计划：显式归属优先；历史条目只有在能被当前项目快照的稳定链接
  // （result.figures / links.artifactRefs / figure.planId）唯一确定时才回填展示。
  const linkedFigureIds = new Set()
  for (const r of bp.results || []) {
    for (const fid of Array.isArray(r && r.figures) ? r.figures : []) linkedFigureIds.add(String(fid))
  }
  const snapshotLinks = snapshot && snapshot.links && Array.isArray(snapshot.links.artifactRefs) ? snapshot.links.artifactRefs : []
  for (const link of snapshotLinks) if (link && link.artifactId) linkedFigureIds.add(String(link.artifactId))
  const figures = toList(figuresRaw)
    .filter((f) => f && typeof f === 'object' && (inScope(f) || (f.id && linkedFigureIds.has(String(f.id)))))
    .sort((a, b) => (b.registeredAt || 0) - (a.registeredAt || 0))
  const scopedFigureIds = new Set(figures.map((f) => String(f.id)))
  const scopedFigurePlanIds = new Set(figures.map((f) => (f.planId ? String(f.planId) : '')).filter(Boolean))
  const figurePlans = toList(figurePlansRaw)
    .filter((p) => {
      if (!p || typeof p !== 'object') return false
      if (inScope(p)) return true
      if (p.figureId && scopedFigureIds.has(String(p.figureId))) return true
      return Boolean(p.id && scopedFigurePlanIds.has(String(p.id)))
    })
    .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
  // 审查摘要：run 的稳定归属 = 显式 projectId/rootSessionId，或可解析的 sessionId 链接。
  // legacy-unscoped（无任何归属依据）只留在 legacy 视图，不进入项目卡。
  const scopedReviewsRaw = filterReviewLedger(reviewsRaw, inScope)
  // 高-2：审查覆盖与摘要使用同一份已过滤台账，并按项目 root（含成员）统计，口径一致。
  const reviewCoverage = reviewCoverageOf(bp, scopedReviewsRaw, ref.rootSessionId ? String(ref.rootSessionId) : String(sessionId))
  return {
    ts: Date.now(),
    version: VERSION,
    projectId: ref.projectId,
    projectRevision: snapshot ? snapshot.revision : 0,
    relationship: ref.relationship,
    capabilities: ref.capabilities,
    blueprint: blueprintPayloadOf(bp, scopedTeam, figures, reviewCoverage),
    // 低-9：会话视图不带 legacy blueprint.json 的损坏标记（避免误导当前项目状态）
    blueprintError: null,
    team: { members, tasks },
    figures,
    figurePlans,
    reviews: reviewSummariesOf(scopedReviewsRaw),
    dbProfiles: toList(loadJson('db-profiles.json')),
    sshProfiles: toList(loadJson('ssh-profiles.json')),
    sshHosts: toList(loadJson('ssh-profiles.json')).map((p) => ({
      name: p.key,
      host: p.host,
      auth: p.auth,
      probedAt: p.probedAt,
      os: p.details && p.details.os,
      gpu: p.details && p.details.gpu,
    })),
    sshJobs: toList(loadJson('ssh-jobs.json')).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)),
    roles: rolesPayload(),
    skillMenu: skillMenuSnapshot(),
    mascotLead: LEAD_MASCOT,
    memberLive: memberLiveOf(ctx, members, tasks),
    files: listWorkspaceFiles(),
    workspaceRoot: workspaceRoot(),
    generatedAt: new Date().toISOString(),
  }
}

function blueprintPayloadOf(bp, team, figuresRaw, reviewCoverage) {
  return {
    schemaVersion: bp.schemaVersion || 2,
    stage: bp.stage || 'explore',
    stageUpdatedAt: bp.stageUpdatedAt || 0,
    core: {
      title: bp.core.title || '',
      claim: bp.core.claim || '',
      innovation: bp.core.innovation || '',
      venue: bp.core.venue || '',
      confirmed: isConfirmationCurrent(bp.core, 'core'),
      revision: bp.core.revision || 1,
      // T4：确认卡/右栏按钮必须携带对象内容哈希（与领域层 contentHashOf 同口径）。
      contentHash: contentHashOf(bp.core),
      confirmation: bp.core.confirmation || null,
    },
    results: (bp.results || []).map((r) => ({
      id: r.id,
      title: (r && r.title) || (r && r.id) || '',
      claim: (r && r.claim) || '',
      status: (r && r.status) || 'planned',
      confirmed: !!(r && isConfirmationCurrent(r, r.id)),
      revision: (r && r.revision) || 1,
      contentHash: contentHashOf(r),
      confirmation: (r && r.confirmation) || null,
      purpose: (r && r.purpose) || '',
      direction: (r && r.direction) || 'not_assessed',
      evidenceState: (r && r.evidenceState) || 'planned',
      manuscriptRole: (r && r.manuscriptRole) || 'main',
      presentation: (r && r.presentation) || { mode: 'undecided', rationale: '' },
      claims: Array.isArray(r && r.claims) ? r.claims : [],
      evidence: Array.isArray(r && r.evidence) ? r.evidence : [],
      tasks: Array.isArray(r && r.tasks) ? r.tasks : [],
      figures: Array.isArray(r && r.figures) ? r.figures : [],
      references: Array.isArray(r && r.references) ? r.references : [],
      screening: (r && r.screening) || null,
      notes: (r && r.notes) || '',
    })),
    narrative: bp.narrative || '',
    question: bp.question || '',
    scope: bp.scope || '',
    sourceSummary: bp.sourceSummary || '',
    questionUpdatedAt: bp.questionUpdatedAt || 0,
    updatedAt: bp.updatedAt || 0,
    coverage: coverageOf(bp, team, figuresRaw),
    reviewCoverage,
    paperProgress: paperProgressOf(bp, team, figuresRaw, reviewCoverage),
    paperSpine: paperSpineViewOf(bp, team, figuresRaw, reviewCoverage),
    submission: bp.submission,
  }
}

function rolesPayload() {
  return Object.fromEntries(
    Object.entries(ROLES).map(([id, d]) => [id, { member: d.member, label: d.label, icon: d.icon, mascot: d.mascot }]),
  )
}

export function registerStateRoute(ctx, opts = {}) {
  const store = opts.store
  let registered = false
  const tryRegister = () => {
    if (registered) return
    let server
    try {
      server = ctx.get(WEB_SERVER_KEYS[0]) || ctx.get(WEB_SERVER_KEYS[1])
    } catch {
      return
    }
    if (!server || typeof server.register !== 'function') return
    try {
      ctx.effect(
        () =>
          server.register({
            kind: 'exact',
            path: '/plugins/dsh-science/state',
            handler: async (req, res) => {
              try {
                const rejection = requestRejectionOf(ctx, req)
                if (rejection !== undefined) {
                  sendJson(res, rejection, { error: rejection === 401 ? 'unauthorized' : 'forbidden' })
                  return
                }
                // 阶段 2（路线 B）：带 sessionId → 按会话解析 Project State（主路径）；
                // 不带 sessionId → legacy 只读视图（旧客户端升级过渡，标注 legacy:true）。
                let urlParams = null
                try {
                  urlParams = new URL(req.url, 'http://localhost').searchParams
                } catch {
                  urlParams = null
                }
                const sessionId = urlParams ? urlParams.get('sessionId') : null
                if (sessionId && !store) {
                  // 中-4（综合复核 A）：store 不可用（DB 损坏/迁移失败）→ 结构化降级信号，
                  // 不静默回落 legacy 视图误导用户。
                  sendJson(res, 503, { error: 'store-unavailable' })
                  return
                }
                if (sessionId && store) {
                  const scoped = buildSessionStatePayload(ctx, store, sessionId)
                  if (scoped.error) {
                    sendJson(res, scoped.status, { error: scoped.error })
                    return
                  }
                  sendJson(res, 200, scoped)
                  return
                }
                const now = Date.now()
                if (stateCache.payload && now - stateCache.ts < STATE_CACHE_MS) {
                  sendJson(res, 200, stateCache.payload)
                  return
                }
                const payload = buildLegacyStatePayload(ctx, store)
                stateCache.ts = now
                stateCache.payload = payload
                sendJson(res, 200, payload)
              } catch (err) {
                log(`state handler failed: ${err && err.message}`)
                sendJson(res, 500, { error: 'internal error' })
              }
            },
          }),
        'dsh-science: state route',
      )
      ctx.effect(
        () =>
          server.register({
            kind: 'exact',
            path: '/plugins/dsh-science/file',
            handler: async (req, res) => {
              try {
                const rejection = requestRejectionOf(ctx, req)
                if (rejection !== undefined) {
                  sendJson(res, rejection, { error: rejection === 401 ? 'unauthorized' : 'forbidden' })
                  return
                }
                let raw = null
                try {
                  raw = new URL(req.url, 'http://localhost').searchParams.get('path')
                } catch {
                  raw = null
                }
                const abs = resolveServedPath(raw)
                // M4：插件数据目录内的状态/台账文件不给直链下载（跨项目全量状态泄漏面）。
                // 中-3（综合复核 B 确认）：名单只对数据目录内生效——不误伤工作区里用户自己的
                // config.json/team.json/*.tmp 等正常文件。
                let sensitiveStateFile = false
                if (abs) {
                  let realData = null
                  try { realData = realpathSync(dataDirOf()) } catch { try { realData = resolve(dataDirOf()) } catch { realData = null } }
                  if (realData) {
                    const norm = String(abs).split(/[\\/]/).join('/')
                    const dataNorm = String(realData).split(/[\\/]/).join('/')
                    const inDataDir = dataNorm && `${norm.toLowerCase()}/`.startsWith(`${dataNorm.toLowerCase()}/`)
                    if (inDataDir) {
                      sensitiveStateFile =
                        /(?:^|\/)(?:ssh-profiles|db-profiles|config|role-skills|team|reviews|blueprint|figure-plans)\.json$/i.test(norm) ||
                        /science-state\.sqlite(?:-wal|-shm)?$|\.corrupt-|\.tmp$/i.test(norm)
                    }
                  }
                }
                if (!abs || sensitiveStateFile) {
                  sendJson(res, 404, { error: 'file not found or outside workspace' })
                  return
                }
                let stat
                try {
                  stat = statSync(abs)
                } catch {
                  sendJson(res, 404, { error: 'file not found' })
                  return
                }
                if (stat.size > FILE_MAX_BYTES) {
                  sendJson(res, 413, { error: 'file too large (>20MB)' })
                  return
                }
                const ext = extname(abs).toLowerCase()
                const type = FILE_TYPES[ext] || 'application/octet-stream'
                const body = readFileSync(abs)
                const isSvg = ext === '.svg'
                if (isSvg) {
                  // 登记闸门管不到历史文件/手工放入工作区的 SVG：服务端再拦一次（直链打开即执行）
                  const reason = svgActiveContentReason(decodeSvgText(body))
                  if (reason) {
                    sendJson(res, 403, { error: `refused: SVG contains active content (${reason})` })
                    return
                  }
                }
                const headers = {
                  'content-type': type,
                  'cache-control': 'no-store',
                  'content-length': body.length,
                  'x-content-type-options': 'nosniff',
                }
                if (isSvg) headers['content-security-policy'] = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:"
                res.writeHead(200, headers)
                res.end(body)
              } catch (err) {
                log(`file handler failed: ${err && err.message}`)
                sendJson(res, 500, { error: 'internal error' })
              }
            },
          }),
        'dsh-science: file route',
      )
      try {
        ctx.effect(
          () =>
            server.register({
              kind: 'exact',
              path: '/plugins/dsh-science/review',
              handler: async (req, res) => {
                try {
                  const rejection = requestRejectionOf(ctx, req)
                  if (rejection !== undefined) {
                    sendJson(res, rejection, { error: rejection === 401 ? 'unauthorized' : 'forbidden' })
                    return
                  }
                  let params = null
                  try {
                    params = new URL(req.url, 'http://localhost').searchParams
                  } catch {
                    params = null
                  }
                  const runId = params ? params.get('run') : null
                  const sessionId = params ? params.get('sessionId') : null
                  // T1：审查详情必须由当前会话解析项目，不能只凭全局 runId 读取。
                  if (!sessionId) {
                    sendJson(res, 400, { error: 'missing session id' })
                    return
                  }
                  if (!runId) {
                    sendJson(res, 400, { error: 'missing run id' })
                    return
                  }
                  if (!store) {
                    sendJson(res, 503, { error: 'store-unavailable' })
                    return
                  }
                  const scope = resolveProjectContext(ctx, sessionId, { store })
                  if (!scope.ok) {
                    // 未知会话与不存在的 run 同码，避免探测会话是否存在
                    sendJson(res, 404, { error: 'unknown-session' })
                    return
                  }
                  if (!scope.ref.capabilities || !scope.ref.capabilities.read) {
                    sendJson(res, 403, { error: 'forbidden' })
                    return
                  }
                  const run = reviewRunOf(loadJson('reviews.json'), runId)
                  // 跨项目与不存在返回同一个 404：不泄漏其他项目是否存在该 run。
                  if (!run || !isRecordInProjectScope(run, scope.ref, { store })) {
                    sendJson(res, 404, { error: 'review run not found' })
                    return
                  }
                  sendJson(res, 200, { run })
                } catch (err) {
                  log(`review handler failed: ${err && err.message}`)
                  sendJson(res, 500, { error: 'internal error' })
                }
              },
            }),
          'dsh-science: review detail route',
        )
      } catch (err) {
        log(`review route register failed: ${err && err.message}`)
      }
      registered = true
      log('state route registered: GET /plugins/dsh-science/state')
      log('review route registered: GET /plugins/dsh-science/review?run=<id>&sessionId=<id>')
      log('file route registered: GET /plugins/dsh-science/file?path=…（仅工作区/数据目录内文件）')
      // 科研鲸鱼娘吉祥物（assets/mascots/*.svg）：白名单 + 前缀路由（路径参数只取文件名段）
      try {
        ctx.effect(
          () =>
            server.register({
              kind: 'prefix',
              path: '/plugins/dsh-science/assets',
              handler: async (req, res) => {
                // 与 state/file 路由相同的浏览器会话认证栅栏（同源 <img> 自带凭证）
                const rejection = requestRejectionOf(ctx, req)
                if (rejection !== undefined) {
                  sendJson(res, rejection, { error: rejection === 401 ? 'unauthorized' : 'forbidden' })
                  return
                }
                let name = ''
                try {
                  name = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname.split('/').pop() ?? '')
                } catch {
                  res.writeHead(404).end()
                  return
                }
                if (!MASCOT_ALLOWLIST.has(name) || !name.endsWith('.svg')) {
                  res.writeHead(404).end()
                  return
                }
                try {
                  const body = readFileSync(join(MASCOT_DIR, name))
                  res.writeHead(200, {
                    'content-type': 'image/svg+xml; charset=utf-8',
                    'cache-control': 'public, max-age=86400',
                    'content-length': body.length,
                    'x-content-type-options': 'nosniff',
                    // 直链打开 SVG 时禁止脚本（<img> 场景 CSP 不生效，不影响面板渲染）
                    'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
                  })
                  res.end(body)
                } catch (err) {
                  log(`mascot read failed for ${name}: ${err && err.message}`)
                  res.writeHead(404).end()
                }
              },
            }),
          'dsh-science: mascot assets route',
        )
        log('mascot assets route registered: GET /plugins/dsh-science/assets/<file>.svg')
      } catch (err) {
        log(`mascot route register failed: ${err && err.message}`)
      }
      // v0.9.0 角色技能库管理路由：客户端团队 tab「角色技能库」勾选/自定义链接 → POST。
      // body: { action:'install'|'remove', role, repoId?, repoUrl?, name? }
      // 鉴权与 state/file 同款浏览器会话栅栏；安装/删除复用 lib/skillmenu.js（互斥队列内执行）。
      try {
        ctx.effect(
          () =>
            server.register({
              kind: 'exact',
              path: '/plugins/dsh-science/skill-manage',
              handler: async (req, res) => {
                // M2：写路由 fail-closed——connection 栅栏缺失时拒绝（不回环放行）
                let rejection
                try {
                  const conn = ctx.get('connection')
                  rejection = conn && typeof conn.requestRejection === 'function' ? conn.requestRejection(req) : 401
                } catch {
                  rejection = 401
                }
                if (rejection !== undefined && rejection !== false) {
                  sendJson(res, rejection, { error: rejection === 401 ? 'unauthorized' : 'forbidden' })
                  return
                }
                if ((req.method || '').toUpperCase() !== 'POST') {
                  sendJson(res, 405, { error: 'POST only' })
                  return
                }
                const body = await readJsonBody(req)
                if (!body || typeof body !== 'object') {
                  sendJson(res, 400, { error: 'invalid JSON body' })
                  return
                }
                const action = String(body.action || '')
                const role = String(body.role || '')
                try {
                  if (action === 'install') {
                    const result = await installSkill({
                      role,
                      catalogId: body.repoId ? String(body.repoId) : null,
                      repoUrl: body.repoUrl ? String(body.repoUrl) : null,
                      name: body.name ? String(body.name) : null,
                    })
                    sendJson(res, result.ok ? 200 : 400, result)
                  } else if (action === 'remove') {
                    const result = await removeSkill({ role, name: body.name ? String(body.name) : null })
                    sendJson(res, result.ok ? 200 : 400, result)
                  } else {
                    sendJson(res, 400, { error: 'action 必须是 install | remove' })
                  }
                } catch (err) {
                  log(`skill-manage handler failed: ${err && err.message}`)
                  sendJson(res, 500, { error: 'internal error' })
                }
              },
            }),
          'dsh-science: skill-manage route',
        )
        log('skill-manage route registered: POST /plugins/dsh-science/skill-manage')
      } catch (err) {
        log(`skill-manage route register failed: ${err && err.message}`)
      }
    } catch (err) {
      log(`route register failed: ${err && err.message}`)
    }
  }
  tryRegister()
  // webServer 可能在本插件挂载之后才绑定（并发激活），按服务绑定事件重试
  try {
    ctx.on('internal/service', (name) => {
      if (WEB_SERVER_KEYS.includes(name)) tryRegister()
    })
  } catch (err) {
    log(`service listener failed: ${err && err.message}`)
  }
}
