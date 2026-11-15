// dsh-science — Project State ↔ 现有领域读模型的桥接适配层（阶段 2）
//
// 设计真源 §8.1/§17：现有 host 能力（blueprint 工具、reviewer、figures、/state 读模型）
// 全部改为读 Project State、写 ProjectCommand。本模块提供唯一的双向映射：
//   1. blueprintViewOf(snapshot) —— 快照 → 旧 blueprint.json 形状的只读视图，
//      让 paperspine/reviewcov/blueprint 的读模型函数与 /state 快照继续工作；
//   2. importLegacyBlueprint —— 旧全局 blueprint.json 的只读导入（project.import-legacy，
//      带 migrationId 幂等与源 hash 台账）；
//   3. sessionScopeOf(exec) —— 从工具 exec 提取可信 sessionId（host 侧 agent，不经客户端）。

import { createHash } from 'node:crypto'
import { resolveProjectContext, ensureProject } from './project-context.js'
import { executePaperCommands, contentHashOf, objectRevisionOf, COMMANDS } from './project-domain.js'
import { StoreError } from './project-store.js'

function log(msg) {
  console.log(`[dsh-science project-adapter] ${msg}`)
}

// ---- 会话与 scope ---------------------------------------------------------------
// 工具 exec 的身份来自宿主 agent（exec.agent.session?.id ?? agent.id）——这是 host 侧
// 事实，不是客户端可伪造输入。无 sessions 服务（headless 测试/纯 host 组合）时按
// 独立 root 会话处理（每个会话一个项目，隔离语义不变）。
export function sessionIdOf(exec) {
  const agent = exec && exec.agent
  const sid = (agent && agent.session && agent.session.id) || (agent && agent.id) || null
  return sid ? String(sid) : null
}

export function scopeOfExec(ctx, exec, { store } = {}) {
  const sid = sessionIdOf(exec)
  if (!sid) return { ok: false, code: 'unknown-session', message: '无法确定调用者会话（需要主会话上下文）' }
  return resolveProjectContext(ctx, sid, { store })
}

// 读路径：绑定项目后返回 { ref, snapshot }；未绑定 → { ref, snapshot: null }（空视图，不建项目）。
export function readScope(ctx, exec, { store } = {}) {
  const scope = scopeOfExec(ctx, exec, { store })
  if (!scope.ok) return scope
  const ref = scope.ref
  if (!ref.projectId) return { ok: true, ref, snapshot: null }
  const snap = store.snapshotOf(ref.projectId)
  if (snap && snap.corrupt) {
    return { ok: false, code: 'snapshot-corrupt', message: '项目快照损坏，进入只读恢复模式' }
  }
  return { ok: true, ref, snapshot: snap ? snap.snapshot : null }
}

// 写路径：ensureProject（首写建项目）+ executePaperCommands。
export function writeCommands(ctx, exec, { store, mutationId, operations, expectedRevision = null, source = 'tool' }) {
  const sid = sessionIdOf(exec)
  if (!sid) return { kind: 'invalid', reason: '无法确定调用者会话' }
  const ensured = ensureProject(ctx, sid, { store })
  if (!ensured.ok) {
    return { kind: ensured.code === 'fork-isolated' ? 'forbidden' : ensured.code === 'needs-binding' ? 'needs-binding' : 'invalid', reason: ensured.message || ensured.code }
  }
  return executePaperCommands(store, ensured.ref, {
    mutationId,
    expectedRevision,
    source,
    actor: { sessionId: sid, relationship: ensured.ref.relationship },
    operations,
  })
}

// 写权限断言（工具入口用）：fork/成员直接拒绝，给出可执行恢复提示。
export function assertToolWriteAllowed(ref) {
  if (!ref || !ref.capabilities || !ref.capabilities.writePaper) {
    throw new StoreError('forbidden', '当前会话没有论文语义写权限（成员只能提交提案与任务回报；普通 fork 与父项目隔离）。请在队长/root 会话中执行。')
  }
}

