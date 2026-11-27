// dsh-science — 文章蓝图（Paper Blueprint，v0.6.0）
// 插件的组织中枢：整个插件围绕一篇科学论文组织——
//   核心（标题/主张/创新点/目标期刊）→ 3-5 个 Results（每个是支撑核心的一个子主张）
//   → Tasks（团队任务板上支撑各 Result 的执行任务）→ Figures（各 Result 的图表证据）。
// 负面结果治理：某 result 被证据证伪时，从核心出发重新评估（调整该 result 的表述/方法，
// 或提出新 result）；多个负面且无 supported 时提示核心主张面临证伪风险。
//
// 方法论出处：
// - ARS academic-paper（research/ars/academic-paper/SKILL.md）：8 阶段编排里的
//   Paper Outline + Evidence Map（Phase 2）与 Argument Blueprint 的 claim-evidence 链
//   （Phase 3）；review criteria 预承诺（先固定判据再用证据说话）。
// - PaperSpine（research/paperspine/src/skill/SKILL.md + references/）：skeleton-first
//   （先骨架后血肉）、writing rationale matrix（每个单元标注它推进哪条贡献承诺）、
//   "用户的材料/结果是主张的唯一权威"、不留占位符。
// - 证据台账模式（paperspine references/scientific-evidence-ledger.md）：claim↔result↔evidence
//   可核对的绑定关系，本模块用 result.tasks / result.figures 双向登记落实。

// v0.9.0（Track 2）新增三个维度：
// - 确认工作流：core/results 带 confirmed 布尔——新建/修改后回到 false（待确认），
//   只有用户在对话中明确同意后队长才可 sci_blueprint_confirm 置 true；sci_team_dispatch
//   引用未确认 result 会被拒（闸门在 lib/team.js）。语义：蓝图条目是文章的承诺，确认后
//   才允许作为派发/汇报的依据；修改已确认条目前必须先向用户说明变更（队长协议，lib/router.js）。
// - 每Result参考文献：results[].references = [{doi,title,usedAs,verified,…}]（usedAs:
//   method|concept|background|evidence），带 DOI 时自动经 Crossref 核对（lib/lit.js verifyDoi）。
// - 文献快筛：results[].screening = {decision: include|exclude|maybe, note, decidedAt}
//   （对齐 aipoch Smart Screening 的轻量版，ALIGNMENT-v09 E3）。
// - 导出：sci_blueprint_export 按项目和修订保存报告，保留旧路径的历史文稿。

import { unmetTaskDependencies, isTerminalTask } from './dag.js'
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { saveBlueprintReport } from './blueprint-archive.js'
import { dataDirOf, falsificationThresholdOf } from './store.js'
import { buildContextPack, citeObject } from './skeleton-context.js'
import { reviewCoverageOf, projectReviewsOf } from './reviewcov.js'
import { createRecordScopeResolver } from './project-context.js'
import { railTeamOf } from './rail-team.js'
import { sanitizeTeamState } from './team.js'
import { verifyDoi, normalizeDoi } from './lit.js'
import {
  PAPER_STAGES,
  EVIDENCE_DIRECTIONS,
  EVIDENCE_STATES,
  MANUSCRIPT_ROLES,
  PRESENTATION_MODES,
  SUBMISSION_ITEMS,
  normalizePaperSpine,
  confirmEntityRevision,
  isConfirmationCurrent,
  reviseEntity,
  paperSpineViewOf,
} from './paperspine.js'
// 阶段 2：业务写只走 ProjectCommand；读经 Project State 视图（blueprintViewOf）。
import { readScope, writeCommands, assertToolWriteAllowed, blueprintViewOf, importLegacyBlueprint, contentHashOf, objectRevisionOf } from './project-adapter.js'

function log(msg) {
  console.log(`[dsh-science blueprint] ${msg}`)
}

// 工具 mutationId：优先用宿主工具调用 id（重试不重复写入），否则一次性随机键
function toolMutationId(name, exec) {
  const callId = exec && (exec.callId || (exec.call && exec.call.id))
  if (callId) return `tool-${name}-${callId}`
  return `tool-${name}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
}

// 将 writeCommands 的结构化结果转为工具错误（DSH 转 isError；reason 面向用户可读）
function assertApplied(out, { conflictHint } = {}) {
  if (out.kind === 'applied' || out.kind === 'already-applied') return out
  if (out.kind === 'conflict') {
    throw new Error(`修订冲突：${out.reason}${conflictHint || '。请先 sci_blueprint_overview 查看最新状态再操作。'}`)
  }
  if (out.kind === 'forbidden') throw new Error(out.reason)
  throw new Error(out.reason || `命令未应用（${out.kind}）`)
}

const blueprintFile = () => join(dataDirOf(), 'blueprint.json')
const teamFile = () => join(dataDirOf(), 'team.json')
const figuresFile = () => join(dataDirOf(), 'figures.json')

// result 状态机：planned（计划）→ in_progress（执行中）→ supported（证据已支撑）
//   negative（负面结果，需重新评估说明）| dropped（弃用）
export const RESULT_STATUSES = ['planned', 'in_progress', 'supported', 'negative', 'dropped']
// 文章通常只支撑 3-5 个子主张：第 6 个可加但警告，第 7 个拒绝
export const RESULT_SOFT_CAP = 5
export const RESULT_HARD_CAP = 6

function normalizeIdSeq(results) {
  let seq = 0
  for (const r of Array.isArray(results) ? results : []) {
    const m = /^res-(\d+)$/.exec(String((r && r.id) || ''))
    if (m) seq = Math.max(seq, Number(m[1]))
  }
  return seq
}

export function emptyBlueprint() {
  return normalizePaperSpine({
    core: { title: '', claim: '', innovation: '', venue: '', confirmed: false, updatedAt: 0 },
    results: [],
    narrative: '',
    resultSeq: 0,
    updatedAt: 0,
  })
}

// 蓝图文件损坏隔离（v0.6.0 fix4，X3 推广）：解析失败 **或** 合法 JSON 但结构非法
// （数组/缺 results 字段等非蓝图形状）→ 统一走 quarantine：坏文件改名备份为
// blueprint.json.corrupt-<ts>（备份保留），console.error 报警，blueprintError 置位——
// /state 快照下发，客户端文章 tab 显示警示横幅；下一次成功持久化（如 sci_blueprint_set
// 重建蓝图）自动清除。文件不存在（首跑常态）不算损坏：返回空蓝图且不清不动既有标记。
let blueprintError = null

export function blueprintErrorOf() {
  return blueprintError
}

function quarantineBlueprint(reason) {
  const backupName = `blueprint.json.corrupt-${Date.now()}`
  try {
    renameSync(blueprintFile(), join(dataDirOf(), backupName))
    blueprintError = `blueprint.json ${reason}，已隔离备份为 ${backupName}`
  } catch (berr) {
    blueprintError = `blueprint.json ${reason}且隔离备份失败（${berr && berr.message}）`
  }
  console.error(`[dsh-science blueprint] ${blueprintError}`)
  return emptyBlueprint()
}

export function loadBlueprint() {
  let raw = null
  try {
    raw = readFileSync(blueprintFile(), 'utf8')
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      log(`blueprint read failed (treated as empty): ${err && err.message}`)
    }
    return emptyBlueprint()
  }
  let parsed = null
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return quarantineBlueprint(`解析失败（${err && err.message}）`)
  }
  // X3：合法 JSON 但结构非法（数组 / 缺 results 字段 / results 非数组）同样隔离——
  // 否则后续 persist 会把非蓝图形状回写，损坏被放大。
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.results)) {
    return quarantineBlueprint('结构非法（不是蓝图对象或缺 results 数组）')
  }
  blueprintError = null
  const bp = parsed
  const core = bp.core && typeof bp.core === 'object' ? bp.core : {}
  // H2：顶层形状合法也可能夹带 null/标量 result；这些条目无法被任何工具消费，
  // 读档即剔除，避免 /state、overview、export 在全量轮询中抛错。
  const results = (Array.isArray(bp.results) ? bp.results : []).filter(
    (r) => r && typeof r === 'object' && typeof r.id === 'string',
  )
  return normalizePaperSpine({
    core: {
      title: typeof core.title === 'string' ? core.title : '',
      claim: typeof core.claim === 'string' ? core.claim : '',
      innovation: typeof core.innovation === 'string' ? core.innovation : '',
      venue: typeof core.venue === 'string' ? core.venue : '',
      confirmed: core.confirmed === true,
      confirmation: core.confirmation || null,
      revision: core.revision || 1,
      updatedAt: core.updatedAt || 0,
    },
    results,
    narrative: typeof bp.narrative === 'string' ? bp.narrative : '',
    resultSeq: typeof bp.resultSeq === 'number' ? bp.resultSeq : normalizeIdSeq(results),
    schemaVersion: bp.schemaVersion,
    stage: bp.stage,
    stageUpdatedAt: bp.stageUpdatedAt,
    submission: bp.submission,
    updatedAt: bp.updatedAt || 0,
  })
}

// 原子持久化（tmp + rename，rename 失败退回直接写）+ 工作区镜像（.dsh-science/blueprint.json）
export function persistBlueprint(state, exec, mirror) {
  const text = JSON.stringify(state, null, 2)
  const tmp = `${blueprintFile()}.tmp`
  try {
    writeFileSync(tmp, text, 'utf8')
    renameSync(tmp, blueprintFile())
  } catch (err) {
    log(`atomic persist fallback: ${err && err.message}`)
    writeFileSync(blueprintFile(), text, 'utf8')
  }
  // fix4：成功持久化 = 蓝图文件重新有效，清除损坏标记（覆盖 sci_blueprint_set 的下一次成功调用）
  blueprintError = null
  if (mirror) mirror('blueprint.json', text, exec)
}

function readTeamState() {
  try {
    return JSON.parse(readFileSync(teamFile(), 'utf8'))
  } catch {
    return null
  }
}

// team.json 原子写（X4 对齐回填用）：与 lib/team.js persist 同口径（tmp+rename，失败退回直接写）
function persistTeamState(team, exec, mirror) {
  const text = JSON.stringify(team, null, 2)
  const tmp = `${teamFile()}.tmp`
  try {
    writeFileSync(tmp, text, 'utf8')
    renameSync(tmp, teamFile())
  } catch (err) {
    log(`team atomic persist fallback: ${err && err.message}`)
    writeFileSync(teamFile(), text, 'utf8')
  }
  if (mirror) mirror('team.json', text, exec)
}

function readFiguresState() {
  try {
    const parsed = JSON.parse(readFileSync(figuresFile(), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

// Project GET, model tools and Markdown export all use this assessment.
export function projectScienceOf(view, ref, store, team = railTeamOf(ref, { store })) {
  const scope = createRecordScopeResolver({ store })
  const { runs, version: reviewVersion } = projectReviewsOf(ref, store)
  const reviewCoverage = reviewCoverageOf(view, runs)
  const linked = new Set(view.results.flatMap((r) => r.figures || []))
  const figures = Object.values(readFiguresState() || {}).filter((f) => f && (
    scope.inScope(f, ref) || (scope.scopeOf(f).source === 'legacy-unscoped' && linked.has(f.id))
  ))
  return { team, figures, reviewVersion, reviewCoverage, paperSpine: paperSpineViewOf(view, team, figures, reviewCoverage) }
}

// v0.9.0：存量 result 补默认字段（confirmed/references/screening）——旧蓝图没有这些键，
// 读档即补齐内存视图（persist 时随写回落盘），工具逻辑不必处处判空。
function resultWithDefaults(r) {
  if (!r || typeof r !== 'object') return r
  if (r.confirmed === undefined) r.confirmed = false
  if (!Array.isArray(r.references)) r.references = []
  if (!r.screening) r.screening = null
  if (!Array.isArray(r.claims)) r.claims = []
  if (!Array.isArray(r.evidence)) r.evidence = []
  return r
}

// result 输出视图（工具/导出共用）：不泄漏内部时间戳以外的杂项
// hashOverride：overview 会在 resultWithDefaults 之前计算领域同口径 hash（默认补字段会改变 hash）。
function resultOut(r, hashOverride = null) {
  return {
    id: r.id,
    title: r.title || r.id,
    claim: r.claim || '',
    status: r.status || 'planned',
    confirmed: r.confirmed === true,
    confirmation: r.confirmation || null,
    revision: r.revision || 1,
    contentHash: hashOverride != null ? hashOverride : contentHashOf(r),
    purpose: r.purpose || '',
    direction: r.direction || 'not_assessed',
    evidenceState: r.evidenceState || 'planned',
    manuscriptRole: r.manuscriptRole || 'main',
    presentation: r.presentation || { mode: 'undecided', rationale: '' },
    claims: Array.isArray(r.claims) ? r.claims : [],
    evidence: Array.isArray(r.evidence) ? r.evidence : [],
    tasks: Array.isArray(r.tasks) ? r.tasks : [],
    figures: Array.isArray(r.figures) ? r.figures : [],
    references: Array.isArray(r.references) ? r.references : [],
    screening: r.screening || null,
    notes: r.notes || '',
  }
}

function findResult(state, resultId) {
  const id = String(resultId || '')
  const result = state.results.find((r) => r && r.id === id)
  if (!result) {
    const known = state.results.map((r) => r && r.id).filter(Boolean).join(', ') || '（空）'
    throw new Error(`result ${id} 不存在（现有：${known}）。先用 sci_result_add 创建，或用 sci_blueprint_overview 查看。`)
  }
  return result
}

// 视图上的对象查找（core 或 result）；未找到返回 null（由调用方给出面向用户的信息）
function findObjectIn(view, objectId) {
  if (String(objectId) === 'core') return view.core
  return (view.results || []).find((r) => r && r.id === String(objectId)) || null
}

// 任务对齐（阶段 2 迁移）：论文侧真源是 Project State（paper.link-task 命令）；
// team.json 任务对象上的 resultId/resultIds 是执行侧镜像（团队 tab 徽章用），随命令同步回写。
// 幂等：命令合并去重；镜像回写只在缺失时补。
export function alignTaskToResult(ctx, taskId, resultId, opts = {}) {
  const store = opts.store
  const tid = String(taskId || '')
  const rid = String(resultId || '')
  const scope = readScope(ctx, opts.exec, { store })
  if (!scope.ok) throw new Error(scope.message || scope.code)
  if (!scope.snapshot) throw new Error(`当前会话尚未绑定科研项目——先建立研究问题再对齐任务`)
  assertToolWriteAllowed(scope.ref)
  const view = blueprintViewOf(scope.snapshot)
  const result = findResult(view, rid)
  const team = readTeamState()
  const task = team && Array.isArray(team.tasks) ? team.tasks.find((t) => t && t.id === tid) : null
  const resolver = createRecordScopeResolver({ store })
  const attributed = task && sanitizeTeamState(team, { store }).tasks.find((t) => t.id === tid)
  const legacyLink = attributed && resolver.scopeOf(attributed).source === 'legacy-unscoped'
    && view.results.some((r) => r.tasks?.includes(tid))
  if (!task || (!resolver.inScope(attributed, scope.ref) && !legacyLink)) {
    throw new Error(`当前项目任务板没有可对齐的任务 ${tid}`)
  }
  const out = writeCommands(ctx, opts.exec, {
    store,
    mutationId: `align-${tid}-${rid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'tool',
    operations: [{ command: 'paper.link-task', payload: { resultId: result.id, taskId: tid } }],
  })
  if (out.kind !== 'applied' && out.kind !== 'already-applied') throw new Error(out.reason || '对齐失败')
  // 命令应用后的最新论文侧视图（result.tasks 已含 taskId）
  const after = readScope(ctx, opts.exec, { store })
  const afterTasks = after.ok && after.snapshot
    ? (blueprintViewOf(after.snapshot).results.find((x) => x.id === result.id) || {}).tasks || []
    : []
  // 执行侧镜像回写（team.json 任务对象）
  let resultIdBackfilled = false
  const existingResultIds = new Set(Array.isArray(task.resultIds) ? task.resultIds.map(String) : [])
  if (task.resultId) existingResultIds.add(String(task.resultId))
  if (!existingResultIds.has(result.id)) {
    existingResultIds.add(result.id)
    task.resultIds = [...existingResultIds]
    task.resultId = task.resultIds[0] || result.id
    task.updatedAt = Date.now()
    resultIdBackfilled = true
  }
  let persisted = null
  if (resultIdBackfilled) {
    persisted = persistTeamState(team, opts.exec, opts.mirror)
  }
  return { ok: true, taskId: tid, resultId: result.id, resultIds: Array.isArray(task.resultIds) ? task.resultIds.slice() : [result.id], resultTasks: afterTasks, resultIdBackfilled }
}

// 图表挂接：Project State paper.link-artifact 为论文侧真源；figures.json 登记保持不变。
export function linkFigureToResult(ctx, figureId, resultId, opts = {}) {
  const store = opts.store
  const fid = String(figureId || '')
  const scope = readScope(ctx, opts.exec, { store })
  if (!scope.ok) throw new Error(scope.message || scope.code)
  if (!scope.snapshot) throw new Error(`当前会话尚未绑定科研项目——先建立研究问题再挂接图表`)
  assertToolWriteAllowed(scope.ref)
  const view = blueprintViewOf(scope.snapshot)
  const result = findResult(view, rid0(resultId))
  const record = readFiguresState()?.[fid]
  const resolver = createRecordScopeResolver({ store })
  // Migrated figures can already be linked in the trusted snapshot; a new
  // client-supplied figure ID alone cannot establish ownership.
  const indexed = scope.snapshot.artifactIndex?.items?.some((item) => item.id === fid && item.kind === 'figure')
  const previouslyLinked = view.results.some((r) => r.figures?.includes(fid))
  const legacy = !record || resolver.scopeOf(record).source === 'legacy-unscoped'
  if (!resolver.inScope(record, scope.ref) && !(legacy && (indexed || previouslyLinked))) {
    throw new Error(`当前项目没有可挂接的图件 ${fid}`)
  }
  const out = writeCommands(ctx, opts.exec, {
    store,
    mutationId: `link-fig-${fid}-${result.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'tool',
    operations: [{ command: 'paper.link-artifact', payload: { resultId: result.id, artifactId: fid } }],
  })
  if (out.kind !== 'applied' && out.kind !== 'already-applied') throw new Error(out.reason || '挂接失败')
  // 命令应用后的最新论文侧视图（result.figures 已含 fid）
  const after = readScope(ctx, opts.exec, { store })
  const afterFigures = after.ok && after.snapshot
    ? (blueprintViewOf(after.snapshot).results.find((x) => x.id === result.id) || {}).figures || []
    : []
  return { ok: true, figureId: fid, resultId: result.id, resultFigures: afterFigures }
}

function rid0(resultId) {
  return String(resultId || '')
}

// 任务板截断清理：被截掉的任务 id 从所有 result.tasks 摘除（unlink 命令，幂等）。
export function pruneTasksFromResults(ctx, taskIds, opts = {}) {
  const store = opts.store
  const dead = [...new Set((Array.isArray(taskIds) ? taskIds : []).map(String))].filter(Boolean)
  if (dead.size === 0 || !dead.length) return false
  const scope = readScope(ctx, opts.exec, { store })
  if (!scope.ok || !scope.snapshot) return false
  try {
    assertToolWriteAllowed(scope.ref)
  } catch {
    return false
  }
  const view = blueprintViewOf(scope.snapshot)
  const liveTasks = new Set((view.results || []).flatMap((r) => r.tasks || []))
  const stale = dead.filter((id) => liveTasks.has(id))
  if (stale.length === 0) return false
  const out = writeCommands(ctx, opts.exec, {
    store,
    mutationId: `prune-${stale.join('-').slice(0, 80)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'tool',
    operations: stale.map((taskId) => ({ command: 'paper.unlink-task', payload: { taskId } })),
  })
  if (out.kind !== 'applied' && out.kind !== 'already-applied') {
    log(`prune unlink failed: ${out.reason}`)
    return false
  }
  return true
}

// 覆盖分析：result 缺任务/缺图表、任务未对齐、图表未挂接、负面结果计数与证伪风险。
// 工具（sci_blueprint_overview）与 /state 快照（httpdata）共用同一实现，保证口径一致。
// v0.14.0：只有 manuscriptRole=excluded（兼容 dropped）退出支撑链；negative 作为证据方向保留。
//   新增 unlinkedFigures（已登记但未挂到任何 result 的图表）警告；
// v0.6.0 fix5：result.tasks 里的死引用（任务板已截断/不存在）不计入覆盖（staleTaskRefs 列出，
//   sci_blueprint_overview 会就地摘除并持久化）。
// X1：unalignedTasks 口径修正——review 类任务（isReview:true）与 completed/failed/cancelled/
//   deleted 终态任务豁免；未对齐警告附补救提示（sci_blueprint_align 补挂）。
export function coverageOf(bp, teamState, figures) {
  const results = Array.isArray(bp.results) ? bp.results : []
  const tasks = teamState && Array.isArray(teamState.tasks) ? teamState.tasks : []
  const taskIds = new Set(tasks.map((t) => t && t.id).filter(Boolean))
  // figures：键值对象（figures.json 原样）或数组（已 toList）均可
  const figureList = Array.isArray(figures)
    ? figures.filter(Boolean)
    : figures && typeof figures === 'object'
      ? Object.values(figures).filter(Boolean)
      : []
  const linkedFigures = new Set()
  for (const r of results) {
    for (const f of Array.isArray(r && r.figures) ? r.figures : []) linkedFigures.add(f)
  }
  const aligned = new Set()
  const staleTaskRefs = []
  const resultsWithoutTasks = []
  const resultsWithoutFigures = []
  const resultsWithoutPresentation = []
  const warnings = []
  for (const r of results) {
    const status = r && r.status
    const exempt = (r && r.manuscriptRole === 'excluded') || status === 'dropped'
    const rawTasks = Array.isArray(r.tasks) ? r.tasks : []
    const liveTasks = rawTasks.filter((id) => taskIds.has(id))
    for (const id of rawTasks) {
      if (!taskIds.has(id)) staleTaskRefs.push({ resultId: r.id, taskId: id })
    }
    for (const t of liveTasks) aligned.add(t)
    if (!exempt && liveTasks.length === 0) {
      resultsWithoutTasks.push(r.id)
      warnings.push(`${r.id} 无任务——尚无执行工作支撑该子主张`)
    }
    const figs = Array.isArray(r.figures) ? r.figures : []
    const presentationMode = r && r.presentation && r.presentation.mode ? r.presentation.mode : 'undecided'
    if (!exempt && presentationMode === 'undecided') {
      resultsWithoutPresentation.push(r.id)
      warnings.push(`${r.id} 尚未决定呈现方式——选择 figure | table | prose | supplement | omit 并记录理由`)
    }
    if (!exempt && presentationMode === 'figure' && figs.length === 0) {
      resultsWithoutFigures.push(r.id)
      warnings.push(`${r.id} 已决定用图呈现但尚无图表——建立图件计划并挂接证据`)
    }
  }
  const unlinkedFigures = figureList.map((f) => f && f.id).filter((id) => id && !linkedFigures.has(id))
  if (unlinkedFigures.length > 0) {
    const shown = unlinkedFigures.slice(0, 5).join('、')
    warnings.push(
      `图表 ${shown}${unlinkedFigures.length > 5 ? ` 等 ${unlinkedFigures.length} 个` : ''} 未挂接任何 result——图表证据未定位（sci_blueprint_link_figure 补挂）`,
    )
  }
  const unalignedTasks = []
  for (const t of tasks) {
    // X1 口径修正：以下任务不支撑文章子主张，从未对齐名单与警告中豁免——
    //   ① 审查类任务（sci_review_send 创建时标记 isReview:true）：审查是质量闸门，不是证据工作；
    //   ② 终态任务 completed/failed/cancelled/deleted：已完结的工作不再要求补挂对齐。
    if (!t || t.isReview) continue
    if (t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled' || t.status === 'deleted') continue
    if (!aligned.has(t.id)) {
      unalignedTasks.push(t.id)
      warnings.push(`${t.id} 未对齐任何 result——该工作对文章的贡献未定位；用 sci_blueprint_align 补挂到某个 result（补挂后徽章与覆盖警告即消除）`)
    }
  }
  const negativeCount = results.filter((r) => r && r.status === 'negative').length
  const supportedCount = results.filter((r) => r && r.status === 'supported').length
  const droppedCount = results.filter((r) => r && r.status === 'dropped').length
  // 证伪阈值可配置（config.json falsificationThreshold，默认 2）：/state 与工具双通道共用此口径
  const falsificationThreshold = falsificationThresholdOf()
  const falsificationRisk = negativeCount >= falsificationThreshold && supportedCount === 0
  if (falsificationRisk) {
    warnings.push(`⚠ 负面结果 ${negativeCount} 个（证伪阈值 ${falsificationThreshold}）且无 supported——核心主张面临证伪风险，请从核心出发重新评估蓝图（调整 results 或证伪核心主张）`)
  }
  return {
    total: results.length,
    resultsWithoutTasks,
    resultsWithoutFigures,
    resultsWithoutPresentation,
    unalignedTasks,
    unlinkedFigures,
    staleTaskRefs,
    negativeCount,
    supportedCount,
    droppedCount,
    falsificationThreshold,
    falsificationRisk,
    warnings,
  }
}

function coreOut(core) {
  return {
    title: (core && core.title) || '',
    claim: (core && core.claim) || '',
    innovation: (core && core.innovation) || '',
    venue: (core && core.venue) || '',
    // T4：Action Card / 右栏按钮的 expectedHash 取这里的 contentHash（领域层同口径）。
    contentHash: contentHashOf(core),
  }
}

// 论文视角摘要（v0.9.0 Track 2 B3）：哪些 result 证据齐备、哪些缺什么——
// 供 sci_blueprint_overview 输出与 sci_blueprint_export 报告共用。
function paperViewOf(state, spine) {
  const scientificById = new Map((spine?.results || []).map((r) => [r.id, r.readiness.scientific]))
  const rows = (state.results || []).map((r) => {
    resultWithDefaults(r)
    const tasks = Array.isArray(r.tasks) ? r.tasks : []
    const figures = Array.isArray(r.figures) ? r.figures : []
    const refs = Array.isArray(r.references) ? r.references : []
    const unverifiedRefs = refs.filter((x) => x && !x.verified).length
    const missing = []
    const exempt = r.manuscriptRole === 'excluded' || r.status === 'dropped'
    if (!exempt && tasks.length === 0) missing.push('任务')
    const presentationMode = r.presentation && r.presentation.mode ? r.presentation.mode : 'undecided'
    if (!exempt && presentationMode === 'undecided') missing.push('呈现决策')
    if (!exempt && presentationMode === 'figure' && figures.length === 0) missing.push('图表')
    if (unverifiedRefs > 0) missing.push('文献核验')
    if (!isConfirmationCurrent(r, r.id)) missing.push('确认')
    const scientific = scientificById.get(r.id)
    return {
      id: r.id,
      title: r.title || r.id,
      status: r.status || 'planned',
      confirmed: isConfirmationCurrent(r, r.id),
      manuscriptRole: r.manuscriptRole || 'main',
      presentation: r.presentation || { mode: 'undecided', rationale: '' },
      tasksCount: tasks.length,
      figuresCount: figures.length,
      referencesCount: refs.length,
      unverifiedReferences: unverifiedRefs,
      screening: r.screening || null,
      evidenceReady: !exempt && scientific?.state === 'ready',
      scientificBlockers: scientific?.blockers || [],
      missing,
    }
  })
  const ready = rows.filter((r) => r.evidenceReady)
  const missingRows = rows.filter((r) => !r.evidenceReady && r.manuscriptRole !== 'excluded' && r.status !== 'dropped')
  const exemptCount = rows.length - ready.length - missingRows.length
  const summary =
    rows.length === 0
      ? '尚无 result，论文视角摘要待建立（先 sci_result_add）。'
      : ready.length === 0 && missingRows.length === 0
        ? `没有纳入文章的 Result（excluded/dropped 共 ${exemptCount} 个）。`
        : `科学证据就绪 ${ready.length}/${rows.length - exemptCount}（${ready.map((r) => r.id).join('、') || '无'}）；待处理 ${missingRows.map((r) => `${r.id}（${r.scientificBlockers.join('；')}）`).join('；') || '无'}`
  return { results: rows, readyCount: ready.length, missingCount: missingRows.length, summary }
}

// Result 驱动的论文推进视图：只使用真实记录计算，不生成主观百分比。
// UI、/state 与工具输出共用该结构，避免团队页和文章页口径漂移。
export function paperProgressOf(bp, teamState, figuresState, reviewCoverage = null, spine = null) {
  const normalizedBp = normalizePaperSpine(bp)
  const spineView = spine || paperSpineViewOf(normalizedBp, teamState, figuresState, reviewCoverage)
  const assessments = new Map(spineView.results.map((r) => [r.id, r]))
  const results = Array.isArray(normalizedBp.results) ? normalizedBp.results.filter(Boolean) : []
  const records = Array.isArray(teamState?.tasks) ? teamState.tasks.filter(Boolean) : []
  const allTasks = records.filter(t => t.status !== 'deleted')
  const taskById = new Map(records.map(t => [t.id, t]))
  const figureById = new Map(
    (Array.isArray(figuresState) ? figuresState : Object.values(figuresState && typeof figuresState === 'object' ? figuresState : {}))
      .filter((f) => f && f.id)
      .map((f) => [f.id, f]),
  )
  const reviewById = new Map(
    (reviewCoverage && Array.isArray(reviewCoverage.results) ? reviewCoverage.results : [])
      .filter((r) => r && r.id)
      .map((r) => [r.id, r]),
  )
  const rows = results.map((r) => {
    const ids = new Set(Array.isArray(r.tasks) ? r.tasks : [])
    for (const t of allTasks) {
      if (t.resultId === r.id || (Array.isArray(t.resultIds) && t.resultIds.includes(r.id))) ids.add(t.id)
    }
    const tasks = [...ids].map((id) => taskById.get(id)).filter(t => t && t.status !== 'deleted')
    const completed = tasks.filter((t) => t.status === 'completed' || t.status === 'done').length
    const failed = tasks.filter((t) => t.status === 'failed').length
    const cancelled = tasks.filter((t) => t.status === 'cancelled').length
    const isBlocked = t => !isTerminalTask(t.status) && (t.status === 'blocked' || unmetTaskDependencies(t, id => taskById.get(id)).length > 0)
    const blocked = tasks.filter(isBlocked).length
    const activeTasks = tasks.filter(t => ['in_progress', 'claimed', 'running', 'working'].includes(t.status) && !isBlocked(t))
    const refs = Array.isArray(r.references) ? r.references.filter(Boolean) : []
    const figIds = Array.isArray(r.figures) ? r.figures : []
    const figures = figIds.map((id) => figureById.get(id)).filter(Boolean)
    const missingFigureRecords = figIds.length - figures.length
    const audited = figures.filter((f) => f.audit && ['ready-for-manual-review', 'approved'].includes(f.audit.overallStatus)).length
    const approved = figures.filter((f) => f.audit && f.audit.overallStatus === 'approved').length
    const review = reviewById.get(r.id) || { severity: 'none', runId: null, message: '' }
    const exempt = r.manuscriptRole === 'excluded' || r.status === 'dropped'
    let nextAction = '证据链已齐备，可进入写作整合。'
    if (exempt) nextAction = '该 Result 已明确排除出文章；保留排除理由供审计。'
    else if (!isConfirmationCurrent(r, r.id)) nextAction = '先向用户复述并确认该 Result，确认前不能派发执行任务。'
    else if (tasks.length === 0) nextAction = '把主张拆成可验证任务并派发。'
    else if (blocked > 0) nextAction = `解除 ${blocked} 项任务依赖。`
    else if (failed > 0) nextAction = `诊断并重跑 ${failed} 项失败任务。`
    else if (cancelled > 0) nextAction = `重新规划 ${cancelled} 项已取消任务。`
    else if (completed < tasks.length) nextAction = `推进剩余 ${tasks.length - completed} 项任务。`
    else if (missingFigureRecords > 0) nextAction = `修复 ${missingFigureRecords} 个失效图件引用或重新登记。`
    else if (assessments.get(r.id)?.readiness.scientific.state === 'blocked') nextAction = assessments.get(r.id).readiness.scientific.blockers[0]
    else if (refs.some((ref) => !ref.verified)) nextAction = `核对 ${refs.filter((ref) => !ref.verified).length} 条参考文献 DOI。`
    else if (!r.presentation || r.presentation.mode === 'undecided') nextAction = '决定以图、表、正文或补充材料呈现，并记录理由。'
    else if (r.presentation.mode === 'figure' && figIds.length === 0) nextAction = '建立图件计划并生成支撑图。'
    else if (approved < figIds.length) nextAction = `完成 ${figIds.length - approved} 张图件的投稿前检与人工终审。`
    else if (review.severity === 'fail' || review.severity === 'warn') nextAction = `处理最近主张审查的 ${review.severity} 结论。`
    else if (!review.severity || review.severity === 'none') nextAction = '对主张—执行—证据链进行独立审查。'
    return {
      id: r.id,
      title: r.title || r.id,
      claim: r.claim || '',
      status: r.status || 'planned',
      confirmed: isConfirmationCurrent(r, r.id),
      exempt,
      tasks: { total: tasks.length, completed, active: activeTasks.length, blocked, failed, cancelled },
      references: { total: refs.length, verified: refs.filter((ref) => ref.verified === true).length },
      figures: { total: figIds.length, registered: figures.length, missing: missingFigureRecords, audited, approved },
      review: { severity: review.severity || 'none', runId: review.runId || null, message: review.message || '' },
      owner: (activeTasks[0] && activeTasks[0].assignee) || (tasks.find((t) => t.assignee) || {}).assignee || null,
      nextAction,
    }
  })
  const readyCount = spineView.results.filter((r) => !r.excluded && r.readiness.manuscript.state === 'ready').length
  return {
    results: rows,
    summary: {
      total: rows.length,
      confirmed: rows.filter((r) => r.confirmed).length,
      active: rows.filter((r) => r.tasks.active > 0).length,
      blocked: rows.filter((r) => r.tasks.blocked > 0).length,
      ready: readyCount,
    },
  }
}

// 导出 markdown 报告（sci_blueprint_export 用）
function exportMarkdown(state, cov, reviewCov = null, spine = null) {
  const core = state.core || {}
  const L = []
  L.push(`# 文章蓝图报告（dsh-science）`)
  L.push('')
  if (state.projectId) {
    const modified = state.updatedAt ? `  · 修订时间：${new Date(state.updatedAt).toISOString()}` : ''
    L.push(`> 项目：${state.projectId}  · 修订：${state.revision}${modified}`)
  } else {
    L.push('> 当前会话尚未绑定科研项目')
  }
  L.push(`> 工作阶段：${state.stage || 'explore'}  · 数据模型：DSH 论文证据主干 v${state.schemaVersion || 2}`)
  L.push('')
  L.push('## 核心')
  L.push('')
  L.push(`- 标题：${core.title || '（未命名）'}`)
  L.push(`- 核心主张：${core.claim || '（未确立）'}`)
  L.push(`- 创新点：${core.innovation || '—'}`)
  L.push(`- 目标期刊：${core.venue || '—'}`)
  L.push(`- 确认状态：${isConfirmationCurrent(core, 'core') ? `🔒 已确认（${core.confirmation.revisionId}）` : '待确认'}`)
  if (state.narrative) {
    L.push('')
    L.push('## 叙事主线')
    L.push('')
    L.push(state.narrative)
  }
  L.push('')
  L.push(`## Results（${(state.results || []).length}）`)
  for (const r0 of state.results || []) {
    const r = resultWithDefaults({ ...r0, tasks: [...(r0.tasks || [])], references: [...(r0.references || [])] })
    L.push('')
    L.push(`### ${r.id} · ${r.title}${r.status ? `（${r.status}）` : ''}${r.confirmed ? ' 🔒已确认' : ' ⏳待确认'}`)
    L.push('')
    L.push(`- 主张：${r.claim || '—'}`)
    L.push(`- 科学目的：${r.purpose || '—'}`)
    L.push(`- 证据方向 / 状态：${r.direction || 'not_assessed'} / ${r.evidenceState || 'planned'}`)
    L.push(`- 文章角色：${r.manuscriptRole || 'main'}`)
    L.push(`- 呈现决策：${(r.presentation && r.presentation.mode) || 'undecided'}${r.presentation && r.presentation.rationale ? `（${r.presentation.rationale}）` : ''}`)
    if ((r.claims || []).length > 0) {
      L.push(`- Claims（${r.claims.length}）：`)
      for (const claim of r.claims) L.push(`  - ${claim.id}@r${claim.revision || 1}：${claim.text}`)
    }
    if ((r.evidence || []).length > 0) {
      L.push(`- 证据包（${r.evidence.length}）：`)
      for (const evidence of r.evidence) {
        L.push(`  - ${evidence.id} [${evidence.direction}/${evidence.state}] → ${(evidence.claimIds || []).map((id) => evidence.claimRevisions?.[id] ? `${id}@r${evidence.claimRevisions[id]}` : id).join('、') || '未绑定 Claim'}`)
        L.push(`    - 来源：${evidence.sourceLocator || '未记录'}`)
        L.push(`    - 允许解释：${evidence.allowedInterpretation || '未记录'}`)
        if (evidence.prohibitedInterpretation) L.push(`    - 不得外推：${evidence.prohibitedInterpretation}`)
      }
    }
    L.push(`- 支撑任务：${(r.tasks || []).join('、') || '无'}`)
    L.push(`- 图表证据：${(r.figures || []).join('、') || '无'}`)
    if ((r.references || []).length > 0) {
      L.push(`- 参考文献（${r.references.length}）：`)
      for (const ref of r.references) {
        L.push(`  - [${ref.usedAs}] ${ref.doi ? `doi:${ref.doi}` : '（无 DOI）'} ${ref.title}${ref.verified ? '（✓ 已核对）' : '（⚠ 未核对）'}`)
      }
    } else {
      L.push('- 参考文献：无')
    }
    if (r.screening) L.push(`- 快筛：${r.screening.decision}${r.screening.note ? `（${r.screening.note}）` : ''}`)
    if (r.notes) L.push(`- notes：${r.notes}`)
  }
  const pv = paperViewOf(state, spine)
  L.push('')
  L.push('## 论文视角摘要')
  L.push('')
  L.push(`- ${pv.summary}`)
  if (spine) {
    L.push('')
    L.push('## 分层就绪状态')
    L.push('')
    L.push(`- 科学就绪 ${spine.counts.scientificReady}/${spine.counts.included} · 文稿就绪 ${spine.counts.manuscriptReady}/${spine.counts.included} · 投稿就绪 ${spine.counts.submissionReady}/${spine.counts.included}`)
    L.push(`- 当前关键决策：${spine.nextDecision}`)
    for (const row of spine.results) {
      if (row.excluded) { L.push(`- ${row.id}：已排除`); continue }
      L.push(`- ${row.id}：科学 ${row.readiness.scientific.state} · 文稿 ${row.readiness.manuscript.state} · 投稿 ${row.readiness.submission.state}；下一步：${row.nextAction}`)
      for (const c of row.claimAssessments) {
        const decision = c.blockers.join('；') || (c.conflictReviewed ? '已复核分歧证据' : '已具备')
        L.push(`  - ${c.id}@r${c.revision} · ${c.text} · ${c.review?.severity || '未审'} · ${decision}`)
      }
    }
  }
  if (reviewCov) {
    const c = reviewCov.counts
    L.push('')
    L.push('## 主张审查覆盖')
    L.push('')
    if (c.total === 0) {
      L.push('- 尚无带 claim 的主张（先 sci_blueprint_set / sci_result_add）。')
    } else {
      L.push(`- 已审 ${c.reviewed}/${c.total}（pass ${c.pass} · warn ${c.warn} · fail ${c.fail}）`)
      for (const v of [reviewCov.core, ...reviewCov.results].filter((x) => x && x.claim)) {
        L.push(`- ${v.id}：${v.severity || '未审'}${v.runId ? `（${v.runId}）` : ''}${v.message ? ` — ${v.message}` : ''}`)
      }
      for (const w of reviewCov.warnings) L.push(`- ⚠ ${w}`)
    }
  }
  L.push('')
  L.push('## 覆盖警告')
  L.push('')
  const resultCount = (state.results || []).length
  if (cov.warnings.length === 0) {
    if (resultCount === 0) L.push('- 尚无 result，覆盖检查未开始（先 sci_result_add）。')
    else if (cov.supportedCount === 0) L.push(`- 尚无 status=supported 的 Result（negative ${cov.negativeCount} · dropped ${cov.droppedCount}）；阴性结果仍保留在证据链。`)
    else L.push('- 覆盖完整，无警告。')
  } else for (const w of cov.warnings) L.push(`- ${w}`)
  L.push('')
  return L.join('\n')
}


// ---- 蓝图工具（阶段 2：全部经 ProjectCommand 写入 Project State；读走蓝图视图）------------
export function registerBlueprintTools(ctx, opts = {}) {
  const store = opts.store
  if (!store) {
    log('project store unavailable — blueprint tools disabled')
    return
  }
  // 确认审批卡：宿主审批卡让用户在实际置位前看到并确认（保留 v0.9.0 语义）
  try {
    if (typeof ctx.on !== 'function') return registerBlueprintToolDefinitions(ctx, opts)
    ctx.on('tools/pre-execute', async (toolExec, next) => {
      if (!toolExec || toolExec.name !== 'sci_blueprint_confirm') return next()
      const args = toolExec.arguments || {}
      const target = args.kind === 'result' ? String(args.result_id || '未知 Result') : '文章核心'
      const prompt = `请确认“${target}”当前修订作为文章承诺；确认后队长才可据此派发执行任务。`
      return {
        kind: 'ask',
        reason: `dsh-science requires user approval before confirming the current revision of ${target}.`,
        displayReason: { en: `Confirm the current revision of ${target} as a manuscript commitment before dispatch.`, zh: prompt, 'zh-CN': prompt },
      }
    })
  } catch (err) {
    log(`confirmation pre-execute gate failed: ${err && err.message}`)
  }

  return registerBlueprintToolDefinitions(ctx, opts)
}

function registerBlueprintToolDefinitions(ctx, opts = {}) {
  const store = opts.store
  const mirror = opts.mirror

  // 读：当前会话的蓝图视图（未绑定 → 空视图，不建项目）
  function readView(exec) {
    const s = readScope(ctx, exec, { store })
    if (!s.ok) throw new Error(s.message || s.code)
    return { ref: s.ref, snapshot: s.snapshot, view: blueprintViewOf(s.snapshot), projectId: s.ref.projectId }
  }
  // 写：ensureProject + executePaperCommands；结果转为可读输出或抛错。
  // L4（M2 安全审查）：优先用宿主工具调用 id 做幂等键——同一次调用的宿主重试不重复写入。
  function staleWrite(snapshot, args) {
    const objectId = args && (args.result_id || args.object_id || args.objectId)
    const expected = args && (args.expected_revision != null ? args.expected_revision : args.expectedRevision)
    if (!objectId || expected == null) return null
    const cited = citeObject(snapshot, { objectId, expectedRevision: expected })
    if (cited.status === 'current') return null
    return { ok: false, saved: false, stale: cited, note: cited.message }
  }

  function write(exec, operations, { source = 'tool' } = {}) {
    const out = writeCommands(ctx, exec, {
      store,
      mutationId: toolMutationId(source, exec),
      source,
      operations,
    })
    return assertApplied(out)
  }

  // -- 核心 ---------------------------------------------------------------
  ctx.tools.register({
    name: 'sci_blueprint_set',
    description:
      '设置/更新文章蓝图：核心（论文标题、核心主张、创新点、目标期刊、叙事主线）与研究问题/范围/来源摘要。科研会话开始时先确立核心（与用户确认核心主张与创新点）；重复调用可增量更新（只传需要改的字段）。写入项目状态（按当前会话解析项目）。研究问题变化只更新上下文与卡片投影，不会自动确认核心或 Result。',
    parameters: {
      core_title: { type: 'string', description: '论文标题（工作标题，可后续修改）' },
      claim: { type: 'string', description: '核心主张：一句话说清文章要论证什么（必填首次）' },
      innovation: { type: 'string', description: '创新点：与已有工作的区分' },
      venue: { type: 'string', description: '目标期刊/会议' },
      narrative: { type: 'string', description: '叙事主线：results 如何逐层支撑核心的一段话' },
      question: { type: 'string', description: '研究问题：一句话说清要回答什么（受限 1000 字）；变化只更新上下文，不确认核心/Result' },
      scope: { type: 'string', description: '研究范围/边界：数据、物种、条件等限制（受限 2000 字）' },
      source_summary: { type: 'string', description: '来源摘要：已有数据/资源/文献来源的简短说明（受限 4000 字）' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const operations = []
      const corePayload = {}
      if (args.core_title != null) corePayload.title = String(args.core_title)
      if (args.claim != null) corePayload.claim = String(args.claim)
      if (args.innovation != null) corePayload.innovation = String(args.innovation)
      if (args.venue != null) corePayload.venue = String(args.venue)
      if (Object.keys(corePayload).length > 0) operations.push({ command: 'paper.propose-core', payload: corePayload })
      if (args.narrative != null) operations.push({ command: 'paper.set-narrative', payload: { narrative: String(args.narrative) } })
      const questionPayload = {}
      const questionArg = args.question != null ? args.question : args.research_question
      if (questionArg != null) questionPayload.question = String(questionArg)
      if (args.scope != null) questionPayload.scope = String(args.scope)
      if (args.source_summary != null) questionPayload.sourceSummary = String(args.source_summary)
      if (Object.keys(questionPayload).length > 0) operations.push({ command: 'paper.set-question', payload: questionPayload })
      if (operations.length === 0) throw new Error('至少提供一个字段（core_title/claim/innovation/venue/narrative/question/scope/source_summary）')
      const before = readView(exec)
      const beforeConfirmed = before.snapshot && before.snapshot.paper.core ? isConfirmationCurrent(before.snapshot.paper.core, 'core') : false
      const out = write(exec, operations)
      const after = readView(exec)
      const core = after.view.core
      const confirmedNow = isConfirmationCurrent(core, 'core')
      const semanticChanged = ['core_title', 'claim', 'innovation', 'venue'].some((k) => args[k] != null)
      const questionChanged = Object.keys(questionPayload).length > 0
      const questionKeys = [
        questionArg != null ? 'question' : null,
        args.scope != null ? 'scope' : null,
        args.source_summary != null ? 'source_summary' : null,
      ].filter(Boolean)
      const out0 = {
        ok: true,
        changed: Object.keys(corePayload)
          .concat(args.narrative != null ? ['narrative'] : [])
          .concat(questionKeys),
        core: coreOut(core),
        coreConfirmed: confirmedNow,
        revision: core.revision,
        resultCount: after.view.results.length,
        question: after.view.question || '',
        scope: after.view.scope || '',
        sourceSummary: after.view.sourceSummary || '',
      }
      if (beforeConfirmed && semanticChanged && !confirmedNow) {
        out0.requireConfirm = true
        out0.note = '核心已修改，确认已失效（当前修订待确认）——向用户说明变更并获同意后，用 sci_blueprint_confirm kind=core 重新确认。'
      } else if (questionChanged) {
        out0.note = '研究问题/范围/来源摘要已更新（项目修订与卡片投影已同步）；不会自动确认核心或 Result，确认仍由用户明确同意后发起。'
      } else {
        out0.note = '核心当前待确认：向用户复述标题/主张/创新点并获明确同意后，调用 sci_blueprint_confirm kind=core。'
      }
      return out0
    },
  })

  // -- Results --------------------------------------------------------------
  ctx.tools.register({
    name: 'sci_result_add',
    description:
      '向文章蓝图添加一个 Result（支撑核心主张的子主张）。建议 3-5 个；超过 5 个只给软提醒（不阻断）——论文主线应保持聚焦，过多时优先合并或明确排除。claim 必须是一句可检验的论断。',
    parameters: {
      result_title: { type: 'string', description: '结果标题（短语，如"MYC 靶基因集显著上调"）' },
      claim: { type: 'string', description: '子主张：该 result 支撑核心的具体论断（必填）' },
      purpose: { type: 'string', description: '科学目的：该 Result 回答什么问题、在文章中承担什么作用' },
      manuscript_role: { type: 'string', description: `文章角色：${MANUSCRIPT_ROLES.join(' | ')}（缺省 main）` },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      if (args.claim == null || String(args.claim).trim() === '') {
        throw new Error('claim 必填：一句话说清该 result 论证什么（可检验的子主张）')
      }
      const out = write(exec, [{
        command: 'paper.propose-result',
        payload: { title: args.result_title, claim: String(args.claim), purpose: args.purpose, manuscriptRole: args.manuscript_role },
      }])
      const after = readView(exec)
      const created = out.receipt.objects.find((o) => o.created) || out.receipt.objects[0]
      const resultId = created ? created.objectId : null
      log(`result added: ${resultId} (${after.view.results.length} total)`)
      const out0 = { ok: true, resultId, resultCount: after.view.results.length, confirmed: false }
      if (after.view.results.length > RESULT_SOFT_CAP) {
        out0.warning = `已超过 ${RESULT_SOFT_CAP} 个 results——论文通常只支撑 ${RESULT_SOFT_CAP} 个以内子主张，考虑合并或舍弃弱结果`
      }
      out0.note = `result 待确认：向用户复述该子主张并获同意后 sci_blueprint_confirm kind=result result_id=${resultId}；确认前 sci_team_dispatch 不能引用它。为所用方法/概念登记参考文献：sci_result_reference_add result_id=${resultId}。`
      return out0
    },
  })

  // -- 状态更新 --------------------------------------------------------------
  ctx.tools.register({
    name: 'sci_result_update',
    description:
      '更新蓝图 Result 的执行状态、证据方向、文章角色和呈现决策。negative 作为兼容状态保留，但不会自动退出证据链；只有 manuscript_role=excluded 才退出。语义修改（标题/主张/目的/角色）会使当前确认失效。',
    parameters: {
      result_id: { type: 'string', description: 'result id（res-N）' },
      status: { type: 'string', description: `枚举：${RESULT_STATUSES.join(' | ')}` },
      notes: { type: 'string', description: '进展/评估说明；status=negative 时必填（对核心的影响与下一步）' },
      result_title: { type: 'string', description: '修改结果标题' },
      claim: { type: 'string', description: '修改子主张表述' },
      purpose: { type: 'string', description: '修改科学目的' },
      direction: { type: 'string', description: `证据方向：${EVIDENCE_DIRECTIONS.join(' | ')}` },
      evidence_state: { type: 'string', description: `证据状态：${EVIDENCE_STATES.join(' | ')}` },
      manuscript_role: { type: 'string', description: `文章角色：${MANUSCRIPT_ROLES.join(' | ')}` },
      presentation_mode: { type: 'string', description: `呈现方式：${PRESENTATION_MODES.join(' | ')}` },
      presentation_rationale: { type: 'string', description: '呈现方式的理由' },
      expected_revision: { type: 'number', description: '对话引用的对象修订。与当前修订不一致时拒绝写入，并返回新旧修订，不静默更换对象。' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const before = readView(exec)
      const stale = staleWrite(before.snapshot, args)
      if (stale) return stale
      const target = findResult(before.view, args.result_id)
      if (String(args.status) === 'negative' && (args.notes == null || String(args.notes).trim() === '')) {
        throw new Error('status=negative 需要 notes 重新评估说明：该负面结果对核心主张意味着什么——调整本 result 的表述/方法重跑，还是动摇核心（证伪讨论）？从核心出发重新评估后再标记。')
      }
      if (args.presentation_mode != null && String(args.presentation_mode) !== 'undecided') {
        const rationale = args.presentation_rationale != null ? String(args.presentation_rationale).trim() : String((target.presentation && target.presentation.rationale) || '').trim()
        if (!rationale) throw new Error('选择呈现方式时 presentation_rationale 必填：说明为什么使用图、表、正文、补充材料或不展示。')
      }
      const payload = { resultId: target.id }
      for (const [argKey, payloadKey] of [
        ['status', 'status'], ['notes', 'notes'], ['result_title', 'title'], ['claim', 'claim'], ['purpose', 'purpose'],
        ['direction', 'direction'], ['evidence_state', 'evidenceState'], ['manuscript_role', 'manuscriptRole'],
      ]) {
        if (args[argKey] != null) payload[payloadKey] = args[argKey]
      }
      if (args.presentation_mode != null) payload.presentationMode = String(args.presentation_mode)
      if (args.presentation_rationale != null) payload.presentationRationale = String(args.presentation_rationale)
      const wasConfirmed = isConfirmationCurrent(target, target.id)
      const semanticTouched = ['result_title', 'claim', 'purpose', 'manuscript_role'].some((k) => args[k] != null)
      const out = write(exec, [{ command: 'paper.update-result', payload }])
      const after = readView(exec)
      const result = findResult(after.view, target.id)
      const confirmedNow = isConfirmationCurrent(result, result.id)
      const touched = out.receipt.changedKeys || []
      const out0 = { ok: true, resultId: result.id, status: result.status, notes: result.notes || '', confirmed: confirmedNow, revision: result.revision, modified: touched.length ? ['paper.results'] : [] }
      if (wasConfirmed && semanticTouched && !confirmedNow) {
        out0.requireConfirm = true
        out0.note = '已确认的 result 被语义修改，confirmation 已失效——向用户说明变更并获同意后 sci_blueprint_confirm kind=result result_id=' + result.id + ' 重新确认。'
      }
      if (result.status === 'negative') {
        out0.nextStep = '已记录负面结果——从核心出发重新评估：调整该 result（改 claim/换方法重派任务）或提出新 result；多个负面且无 supported 时向用户提示证伪风险'
      }
      return out0
    },
  })

  // -- 确认工作流 --------------------------------------------------------------
  ctx.tools.register({
    name: 'sci_blueprint_confirm',
    description:
      '确认文章蓝图条目（绑定当前对象修订）。kind=core 确认核心（标题/主张/创新点）；kind=result 确认某个 result（result_id 必填）。只有用户在对话中明确同意该条目内容后才可调用；未确认的 result 不能被 sci_team_dispatch 引用（派发会被拒）。修改已确认条目会自动失效确认。',
    parameters: {
      kind: { type: 'string', description: '枚举：core | result（必填）' },
      result_id: { type: 'string', description: 'kind=result 时必填：result id（res-N）' },
      confirmation_source: { type: 'string', description: '确认来源：conversation | ui-action；缺省 conversation' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const kind = String(args.kind || '')
      const before = readView(exec)
      const objectId = kind === 'core' ? 'core' : String(args.result_id || '')
      if (kind !== 'core' && kind !== 'result') throw new Error(`非法 kind "${kind}"（可用：core | result）`)
      const obj = findObjectIn(before.view, objectId)
      if (!obj) throw new Error(kind === 'core' ? '核心为空（无 title/claim）——先用 sci_blueprint_set 确立核心。' : `result ${objectId} 不存在`)
      if (kind === 'core' && !obj.title && !obj.claim) throw new Error('核心为空（无 title/claim）——先用 sci_blueprint_set 确立核心，与用户确认后再调用本工具。')
      const out = write(exec, [{
        command: 'paper.confirm-revision',
        payload: { objectId: obj === before.view.core ? 'core' : obj.id, expectedObjectRevision: objectRevisionOf(obj), expectedHash: contentHashOf(obj), source: String(args.confirmation_source || 'conversation') },
      }], { source: 'tool' })
      const receipt = out.receipt.objects[0] || {}
      if (kind === 'core') {
        const after = readView(exec)
        return { ok: true, kind: 'core', confirmed: true, revision: after.view.core.revision, confirmation: after.view.core.confirmation, core: coreOut(after.view.core) }
      }
      const after = readView(exec)
      const result = findResult(after.view, objectId)
      return { ok: true, kind: 'result', resultId: result.id, confirmed: true, revision: result.revision, confirmation: result.confirmation, status: result.status || 'planned', contentHash: receipt.contentHash }
    },
  })

  // -- DSH 论文证据主干 v2：Claim / Evidence / 阶段 / 投稿检查 -----------------
  ctx.tools.register({
    name: 'sci_claim_add',
    description: '在指定 Result 下新增一条可独立核验的 Claim。新增 Claim 会形成新的 Result 语义修订，原确认凭据失效，需重新向用户确认。',
    parameters: {
      result_id: { type: 'string', description: 'Result id（res-N）' },
      claim: { type: 'string', description: '可检验的科学主张（必填）' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const text = String(args.claim || '').trim()
      if (!text) throw new Error('claim 必填：写成可以被证据支持、反驳或判为不确定的科学主张。')
      const before = readView(exec)
      const target = findResult(before.view, args.result_id)
      const out = write(exec, [{ command: 'paper.record-claim', payload: { resultId: target.id, text } }])
      const after = readView(exec)
      const result = findResult(after.view, target.id)
      const claim = result.claims[result.claims.length - 1]
      return { ok: true, resultId: result.id, claimId: claim.id, claimCount: result.claims.length, confirmed: isConfirmationCurrent(result, result.id), revision: result.revision, requireConfirm: true }
    },
  })

  ctx.tools.register({
    name: 'sci_claim_retire',
    description: '退休一条 Claim（保留 id 与证据引用；status=retired 后审查清单与语义哈希不再把它当 active 核对）。退休会推进 Result 修订并使确认失效，需重新确认。',
    parameters: {
      result_id: { type: 'string', description: 'Result id（res-N）' },
      claim_id: { type: 'string', description: 'Claim id（res-N-claim-M）' },
      reason: { type: 'string', description: '退休理由（保留历史，建议填写）' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const before = readView(exec)
      const target = findResult(before.view, args.result_id)
      if (!target.claims.some((c) => c && c.id === String(args.claim_id))) {
        throw new Error(`Claim ${args.claim_id} 不存在（现有：${target.claims.map((c) => c.id).join('、') || '空'}）`)
      }
      write(exec, [{ command: 'paper.retire-claim', payload: { resultId: target.id, claimId: String(args.claim_id), reason: args.reason } }])
      const after = readView(exec)
      const result = findResult(after.view, target.id)
      return { ok: true, resultId: result.id, claimId: String(args.claim_id), retired: true, confirmed: isConfirmationCurrent(result, result.id), revision: result.revision, requireConfirm: true }
    },
  })

  ctx.tools.register({
    name: 'sci_evidence_add',
    description: '向 Result 的 Claim 绑定证据包：记录方向、核验状态、来源定位、实验条件、不确定性及允许/禁止的解释。state=verified 时必须提供 source_locator 与 allowed_interpretation。',
    parameters: {
      result_id: { type: 'string' },
      claim_ids: { type: 'array', description: '被该证据支持/反驳的 Claim id 数组；至少一个' },
      direction: { type: 'string', description: EVIDENCE_DIRECTIONS.join(' | ') },
      state: { type: 'string', description: EVIDENCE_STATES.join(' | ') },
      source_locator: { type: 'string', description: '可复查来源，如文件#行号、表格单元格、数据库记录或分析输出' },
      conditions: { type: 'string' },
      uncertainty: { type: 'string' },
      allowed_interpretation: { type: 'string' },
      prohibited_interpretation: { type: 'string' },
      note: { type: 'string' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const before = readView(exec)
      const target = findResult(before.view, args.result_id)
      const direction = String(args.direction || '')
      const evidenceState = String(args.state || '')
      if (!EVIDENCE_DIRECTIONS.includes(direction)) throw new Error(`direction 必须是：${EVIDENCE_DIRECTIONS.join(' | ')}`)
      if (!EVIDENCE_STATES.includes(evidenceState)) throw new Error(`state 必须是：${EVIDENCE_STATES.join(' | ')}`)
      const claimIds = [...new Set((Array.isArray(args.claim_ids) ? args.claim_ids : []).map(String).filter(Boolean))]
      if (claimIds.length === 0) throw new Error('claim_ids 至少包含一个 Claim id。')
      const known = new Set(target.claims.map((c) => c.id))
      const unknown = claimIds.filter((id) => !known.has(id))
      if (unknown.length > 0) throw new Error(`未知 Claim：${unknown.join('、')}（现有：${[...known].join('、') || '空'}）`)
      const sourceLocator = String(args.source_locator || '').trim()
      const allowedInterpretation = String(args.allowed_interpretation || '').trim()
      if (evidenceState === 'verified' && (!sourceLocator || !allowedInterpretation)) {
        throw new Error('state=verified 必须同时提供 source_locator 与 allowed_interpretation，确保来源可追溯且结论边界明确。')
      }
      const out = write(exec, [{
        command: 'paper.record-evidence',
        payload: {
          resultId: target.id, claimIds, direction, state: evidenceState,
          sourceLocator, conditions: args.conditions, uncertainty: args.uncertainty,
          allowedInterpretation, prohibitedInterpretation: args.prohibited_interpretation, note: args.note,
        },
      }])
      const after = readView(exec)
      const result = findResult(after.view, target.id)
      const evidence = result.evidence[result.evidence.length - 1]
      return { ok: true, resultId: result.id, evidenceId: evidence.id, evidence, evidenceCount: result.evidence.length }
    },
  })

  ctx.tools.register({
    name: 'sci_blueprint_stage',
    description: `设置/记录论文工作阶段：${PAPER_STAGES.join(' | ')}。阶段是描述性上下文，只校验枚举并记录说明，不作为执行闸门；正式派单只由 sci_team_dispatch 的 dispatch gate 把关。`,
    parameters: { stage: { type: 'string' }, note: { type: 'string', description: '阶段变化原因，回退时建议填写' } },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const stage = String(args.stage || '')
      if (!PAPER_STAGES.includes(stage)) throw new Error(`stage 必须是：${PAPER_STAGES.join(' | ')}`)
      const before = readView(exec)
      const previous = before.view.stage
      write(exec, [{ command: 'paper.set-stage', payload: { stage, note: args.note } }])
      return { ok: true, previous, stage, note: String(args.note || ''), gated: false, guidance: '阶段只记录上下文；派单仍由 dispatch gate 校验核心/目标 Result 的当前确认。' }
    },
  })

  ctx.tools.register({
    name: 'sci_submission_check',
    description: `记录投稿级检查。item：${SUBMISSION_ITEMS.join(' | ')}；status：pending | complete | not_applicable。`,
    parameters: { item: { type: 'string' }, status: { type: 'string' }, note: { type: 'string' } },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const item = String(args.item || ''); const status = String(args.status || '')
      if (!SUBMISSION_ITEMS.includes(item)) throw new Error(`item 必须是：${SUBMISSION_ITEMS.join(' | ')}`)
      if (!['pending', 'complete', 'not_applicable'].includes(status)) throw new Error('status 必须是：pending | complete | not_applicable')
      write(exec, [{ command: 'paper.set-submission-check', payload: { item, status, note: args.note } }])
      const after = readView(exec)
      return { ok: true, item, check: after.view.submission[item], submission: after.view.submission }
    },
  })

  // -- 每Result参考文献 ---------------------------------------------------------
  const REF_USED_AS = ['method', 'concept', 'background', 'evidence']
  const REF_RELATIONS = ['supports', 'conflicts', 'context', 'method']
  ctx.tools.register({
    name: 'sci_result_reference_add',
    description:
      `为蓝图 result 登记一条参考文献（该 result 所用的方法/概念/背景/证据）。used_as 枚举：${REF_USED_AS.join(' | ')}。带 ref_doi 时自动经 Crossref 核对并回填标题（核对失败/无 DOI → verified=false，提示用户核对）；ref_doi 与 ref_title 至少提供一个。结果设计时必须为所用方法/概念登记参考文献（队长协议）。`,
    parameters: {
      result_id: { type: 'string', description: 'result id（res-N，必填）' },
      ref_doi: { type: 'string', description: 'DOI（推荐提供，自动 Crossref 核对标题并标 verified）' },
      ref_title: { type: 'string', description: '文献标题（无 DOI 时必填；有 DOI 时可省略——自动回填）' },
      used_as: { type: 'string', description: `该文献在本 result 中的用途，枚举：${REF_USED_AS.join(' | ')}（缺省 method）` },
      claim_ids: { type: 'array', description: '可选：该文献对应的稳定 Claim id 数组' },
      relation: { type: 'string', description: `与 Claim 的关系：${REF_RELATIONS.join(' | ')}` },
      source_locator: { type: 'string', description: '文献内定位，如页码、图号、章节或表格' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const before = readView(exec)
      const target = findResult(before.view, args.result_id)
      const usedAs = String(args.used_as || '').trim()
      if (!REF_USED_AS.includes(usedAs)) throw new Error(`used_as 必填且必须是：${REF_USED_AS.join(' | ')}`)
      const claimIds = [...new Set((Array.isArray(args.claim_ids) ? args.claim_ids : []).map(String).filter(Boolean))]
      const knownClaimIds = new Set((target.claims || []).map((c) => c && c.id).filter(Boolean))
      const unknownClaimIds = claimIds.filter((id) => !knownClaimIds.has(id))
      if (unknownClaimIds.length > 0) throw new Error(`未知 Claim：${unknownClaimIds.join('、')}（现有：${[...knownClaimIds].join('、') || '空'}）`)
      const relation = args.relation == null || String(args.relation).trim() === '' ? (usedAs === 'method' ? 'method' : 'context') : String(args.relation).trim()
      if (!REF_RELATIONS.includes(relation)) throw new Error(`relation 必须是：${REF_RELATIONS.join(' | ')}`)
      const doiRaw = args.ref_doi != null && String(args.ref_doi).trim() !== '' ? String(args.ref_doi) : ''
      const titleRaw = args.ref_title != null ? String(args.ref_title).trim() : ''
      if (!doiRaw && !titleRaw) {
        throw new Error('ref_doi 与 ref_title 至少提供一个：有 DOI 一律带 DOI（自动核对）；无 DOI 手工登记需 ref_title（verified=false 待人工核对）。')
      }
      const doiNorm = doiRaw ? normalizeDoi(doiRaw) : ''
      const dup = (target.references || []).find(
        (x) => x.usedAs === usedAs && ((doiNorm && x.doi && normalizeDoi(x.doi) === doiNorm) || (!doiNorm && titleRaw && x.title === titleRaw)),
      )
      if (dup) {
        const out = write(exec, [{
          command: 'paper.link-reference',
          payload: { resultId: target.id, doi: doiNorm || dup.doi, title: titleRaw || dup.title, usedAs, claimIds, relation, sourceLocator: args.source_locator },
        }])
        const after = readView(exec)
        const merged = findResult(after.view, target.id).references.find((x) => x.usedAs === usedAs && ((doiNorm && x.doi === doiNorm) || (!doiNorm && x.title === titleRaw)))
        return { ok: true, resultId: target.id, reference: merged, duplicate: true, updatedBinding: true, note: '该文献与用途已登记；Claim 绑定与来源定位已合并。' }
      }
      let refPayload = { resultId: target.id, usedAs, claimIds, relation, sourceLocator: args.source_locator, doi: doiNorm, title: titleRaw, providedTitle: doiRaw ? titleRaw : undefined, verified: false, verifyError: '' }
      const out0 = { ok: true, resultId: target.id, usedAs }
      if (doiRaw) {
        const v = await verifyDoi(doiRaw)
        if (v.ok) {
          refPayload = { ...refPayload, doi: v.doi, title: v.title || titleRaw || '', verified: true }
          out0.crossref = { title: v.title || '', container: v.containerTitle || '', year: v.year || null, authors: v.authors || [] }
        } else {
          refPayload.verifyError = String(v.error || '核对失败')
          if (!refPayload.title) refPayload.title = `doi:${doiNorm}`
          out0.crossrefError = refPayload.verifyError
          out0.warning = 'DOI 未能核对通过（verified=false）——已按未核对登记，请人工核对引用真实性；编造引用是学术不端。'
        }
      } else {
        out0.warning = '未提供 DOI，参考文献标记 verified=false（未经核对）——建议补 DOI 重新登记以自动核对。'
      }
      write(exec, [{ command: 'paper.link-reference', payload: refPayload }])
      const after = readView(exec)
      const result = findResult(after.view, target.id)
      const ref = result.references[result.references.length - 1]
      log(`reference added: ${result.id} ← ${ref.doi || ref.title} (${usedAs}, verified=${ref.verified})`)
      out0.reference = ref
      out0.referencesCount = result.references.length
      return out0
    },
  })

  ctx.tools.register({
    name: 'sci_result_reference_verify',
    description: '重新通过 Crossref 核对 result 中已登记 DOI，并用权威标题更新该用途条目。参数：result_id、ref_doi、used_as。',
    parameters: {
      result_id: { type: 'string' }, ref_doi: { type: 'string' }, used_as: { type: 'string' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const before = readView(exec)
      const target = findResult(before.view, args.result_id)
      const usedAs = String(args.used_as || '').trim(); if (!REF_USED_AS.includes(usedAs)) throw new Error(`used_as 必须是：${REF_USED_AS.join(' | ')}`)
      const doi = normalizeDoi(args.ref_doi)
      const ref = target.references.find((x) => x.usedAs === usedAs && normalizeDoi(x.doi || '') === doi)
      if (!ref) throw new Error(`未找到 DOI ${doi}（${usedAs}）的参考文献条目`)
      const v = await verifyDoi(doi)
      write(exec, [{
        command: 'paper.verify-reference',
        payload: { resultId: target.id, usedAs, doi, verified: !!v.ok, verifyError: v.ok ? '' : String(v.error || '核对失败'), title: v.ok ? (v.title || undefined) : undefined },
      }])
      const after = readView(exec)
      const updated = findResult(after.view, target.id).references.find((x) => x.usedAs === usedAs && (doi ? x.doi === doi : true))
      return { ok: v.ok, resultId: target.id, reference: updated, ...(v.ok ? {} : { warning: 'Crossref 核对失败，请人工核对。' }) }
    },
  })

  ctx.tools.register({
    name: 'sci_result_reference_remove',
    description: '删除 result 中指定 DOI 与用途组合的参考文献条目。参数：result_id、ref_doi、used_as。',
    parameters: {
      result_id: { type: 'string' }, ref_doi: { type: 'string' }, used_as: { type: 'string' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const before = readView(exec)
      const target = findResult(before.view, args.result_id)
      const usedAs = String(args.used_as || '').trim()
      if (!REF_USED_AS.includes(usedAs)) throw new Error(`used_as 必须是：${REF_USED_AS.join(' | ')}`)
      const doi = normalizeDoi(args.ref_doi)
      write(exec, [{ command: 'paper.remove-reference', payload: { resultId: target.id, usedAs, doi } }])
      const after = readView(exec)
      return { ok: true, resultId: target.id, removed: { doi, usedAs }, referencesCount: findResult(after.view, target.id).references.length }
    },
  })

  // -- 文献快筛 --------------------------------------------------------------
  const SCREENING_DECISIONS = ['include', 'exclude', 'maybe']
  ctx.tools.register({
    name: 'sci_result_screening',
    description:
      `记录蓝图 result 的文献快筛结论（AI 辅助初筛记录，不改变派单/正文资格——退出文章由 manuscript_role=excluded 决定）。decision 枚举：${SCREENING_DECISIONS.join(' | ')}；screening_note 说明纳入/排除理由（exclude 必填）。最终取舍由用户决定（建议 exclude/maybe 时向用户汇报）。`,
    parameters: {
      result_id: { type: 'string', description: 'result id（res-N，必填）' },
      decision: { type: 'string', description: `枚举：${SCREENING_DECISIONS.join(' | ')}（必填）` },
      screening_note: { type: 'string', description: '快筛理由；decision=exclude 时必填' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const before = readView(exec)
      const target = findResult(before.view, args.result_id)
      const decision = String(args.decision || '')
      if (!SCREENING_DECISIONS.includes(decision)) {
        throw new Error(`非法 decision "${decision}"（可用枚举：${SCREENING_DECISIONS.join(' | ')}）`)
      }
      const note = args.screening_note != null ? String(args.screening_note).slice(0, 2000) : ''
      if (decision === 'exclude' && note.trim() === '') {
        throw new Error('decision=exclude 需要 screening_note 说明排除理由（可追溯）。')
      }
      write(exec, [{ command: 'paper.set-screening', payload: { resultId: target.id, decision, screeningNote: note } }])
      log(`screening: ${target.id} → ${decision}`)
      return {
        ok: true,
        resultId: target.id,
        screening: { decision, note, decidedAt: Date.now() },
        note: decision === 'include' ? '已纳入证据链——为所用方法/概念登记参考文献（sci_result_reference_add）。' : '快筛结论已记录，向用户汇报后由用户最终取舍。',
      }
    },
  })

  // -- 蓝图导出 --------------------------------------------------------------
  ctx.tools.register({
    name: 'sci_blueprint_export',
    description:
      '把当前课题的蓝图按项目和修订归档为 Markdown，返回报告路径 path。包括核心、Result、任务、图表、参考文献、审查覆盖及论文摘要。相同内容复用已有报告，人工编辑和旧版报告保留。',
    parameters: {},
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const agent = exec && exec.agent
      const session = agent && agent.session
      if (!session || !ctx.workingDirectory) {
        throw new Error('无法确定会话工作目录（workingDirectory 服务不可用）——报告导出需要 web/桌面会话上下文。')
      }
      let cwd = null
      try {
        cwd = ctx.workingDirectory.get(session)
      } catch (err) {
        throw new Error(`读取工作目录失败：${err && err.message}`)
      }
      if (!cwd) throw new Error('当前会话没有工作目录——先确认会话已打开工作区。')
      const { view, projectId, ref } = readView(exec)
      const { team, figures, reviewCoverage: reviewCov, paperSpine: spine } = projectScienceOf(view, ref, store)
      const cov = coverageOf(view, team, figures)
      const md = exportMarkdown(view, cov, reviewCov, spine)
      const archive = saveBlueprintReport(cwd, projectId, view.revision ?? 0, md)
      log(`blueprint exported: ${archive.path} (${md.length} chars)`)
      return {
        ok: true,
        ...archive,
        bytes: Buffer.byteLength(md, 'utf8'),
        projectId,
        resultCount: view.results.length,
        coverageStarted: view.results.length > 0,
        unverifiedReferences: view.results.reduce((n, r) => n + ((r.references || []).filter((x) => !x.verified).length || 0), 0),
        warningCount: cov.warnings.length,
      }
    },
  })

  // -- 任务对齐 --------------------------------------------------------------
  ctx.tools.register({
    name: 'sci_blueprint_align',
    description:
      '把团队任务板上的任务对齐到蓝图 result（task-N → res-N）。sci_team_dispatch 支持 result_id 参数一步完成；本工具用于补挂/改挂已有任务。',
    parameters: {
      task_id: { type: 'string', description: '任务 id（task-N，必须已在团队任务板上）' },
      result_id: { type: 'string', description: 'result id（res-N）' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      return alignTaskToResult(ctx, args.task_id, args.result_id, { store, exec, mirror })
    },
  })

  // -- 图表挂接 --------------------------------------------------------------
  ctx.tools.register({
    name: 'sci_blueprint_link_figure',
    description:
      '把已登记的图表挂为蓝图 result 的图表证据（fig-* → res-N）。sci_figure_register 支持 result_id 参数一步完成；本工具用于补挂。',
    parameters: {
      figure_id: { type: 'string', description: '图表 id（sci_figure_register 返回的 figureId，fig-*）' },
      result_id: { type: 'string', description: 'result id（res-N）' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      return linkFigureToResult(ctx, args.figure_id, args.result_id, { store, exec, mirror })
    },
  })

  // -- 总览 + 覆盖分析 ---------------------------------------------------------
  ctx.tools.register({
    name: 'sci_context_pack',
    description: '读取当前会话的最小论文上下文。只返回课题、研究问题、骨架修订、选中对象的摘要和引用。不接受 projectId，不读取其他项目，不把正文当业务状态写回。',
    parameters: {
      object_id: { type: 'string', description: '可选。当前要讨论的 core 或 res-N。' },
      expected_revision: { type: 'number', description: '对话里引用的对象修订。过期时返回被引用修订和当前修订。' },
      expand_evidence: { type: 'array', description: '明确要求展开正文的证据 id。未列出的证据只返回摘要。' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const scope = readScope(ctx, exec, { store })
      if (!scope.ok || !scope.snapshot) return { ok: true, saved: false, context: buildContextPack(null) }
      const pack = buildContextPack(scope.snapshot, {
        objectRef: args.object_id ? { objectId: String(args.object_id), expectedRevision: args.expected_revision } : null,
        expand: { evidence: Array.isArray(args.expand_evidence) ? args.expand_evidence.map(String) : [] },
      })
      return { ok: true, saved: false, context: pack }
    },
  })

  ctx.tools.register({
    name: 'sci_structure_propose',
    description: '提交有来源的暂定结构提案。只通过领域命令写入，不确认、不派发。来源必填；过期对象引用不会被静默替换。',
    parameters: {
      source: { type: 'string', description: '提案来源，如 conversation:turn-12 或 user-confirmed-note。必填。' },
      core_claim: { type: 'string', description: '可选核心主张提案' },
      result_id: { type: 'string', description: '要修改的 Result；缺省则新建' },
      result_title: { type: 'string', description: 'Result 标题' },
      claim: { type: 'string', description: 'Result 子主张' },
      purpose: { type: 'string', description: '该 Result 要回答的问题' },
      expected_revision: { type: 'number', description: '引用的对象修订' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      const source = String(args.source || '').trim()
      if (!source) throw new Error('结构提案必须带来源，不能把任意 Markdown 或聊天全文直接覆盖项目状态。')
      if (args.core_claim == null && args.claim == null) throw new Error('结构提案至少要包含核心主张或 Result 主张。')
      const before = readView(exec)
      const stale = staleWrite(before.snapshot, args)
      if (stale) return stale
      const operations = []
      if (args.core_claim != null) operations.push({ command: 'paper.propose-core', payload: { claim: String(args.core_claim) } })
      if (args.result_id) {
        operations.push({ command: 'paper.update-result', payload: { resultId: String(args.result_id), title: args.result_title, claim: args.claim, purpose: args.purpose } })
      } else if (args.claim != null) {
        operations.push({ command: 'paper.propose-result', payload: { title: args.result_title, claim: String(args.claim), purpose: args.purpose } })
      }
      operations.push({ command: 'paper.record-proposal', payload: { source, objectIds: args.result_id ? [String(args.result_id)] : [], note: 'structure proposal' } })
      const out = write(exec, operations, { source: 'structure-proposal' })
      return { ok: true, saved: true, receipt: out.receipt, requireConfirm: true, note: '结构提案已保存为待确认草案，尚未确认。' }
    },
  })

  ctx.tools.register({
    name: 'sci_blueprint_overview',
    description:
      '文章蓝图总览 + 覆盖分析：核心、各 result 及其任务/图表对齐、缺失警告（无任务/无图表/任务未对齐/图表未挂接）、负面结果计数与证伪风险。派发任务前检查对齐；向用户汇报时按文章视角组织。',
    parameters: {},
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(_args, exec) {
      const { view, snapshot, projectId, ref } = readView(exec)
      const team = readTeamState()
      // 死引用就地摘除（unlink 命令，幂等）：result.tasks ⊆ 团队任务板
      const existing = new Set(
        team && Array.isArray(team.tasks) ? team.tasks.map((t) => t && t.id).filter(Boolean) : [],
      )
      const prunedStaleTasks = []
      for (const r of view.results) {
        if (!Array.isArray(r.tasks) || r.tasks.length === 0) continue
        const dead = r.tasks.filter((id) => !existing.has(id))
        if (dead.length > 0) {
          prunedStaleTasks.push({ resultId: r.id, dropped: dead })
        }
      }
      if (prunedStaleTasks.length > 0 && snapshot) {
        writeCommands(ctx, exec, {
          store,
          mutationId: `prune-stale-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          source: 'tool',
          operations: prunedStaleTasks.flatMap((row) => row.dropped.map((taskId) => ({ command: 'paper.unlink-task', payload: { taskId } }))),
        })
        log(`coverage pruned stale task refs: ${JSON.stringify(prunedStaleTasks)}`)
      }
      const teamAfter = readTeamState()
      const { figures, team: scopedTeam, reviewCoverage, paperSpine } = projectScienceOf(view, ref, store)
      const results = view.results.map((r) => {
        // T4：先按领域对象原始内容计算 hash，再补输出默认字段——保证卡片 expectedHash 与确认 CAS 同口径。
        const contentHash = contentHashOf(r)
        return resultOut(resultWithDefaults(r), contentHash)
      })
      const refsTotal = results.reduce((n, r) => n + r.references.length, 0)
      const unverifiedRefs = results.reduce((n, r) => n + r.references.filter((x) => !x.verified).length, 0)
      return {
        projectId,
        revision: snapshot ? snapshot.revision : 0,
        schemaVersion: view.schemaVersion || 2,
        stage: view.stage,
        core: { ...coreOut(view.core), confirmed: isConfirmationCurrent(view.core, 'core'), revision: view.core.revision || 1, confirmation: view.core.confirmation || null },
        results,
        paperView: paperViewOf(view, paperSpine),
        paperProgress: paperProgressOf(view, scopedTeam, figures, reviewCoverage, paperSpine),
        paperSpine,
        submission: view.submission,
        confirmedSummary: {
          coreConfirmed: isConfirmationCurrent(view.core, 'core'),
          resultsConfirmed: view.results.filter((r) => isConfirmationCurrent(r, r.id)).length,
          resultsTotal: results.length,
          referencesTotal: refsTotal,
          unverifiedReferences: unverifiedRefs,
          note: unverifiedRefs > 0 ? `有 ${unverifiedRefs} 条参考文献未通过核对（verified=false）——人工核对或补 DOI 重新登记。` : '',
        },
        narrative: view.narrative,
        question: view.question || '',
        scope: view.scope || '',
        sourceSummary: view.sourceSummary || '',
        questionUpdatedAt: view.questionUpdatedAt || 0,
        softWarnings: results.length > RESULT_SOFT_CAP
          ? [`Result 已有 ${results.length} 个（软上限 ${RESULT_SOFT_CAP}）——建议合并重复/弱结果或明确排除，保持论文主线聚焦（不阻断继续）。`]
          : [],
        coverage: coverageOf(view, teamAfter, figures),
        reviewCoverage,
        prunedStaleTasks,
        taskCount: teamAfter && Array.isArray(teamAfter.tasks) ? teamAfter.tasks.filter((t) => t && String(t.status ?? '').toLowerCase() !== 'deleted').length : 0,
        deletedTaskCount: teamAfter && Array.isArray(teamAfter.tasks) ? teamAfter.tasks.filter((t) => t && String(t.status ?? '').toLowerCase() === 'deleted').length : 0,
      }
    },
  })

  // -- 旧数据导入（阶段 5 迁移预览的工具面）--------------------------------------
  ctx.tools.register({
    name: 'sci_blueprint_import_legacy',
    description:
      '把旧版全局 blueprint.json 导入当前会话的项目（只读导入，不删除原文件；幂等——同源重复导入返回原回执）。语义：Result 保留旧确认凭据（legacy-migration，可直接用于派单闸门）；核心导入后需重新确认。dry_run=true 只预览不写入。',
    parameters: {
      legacy_json: { type: 'string', description: '旧 blueprint.json 的完整 JSON 文本' },
      source_file: { type: 'string', description: '来源文件路径（记录用，如 blueprint.json）' },
      dry_run: { type: 'boolean', description: 'true = 只预览将导入的内容，不落任何写入' },
    },
    output: { schema: { type: 'object' }, render: (_a, v) => [{ type: 'text', text: JSON.stringify(v, null, 2) }] },
    async execute(args, exec) {
      let legacy = null
      try {
        legacy = JSON.parse(String(args.legacy_json || ''))
      } catch (err) {
        throw new Error(`legacy_json 不是合法 JSON：${err && err.message}`)
      }
      if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) throw new Error('legacy_json 必须是旧蓝图对象')
      const r = importLegacyBlueprint(ctx, exec, { store, legacy, sourceFile: args.source_file, dryRun: args.dry_run === true })
      if (!r.ok) throw new Error(r.error || '导入失败')
      return r
    },
  })

  log('blueprint tools registered on Project State (set/result/claim/evidence/confirm/stage/submission/reference/screening/export/align/link/overview/import-legacy)')
}