// ---- 快照 → 旧蓝图视图（读模型等价映射）--------------------------------------------
// 目标形状：lib/paperspine.js normalizePaperSpine / coverageOf / paperSpineViewOf /
// reviewCoverageOf 的输入。字段一一对应；确认凭据直接透传（含 objectRevision/contentHash）。
export function blueprintViewOf(snapshot) {
  if (!snapshot) {
    return normalizeShape({
      schemaVersion: 2, stage: 'explore', stageUpdatedAt: 0,
      core: { title: '', claim: '', innovation: '', venue: '', revision: 1, confirmed: false, confirmation: null, updatedAt: 0 },
      results: [], narrative: '', resultSeq: 0,
      submission: {}, updatedAt: 0,
    })
  }
  const paper = snapshot.paper || {}
  const view = normalizeShape({
    schemaVersion: paper.schemaVersion || 2,
    stage: paper.stage || 'explore',
    stageNote: paper.stageNote || '',
    stageUpdatedAt: paper.stageUpdatedAt || 0,
    core: paper.core ? { ...paper.core } : null,
    results: (paper.results || []).map((r) => ({ ...r })),
    narrative: paper.narrative || '',
    question: paper.question || '',
    scope: paper.scope || '',
    sourceSummary: paper.sourceSummary || '',
    questionUpdatedAt: paper.questionUpdatedAt || 0,
    resultSeq: paper.resultSeq || 0,
    submission: paper.submission || {},
    updatedAt: (snapshot.metadata && snapshot.metadata.updatedAt) || 0,
    projectId: snapshot.projectId,
    revision: snapshot.revision,
  })
  return view
}

function normalizeShape(view) {
  // 兼容旧读模型对字段存在的假设
  if (!view.core) {
    view.core = { title: '', claim: '', innovation: '', venue: '', revision: 1, confirmed: false, confirmation: null, updatedAt: 0 }
  }
  for (const r of view.results || []) {
    if (!Array.isArray(r.claims)) r.claims = []
    if (!Array.isArray(r.evidence)) r.evidence = []
    if (!Array.isArray(r.tasks)) r.tasks = []
    if (!Array.isArray(r.figures)) r.figures = []
    if (!Array.isArray(r.references)) r.references = []
    if (!r.presentation) r.presentation = { mode: 'undecided', rationale: '' }
    if (!r.manuscriptRole) r.manuscriptRole = 'main'
    if (!r.direction) r.direction = 'not_assessed'
    if (!r.evidenceState) r.evidenceState = 'planned'
    if (!r.status) r.status = 'planned'
    if (!r.revision) r.revision = 1
    r.confirmed = r.confirmed === true
  }
  if (!view.submission || typeof view.submission !== 'object') view.submission = {}
  view.results = Array.isArray(view.results) ? view.results : []
  return view
}

// ---- 旧数据导入（project.import-legacy）--------------------------------------------
// 幂等：同 migrationId 返回原结果。整批操作在一个事务里（executePaperCommands 的批量语义），
// 失败整体回滚；导入是"提案/非确认"语义——旧数据里的 confirmed=true 保留为 legacy-migration
// 凭据（与旧 paperspine normalizeConfirmation 同语义），不自动提升证据状态。
// 旧 blueprint.json 只读导入：完整字段（core/results 主干 + 状态/证据/文献/任务/图件引用），
// 单事务全成全败；migrationId（源 hash）幂等；原文件永不删除（它本身就是备份）。
// dryRun=true 时只返回预览（将导入什么/跳过什么），不落任何写入。
export function importLegacyBlueprint(ctx, exec, { store, legacy, sourceFile, sourceHash, dryRun = false }) {
  const migrationId = `legacy-blueprint-${sourceHash || hashSource(legacy)}`
  const sid = sessionIdOf(exec)
  if (!sid) return { ok: false, error: '无法确定调用者会话' }
  // 预览绝不建项目（T5.1：预览只读）
  if (dryRun) {
    const scope = readScope(ctx, exec, { store })
    if (!scope.ok) return { ok: false, error: scope.message || scope.code }
    const core = legacy && typeof legacy.core === 'object' ? legacy.core : {}
    const legacyResults = (Array.isArray(legacy.results) ? legacy.results : []).filter((r) => r && typeof r.id === 'string')
    const confirmedCount = legacyResults.filter((r) => r && r.confirmed === true).length
    return {
      ok: true,
      preview: true,
      migrationId,
      projectId: scope.ref.projectId,
      operations: (core.claim || core.title ? 1 : 0) + legacyResults.length,
      results: legacyResults.map((r) => ({ id: r.id, title: r.title || r.id, confirmed: r.confirmed === true })),
      confirmedResults: confirmedCount,
      note: `预览：将导入核心${core.claim ? '（有）' : '（无）'} + ${legacyResults.length} 个 Result（其中 ${confirmedCount} 个保留 legacy-migration 确认凭据）。${scope.ref.projectId ? '目标：当前项目。' : '目标：将新建项目（首次持久写时创建）。'}原文件保留为只读备份，不会删除或修改。`,
    }
  }
  const ensured = ensureProject(ctx, sid, { store })
  if (!ensured.ok) return { ok: false, error: ensured.message || ensured.code }
  const projectId = ensured.ref.projectId
  const effectiveSourceHash = sourceHash || hashSource(legacy)
  const ledger = {
    migrationId,
    projectId,
    source: sourceFile || 'blueprint.json',
    sourceHash: effectiveSourceHash,
    backupPath: sourceFile || '',
  }
  const existing = store.st.getLegacyImport.get(migrationId)
  if (existing && existing.project_id === projectId) {
    // T3：重复 migrationId 返回原回执（不覆盖台账、不推进 revision）。
    const receiptRow = store.st.getReceipt.get(projectId, migrationId)
    const receipt = receiptRow ? JSON.parse(receiptRow.receipt) : null
    return {
      ok: true,
      duplicate: true,
      migrationId,
      projectId,
      revision: receipt ? receipt.revision : undefined,
      receipt,
      note: '该来源已导入过当前项目（幂等返回原回执）。',
    }
  }
  if (existing) {
    return { ok: false, error: `该旧数据已导入过其他项目（${existing.project_id}）；请显式选择目标或换用新项目` }
  }
  const core = legacy && typeof legacy.core === 'object' ? legacy.core : {}
  const operations = []
  if (String(core.claim || '').trim() || String(core.title || '').trim()) {
    operations.push({ command: 'paper.propose-core', payload: { title: core.title, claim: core.claim, innovation: core.innovation, venue: core.venue } })
  }
  const legacyResults = (Array.isArray(legacy.results) ? legacy.results : []).filter((r) => r && typeof r.id === 'string')
  for (const r of legacyResults) {
    operations.push({ command: 'paper.import-legacy-result', payload: { legacy: r } })
  }
  const confirmedCount = legacyResults.filter((r) => r && r.confirmed === true).length
  if (operations.length === 0) {
    return { ok: true, imported: 0, migrationId, projectId, note: '旧数据没有可导入的 core/results。' }
  }
  let result
  try {
    // T3：legacy_imports 台账与项目命令/审计/回执在同一事务提交（commit 后不再补写台账）。
    result = executePaperCommands(store, ensured.ref, {
      mutationId: migrationId,
      source: 'legacy-import',
      actor: { sessionId: sid, source: sourceFile || 'legacy-blueprint.json' },
      operations,
      legacyImport: ledger,
    })
  } catch (err) {
    // after-commit 通知失败：业务事实与台账已提交，重试会命中幂等回执 → 不会重复导入；
    // 提交前故障（before-command/after-snapshot/at-ledger）整批回滚，同样可安全重试。
    const committed = Boolean(err && err.committed)
    return {
      ok: false,
      error: committed
        ? `导入在提交后通知阶段失败（业务事实与台账已提交，可安全重试）：${(err && err.message) || err}`
        : `导入事务失败（已回滚，可安全重试）：${(err && err.message) || err}`,
      committed,
      migrationId,
      projectId,
      retrySafe: true,
      revision: (() => { try { return store.snapshotOf(projectId).revision } catch { return undefined } })(),
    }
  }
  if (result.kind === 'applied') {
    log(`legacy blueprint imported: ${operations.length} ops → ${projectId} (${migrationId})`)
    return { ok: true, imported: operations.length, migrationId, projectId, revision: result.receipt.revision, confirmedResults: confirmedCount, receipt: result.receipt }
  }
  if (result.kind === 'already-applied') {
    return {
      ok: true,
      duplicate: true,
      migrationId,
      projectId,
      revision: result.receipt ? result.receipt.revision : undefined,
      receipt: result.receipt || null,
      reconciled: result.reconciled === true,
      ledgerOnly: result.ledgerOnly === true,
      note: result.reconciled
        ? '该来源已导入过当前项目；本次补齐了缺失的导入台账（未重复导入数据）。'
        : result.ledgerOnly
          ? '导入台账已存在（回执缺失的异常恢复）：按已导入处理，未重复导入数据。'
          : '该来源已导入过当前项目（幂等返回原回执）。',
    }
  }
  if (result.code === 'legacy-import-conflict') {
    return { ok: false, error: '该旧数据已导入过其他项目；请显式选择目标或换用新项目' }
  }
  return { ok: false, error: result.reason || '导入失败' }
}

function hashSource(value) {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16)
}

export { COMMANDS, contentHashOf, objectRevisionOf }
