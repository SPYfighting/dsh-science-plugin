// dsh-science — 项目领域层（Project Domain，阶段 1）
//
// 设计真源 §8：ProjectCommand 是唯一业务写 seam 的领域动作词汇；execute() 之外没有
// 任何直接写库路径。本模块职责：
//   1. snapshot 的领域形状（ProjectSnapshot，沿用 Paper Spine v2 词汇）；
//   2. 单操作 applyOperation(snapshot, op, now) —— 纯函数，领域约束都在这里拒绝；
//   3. executeBatch(store, ref, batch) —— 一个 mutationId + expectedRevision + 多个
//      operation，单事务全成全败，只推进一次 project revision，语义变化的对象各自
//      推进 object revision 并使旧确认失效；
//   4. 派单硬闸门（paper.dispatch-gate）：核心与全部目标 Result 当前 revision 已确认，
//      在创建任务序号/外部副作用之前调用。

import { createHash } from 'node:crypto'
import { StoreError, emptyPaperState, emptySnapshot } from './project-store.js'
import { PAPER_STAGES, EVIDENCE_DIRECTIONS, EVIDENCE_STATES, MANUSCRIPT_ROLES, PRESENTATION_MODES, SUBMISSION_ITEMS } from './paperspine.js'
import { rememberRevision } from './skeleton-context.js'
import { linkArtifact, registerArtifact, relinkArtifact, indexItemOf, cleanIndexList } from './artifact-index.js'

export { emptyPaperState, emptySnapshot }

export const RESULT_STATUSES = ['planned', 'in_progress', 'supported', 'negative', 'dropped']
export const CLAIM_STATUSES = ['active', 'retired']

export const COMMANDS = Object.freeze([
  'paper.propose-core',
  'paper.propose-result',
  'paper.update-result',
  'paper.record-evidence',
  'paper.record-claim',
  'paper.retire-claim',
  'paper.set-focus',
  'paper.record-next-decision',
  'paper.confirm-revision',
  'paper.set-question',
  'paper.set-stage',
  'paper.set-submission-check',
  'paper.link-task',
  'paper.unlink-task',
  'paper.link-artifact',
  'paper.unlink-artifact',
  'paper.link-reference',
  'paper.verify-reference',
  'paper.remove-reference',
  'paper.set-screening',
  'paper.set-narrative',
  'paper.import-legacy-result',
  'paper.archive-object',
  'paper.record-proposal',
  'paper.register-artifact',
  'paper.relink-artifact',
  'paper.dispatch-gate',
  'project.set-metadata',
  'project.attach-session',
])

function log(msg) {
  console.log(`[dsh-science project-domain] ${msg}`)
}

export function hashOf(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

const str = (v, max = 4000) => String(v == null ? '' : v).slice(0, max)
const numOr = (v, f) => (Number.isFinite(Number(v)) ? Number(v) : f)

// ---- 对象工具 ------------------------------------------------------------------
export function objectRevisionOf(obj) { return Math.max(1, numOr(obj && obj.revision, 1)) }

export function contentHashOf(obj) {
  const { revision: _r, confirmed: _c, confirmation: _conf, contentHash: _h, updatedAt: _u, history: _hist, ...content } = obj || {}
  return hashOf(content)
}

export function findObject(snapshot, objectId) {
  const paper = snapshot.paper
  if (objectId === 'core') return paper.core
  return (paper.results || []).find((r) => r && r.id === objectId) || null
}

// 语义修改：新 object revision + 确认失效。非语义字段（状态/证据状态等执行事实）不失效。
// T6 确认摘要字段（用户确认时看到的内容）：
//   core  = title / claim / innovation / venue
//   result= title / claim / purpose / manuscriptRole
// 纳入/排除决定 = result.manuscriptRole（excluded）与 result.status 跨越 dropped；
// 派单目标 = dispatch-gate 的显式 resultIds + 上述纳入/排除字段。以上字段变化必须推进
// 对象 revision（进而 hash）并使旧确认不可用；证据状态/方向/呈现决策/notes 等执行事实不失效。
const SEMANTIC_CORE_FIELDS = ['title', 'claim', 'innovation', 'venue']
const SEMANTIC_RESULT_FIELDS = ['title', 'claim', 'purpose', 'manuscriptRole']

// touchObject：字段值实际变化才生效；semanticFields 中有字段真的变化时才推进对象
// revision 并使确认失效（对齐旧工具语义：提供了字段但值未变 ≠ 语义修改）。
function touchObject(obj, fields, { semanticFields = [], now }) {
  let changed = false
  let semanticChanged = false
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (JSON.stringify(obj[key]) !== JSON.stringify(value) && semanticFields.includes(key)) semanticChanged = true
  }
  if (semanticChanged) rememberRevision(obj, 'revise', now)
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (JSON.stringify(obj[key]) !== JSON.stringify(value)) {
      obj[key] = value
      changed = true
    }
  }
  if (changed && semanticChanged) {
    obj.revision = objectRevisionOf(obj) + 1
    obj.confirmed = false
    obj.confirmation = null
  }
  if (changed) obj.updatedAt = now
  return changed
}

function findResult(snapshot, resultId) {
  const r = (snapshot.paper.results || []).find((x) => x && x.id === String(resultId))
  if (!r) {
    throw new StoreError('object-not-found', `Result ${resultId} 不存在（现有：${(snapshot.paper.results || []).map((x) => x.id).join('、') || '空'}）`)
  }
  return r
}

// ---- 确认（对象级 CAS）----------------------------------------------------------
export function applyConfirm(snapshot, payload, now) {
  const objectId = str(payload.objectId, 100)
  const obj = findObject(snapshot, objectId)
  if (!obj) throw new StoreError('object-not-found', `对象 ${objectId} 不存在`)
  const objectRevision = objectRevisionOf(obj)
  const currentHash = contentHashOf(obj)
  // M9：确认必须绑定对象 revision（防盲确认）；T4：同时必须绑定对象内容哈希。
  if (payload.expectedObjectRevision == null) {
    throw new StoreError('invalid-command', `确认 ${objectId} 必须携带 expectedObjectRevision（确认绑定当前对象修订）`)
  }
  if (payload.expectedHash == null || String(payload.expectedHash).trim() === '') {
    throw new StoreError('invalid-command', `确认 ${objectId} 必须携带 expectedHash（确认绑定当前对象内容哈希）`)
  }
  if (numOr(payload.expectedObjectRevision, -1) !== objectRevision) {
    throw new StoreError('object-conflict', `对象 ${objectId} revision 过期（当前 ${objectRevision}，请求基于 ${numOr(payload.expectedObjectRevision, -1)}）`, { objectRevision, currentHash })
  }
  if (String(payload.expectedHash) !== currentHash) {
    throw new StoreError('object-conflict', `对象 ${objectId} 内容已变化（hash 不一致）`, { objectRevision, currentHash })
  }
  const receipt = {
    revisionId: `${objectId}-r${objectRevision}`,
    // H1：确认显式记录 objectRevision；闸门以 revision 比对（语义修改才推进 revision，
    // 执行性更新如记录证据/链任务/改状态不推进——不会把已确认对象锁死在闸门外）。
    objectRevision,
    contentHash: currentHash,
    confirmedBy: 'user',
    confirmedAt: now,
    source: str(payload.source, 40) || 'conversation',
  }
  obj.confirmed = true
  obj.confirmation = receipt
  snapshot.decisions.confirmedReceipts.push({
    objectId, objectRevision, contentHash: currentHash, confirmedAt: now, source: receipt.source,
  })
  return { objectId, objectRevision, contentHash: currentHash }
}

// ---- 派单硬闸门 ------------------------------------------------------------------
// 设计 §8.6：显式 resultIds；核心与全部目标 Result 当前 revision 已确认。
// H1：比对 confirmation.objectRevision（而非全量 contentHash）——执行性更新不使确认失效。
export function assertDispatchGate(snapshot, resultIds) {
  const ids = [...new Set((Array.isArray(resultIds) ? resultIds : []).map((x) => String(x || '').trim()).filter(Boolean))]
  if (ids.length === 0) {
    throw new StoreError('dispatch-gate', '派单必须显式携带至少一个 resultId；不得从 active Result 或当前页面推断', { missing: true })
  }
  const core = snapshot.paper.core
  if (!core || !core.claim) {
    throw new StoreError('dispatch-gate', '文章核心尚未建立——先确立核心主张再派单', { core: false })
  }
  const coreRev = objectRevisionOf(core)
  if (!core.confirmed || !core.confirmation || Number(core.confirmation.objectRevision || -1) !== coreRev) {
    throw new StoreError('dispatch-gate', `核心当前修订尚未确认（r${coreRev}）——未确认的主张不能派发执行任务`, { objectId: 'core', objectRevision: coreRev })
  }
  const blocked = []
  for (const id of ids) {
    const r = findResult(snapshot, id)
    if (r.manuscriptRole === 'excluded' || r.status === 'dropped') {
      blocked.push({ resultId: id, reason: `Result ${id} 已排除出正文` })
      continue
    }
    const rev = objectRevisionOf(r)
    if (!r.confirmed || !r.confirmation || Number(r.confirmation.objectRevision || -1) !== rev) {
      blocked.push({ resultId: id, reason: `Result ${id} 当前修订（r${rev}）尚未确认` })
    }
  }
  if (blocked.length > 0) {
    throw new StoreError('dispatch-gate', `派单闸门未通过：${blocked.map((b) => b.reason).join('；')}`, { blocked })
  }
  return { resultIds: ids, confirmedAtRevision: snapshot.revision }
}

// ---- 单操作 -----------------------------------------------------------------------
// 返回 { changedKeys, objects }；拒绝 = StoreError。快照就地修改。
export function applyOperation(snapshot, op, now) {
  const command = String(op.command || '')
  const p = op.payload || {}
  switch (command) {
    case 'paper.propose-core': {
      if (!snapshot.paper.core) {
        snapshot.paper.core = { title: '', claim: '', innovation: '', venue: '', revision: 1, confirmed: false, confirmation: null, updatedAt: now }
      }
      const core = snapshot.paper.core
      const fields = {}
      if (p.title !== undefined) fields.title = str(p.title, 300)
      if (p.claim !== undefined) fields.claim = str(p.claim, 1000)
      if (p.innovation !== undefined) fields.innovation = str(p.innovation, 1000)
      if (p.venue !== undefined) fields.venue = str(p.venue, 200)
      const changed = touchObject(core, fields, { semanticFields: SEMANTIC_CORE_FIELDS, now })
      if (!changed) return { changedKeys: [], objects: [] }
      return { changedKeys: ['paper.core'], objects: [{ objectId: 'core', objectRevision: objectRevisionOf(core) }] }
    }
    case 'paper.propose-result': {
      const claim = str(p.claim, 1000).trim()
      if (!claim) throw new StoreError('invalid-command', 'paper.propose-result 需要 claim（可检验的子主张）')
      // T6：移除 7 个 Result 硬上限；超过 5 个只在工具读模型给软提醒，不阻断科研自由。
      const role = p.manuscriptRole === undefined ? 'main' : String(p.manuscriptRole)
      if (!MANUSCRIPT_ROLES.includes(role)) throw new StoreError('invalid-command', `manuscriptRole 必须是：${MANUSCRIPT_ROLES.join(' | ')}`)
      snapshot.paper.resultSeq = numOr(snapshot.paper.resultSeq, 0) + 1
      const id = `res-${snapshot.paper.resultSeq}`
      const result = {
        id,
        title: str(p.title, 200) || id,
        claim,
        purpose: str(p.purpose, 1000),
        status: 'planned',
        direction: 'not_assessed',
        evidenceState: 'planned',
        manuscriptRole: role,
        presentation: { mode: 'undecided', rationale: '' },
        claims: [{ id: `${id}-claim-1`, text: claim, revision: 1, status: 'active', createdAt: now, updatedAt: now }],
        claimSeq: 1,
        evidence: [],
        evidenceSeq: 0,
        tasks: [],
        figures: [],
        references: [],
        notes: '',
        revision: 1,
        confirmed: false,
        confirmation: null,
        createdAt: now,
        updatedAt: now,
      }
      snapshot.paper.results.push(result)
      return { changedKeys: ['paper.results'], objects: [{ objectId: id, objectRevision: 1, created: true }] }
    }
    case 'paper.update-result': {
      const r = findResult(snapshot, p.resultId)
      const fields = {}
      if (p.title !== undefined) fields.title = str(p.title, 200)
      if (p.claim !== undefined) fields.claim = str(p.claim, 1000)
      if (p.purpose !== undefined) fields.purpose = str(p.purpose, 1000)
      if (p.manuscriptRole !== undefined) {
        if (!MANUSCRIPT_ROLES.includes(String(p.manuscriptRole))) throw new StoreError('invalid-command', `manuscriptRole 必须是：${MANUSCRIPT_ROLES.join(' | ')}`)
        fields.manuscriptRole = String(p.manuscriptRole)
      }
      if (p.status !== undefined) {
        if (!RESULT_STATUSES.includes(String(p.status))) throw new StoreError('invalid-command', `status 必须是：${RESULT_STATUSES.join(' | ')}`)
        fields.status = String(p.status)
      }
      if (p.direction !== undefined) {
        if (!EVIDENCE_DIRECTIONS.includes(String(p.direction))) throw new StoreError('invalid-command', `direction 必须是：${EVIDENCE_DIRECTIONS.join(' | ')}`)
        fields.direction = String(p.direction)
      }
      if (p.evidenceState !== undefined) {
        if (!EVIDENCE_STATES.includes(String(p.evidenceState))) throw new StoreError('invalid-command', `evidenceState 必须是：${EVIDENCE_STATES.join(' | ')}`)
        fields.evidenceState = String(p.evidenceState)
      }
      if (p.notes !== undefined) fields.notes = str(p.notes, 4000)
      // M2（语义审查）：阴性结果的重新评估说明是领域约束（不只工具提示）——
      // 按「合并后状态」校验：已是 negative 的结果，后续任何更新都不能清空 notes，
      // 否则一次普通的 notes:'' 更新即可绕过该约束。
      if (String(fields.status ?? r.status) === 'negative') {
        const effectiveNotes = fields.notes !== undefined ? fields.notes : r.notes
        if (!String(effectiveNotes || '').trim()) {
          throw new StoreError('invalid-command', 'status=negative 需要 notes 重新评估说明：该负面结果对核心主张意味着什么——调整本 result 的表述/方法重跑，还是动摇核心（证伪讨论）？')
        }
      }
      if (p.presentationMode !== undefined) {
        if (!PRESENTATION_MODES.includes(String(p.presentationMode))) throw new StoreError('invalid-command', `presentationMode 必须是：${PRESENTATION_MODES.join(' | ')}`)
        fields.presentation = { ...(r.presentation || {}), mode: String(p.presentationMode), rationale: str(p.presentationRationale, 1000) || (r.presentation && r.presentation.rationale) || '' }
      } else if (p.presentationRationale !== undefined) {
        fields.presentation = { ...(r.presentation || {}), mode: (r.presentation && r.presentation.mode) || 'undecided', rationale: str(p.presentationRationale, 1000) }
      }
      // T6：能改变确认摘要/纳入排除/派单目标的字段必须推进 revision + 使旧确认失效。
      // status 只有跨越 dropped 边界（纳入 ↔ 排除）才视为语义；进行中/已支持等执行事实仍不失效确认。
      const semanticFields = [...SEMANTIC_RESULT_FIELDS]
      if (fields.status !== undefined && ((r.status === 'dropped') !== (fields.status === 'dropped'))) {
        semanticFields.push('status')
      }
      const previousClaim = r.claim
      const changed = touchObject(r, fields, { semanticFields, now })
      if (!changed) return { changedKeys: [], objects: [] }
      // M1（语义审查）：主 claim 文本变化时同步首个 active claim（该 claim 自身 revision 推进，
      // 保留历史；证据绑定与审查核对清单继续使用稳定 claim id）。
      // 阻断修复：只有「claim 文本真的变了」且「该 active claim 仍是原主主张的镜像」才同步——
      // 主 claim 退休后首个 active claim 可能是用户手写子主张，不能被陈旧主主张文本覆盖；
      // 覆盖前把旧文本压入 claim.history，保证可追溯。
      if (fields.claim !== undefined && fields.claim !== previousClaim && Array.isArray(r.claims)) {
        const primary = r.claims.find((c) => c && c.status !== 'retired')
        if (primary && primary.text === previousClaim && primary.text !== r.claim) {
          if (!Array.isArray(primary.history)) primary.history = []
          primary.history.push({ text: primary.text, revision: numOr(primary.revision, 1), at: now })
          primary.text = r.claim
          primary.revision = numOr(primary.revision, 1) + 1
          primary.updatedAt = now
        }
      }
      return { changedKeys: ['paper.results'], objects: [{ objectId: r.id, objectRevision: objectRevisionOf(r) }] }
    }
    case 'paper.record-claim': {
      const r = findResult(snapshot, p.resultId)
      const text = str(p.text, 1000).trim()
      if (!text) throw new StoreError('invalid-command', 'paper.record-claim 需要 text')
      r.claimSeq = numOr(r.claimSeq, r.claims.length) + 1
      const id = `${r.id}-claim-${r.claimSeq}`
      r.claims.push({ id, text, revision: 1, status: 'active', createdAt: now, updatedAt: now })
      r.revision = objectRevisionOf(r) + 1
      r.confirmed = false
      r.confirmation = null
      r.updatedAt = now
      return { changedKeys: ['paper.results'], objects: [{ objectId: r.id, objectRevision: objectRevisionOf(r) }] }
    }
    case 'paper.retire-claim': {
      // M6（语义审查）：主张退休——保留 id 与证据引用，status=retired；语义修改推进
      // Result revision 并使确认失效；退休后审查清单/语义哈希不再把它当 active 核对。
      const r = findResult(snapshot, p.resultId)
      const claimId = str(p.claimId, 120)
      const claim = r.claims.find((c) => c && c.id === claimId)
      if (!claim) throw new StoreError('object-not-found', `Claim ${claimId} 不存在（现有：${r.claims.map((c) => c.id).join('、') || '空'}）`)
      if (claim.status !== 'retired') {
        claim.status = 'retired'
        claim.retiredReason = str(p.reason, 1000)
        claim.updatedAt = now
        r.revision = objectRevisionOf(r) + 1
        r.confirmed = false
        r.confirmation = null
        r.updatedAt = now
      }
      return { changedKeys: ['paper.results'], objects: [{ objectId: r.id, objectRevision: objectRevisionOf(r) }] }
    }
    case 'paper.record-evidence': {
      const r = findResult(snapshot, p.resultId)
      const direction = String(p.direction || '')
      const state = String(p.state || '')
      if (!EVIDENCE_DIRECTIONS.includes(direction)) throw new StoreError('invalid-command', `direction 必须是：${EVIDENCE_DIRECTIONS.join(' | ')}`)
      if (!EVIDENCE_STATES.includes(state)) throw new StoreError('invalid-command', `state 必须是：${EVIDENCE_STATES.join(' | ')}`)
      const claimIds = [...new Set((Array.isArray(p.claimIds) ? p.claimIds : []).map((x) => String(x)).filter(Boolean))]
      if (claimIds.length === 0) throw new StoreError('invalid-command', 'claimIds 至少包含一个 Claim id')
      const known = new Set(r.claims.map((c) => c.id))
      const unknown = claimIds.filter((id) => !known.has(id))
      if (unknown.length > 0) throw new StoreError('invalid-command', `未知 Claim：${unknown.join('、')}`)
      const sourceLocator = str(p.sourceLocator, 2000).trim()
      const allowedInterpretation = str(p.allowedInterpretation, 2000).trim()
      if (state === 'verified' && (!sourceLocator || !allowedInterpretation)) {
        throw new StoreError('invalid-command', 'state=verified 必须同时提供 sourceLocator 与 allowedInterpretation')
      }
      r.evidenceSeq = numOr(r.evidenceSeq, 0) + 1
      r.evidence.push({
        id: `${r.id}-ev-${r.evidenceSeq}`,
        claimIds,
        claimRevisions: Object.fromEntries(claimIds.map((id) => [id, objectRevisionOf(r.claims.find((claim) => claim.id === id))])),
        direction,
        state,
        sourceLocator,
        conditions: str(p.conditions, 2000),
        uncertainty: str(p.uncertainty, 2000),
        allowedInterpretation,
        prohibitedInterpretation: str(p.prohibitedInterpretation, 2000),
        note: str(p.note, 2000),
        createdAt: now,
        updatedAt: now,
      })
      r.updatedAt = now
      return { changedKeys: ['paper.results'], objects: [{ objectId: r.id, objectRevision: objectRevisionOf(r) }] }
    }
    case 'paper.set-focus': {
      if (p.activeResultId !== undefined && p.activeResultId !== null) findResult(snapshot, p.activeResultId)
      snapshot.focus.activeResultId = p.activeResultId === undefined ? snapshot.focus.activeResultId : (p.activeResultId === null ? null : String(p.activeResultId))
      if (p.blockers !== undefined) {
        snapshot.focus.blockers = (Array.isArray(p.blockers) ? p.blockers : []).map((b) => ({
          summary: str(b && b.summary, 500),
          detail: str(b && b.detail, 2000),
          at: now,
        }))
      }
      return { changedKeys: ['focus'], objects: [] }
    }
    case 'paper.record-next-decision': {
      const text = str(p.text, 1000).trim()
      if (!text) throw new StoreError('invalid-command', 'paper.record-next-decision 需要 text')
      const entry = {
        text,
        objectId: p.objectId ? str(p.objectId, 100) : null,
        status: 'pending',
        proposedBy: str(p.proposedBy, 100) || 'assistant',
        createdAt: now,
      }
      snapshot.focus.nextDecisions.push(entry)
      if (snapshot.focus.nextDecisions.length > 20) snapshot.focus.nextDecisions.splice(0, snapshot.focus.nextDecisions.length - 20)
      return { changedKeys: ['focus'], objects: [] }
    }
    case 'paper.confirm-revision': {
      const info = applyConfirm(snapshot, p, now)
      return { changedKeys: p.objectId === 'core' ? ['paper.core'] : ['paper.results'], objects: [info] }
    }
    case 'paper.set-question': {
      // T6：研究问题/范围/来源摘要的显式写入命令。属于项目上下文，不是论文对象语义——
      // 推进 project revision + 审计 + 卡片投影，但不自动确认/失效核心与 Result 的确认。
      const fields = {}
      if (p.question !== undefined) fields.question = str(p.question, 1000).trim()
      if (p.scope !== undefined) fields.scope = str(p.scope, 2000).trim()
      if (p.sourceSummary !== undefined) fields.sourceSummary = str(p.sourceSummary, 4000).trim()
      if (Object.keys(fields).length === 0) {
        throw new StoreError('invalid-command', 'paper.set-question 至少需要 question | scope | sourceSummary 之一')
      }
      let changed = false
      for (const [key, value] of Object.entries(fields)) {
        if (String(snapshot.paper[key] || '') !== value) {
          snapshot.paper[key] = value
          changed = true
        }
      }
      if (!changed) return { changedKeys: [], objects: [] }
      snapshot.paper.questionUpdatedAt = now
      return { changedKeys: ['paper.question'], objects: [] }
    }
    case 'paper.set-stage': {
      // T6：阶段是描述性上下文，不是执行闸门；只校验枚举并记录说明。
      // 正式派单只由 paper.dispatch-gate 把关（显式 resultIds + 核心/目标 Result 当前修订已确认）。
      const stage = String(p.stage || '')
      if (!PAPER_STAGES.includes(stage)) throw new StoreError('invalid-command', `stage 必须是：${PAPER_STAGES.join(' | ')}`)
      snapshot.paper.stage = stage
      snapshot.paper.stageNote = str(p.note, 1000)
      snapshot.paper.stageUpdatedAt = now
      return { changedKeys: ['paper'], objects: [] }
    }
    case 'paper.set-submission-check': {
      const item = String(p.item || '')
      if (!SUBMISSION_ITEMS.includes(item)) throw new StoreError('invalid-command', `item 必须是：${SUBMISSION_ITEMS.join(' | ')}`)
      const status = String(p.status || '')
      if (!['pending', 'complete', 'not_applicable'].includes(status)) throw new StoreError('invalid-command', 'status 必须是 pending | complete | not_applicable')
      snapshot.paper.submission[item] = { status, note: str(p.note, 2000), updatedAt: now }
      return { changedKeys: ['paper'], objects: [] }
    }
    case 'paper.link-task': {
      const r = findResult(snapshot, p.resultId)
      const taskId = str(p.taskId, 100)
      if (!taskId) throw new StoreError('invalid-command', 'paper.link-task 需要 taskId')
      if (!r.tasks.includes(taskId)) r.tasks.push(taskId)
      const ref = { taskId, resultIds: [r.id], boundAt: now }
      const existing = snapshot.links.taskRefs.find((x) => x.taskId === taskId)
      if (existing) {
        if (!existing.resultIds.includes(r.id)) existing.resultIds.push(r.id)
      } else {
        snapshot.links.taskRefs.push(ref)
      }
      return { changedKeys: ['links', 'paper.results'], objects: [] }
    }
    case 'paper.unlink-task': {
      // 任务删除/改挂时解绑（幂等）：从 result.tasks 与 taskRefs 摘除
      const taskId = str(p.taskId, 100)
      if (!taskId) throw new StoreError('invalid-command', 'paper.unlink-task 需要 taskId')
      let touched = false
      for (const r of snapshot.paper.results || []) {
        if (Array.isArray(r.tasks) && r.tasks.includes(taskId)) {
          r.tasks = r.tasks.filter((x) => x !== taskId)
          r.updatedAt = now
          touched = true
        }
      }
      const before = snapshot.links.taskRefs.length
      snapshot.links.taskRefs = snapshot.links.taskRefs.filter((x) => x.taskId !== taskId)
      if (snapshot.links.taskRefs.length !== before) touched = true
      return touched ? { changedKeys: ['links', 'paper.results'], objects: [] } : { changedKeys: [], objects: [] }
    }
    case 'paper.unlink-artifact': {
      const artifactId = str(p.artifactId, 100)
      if (!artifactId) throw new StoreError('invalid-command', 'paper.unlink-artifact 需要 artifactId')
      let touched = false
      for (const r of snapshot.paper.results || []) {
        if (Array.isArray(r.figures) && r.figures.includes(artifactId)) {
          r.figures = r.figures.filter((x) => x !== artifactId)
          r.updatedAt = now
          touched = true
        }
      }
      snapshot.links.artifactRefs = snapshot.links.artifactRefs.filter((x) => x.artifactId !== artifactId)
      // 成果索引同步：解除关联后 artifactIndex 的 resultIds 也要摘掉（以 paper.figures 为准），
      // 否则 state-view 的 materials 仍显示旧归属。
      let indexTouched = false
      const indexRecord = indexItemOf(snapshot, artifactId)
      if (indexRecord && Array.isArray(indexRecord.resultIds)) {
        const stillLinked = new Set()
        for (const r of snapshot.paper.results || []) {
          if (Array.isArray(r.figures) && r.figures.includes(artifactId)) stillLinked.add(r.id)
        }
        const kept = indexRecord.resultIds.filter((resultId) => stillLinked.has(resultId))
        if (kept.length !== indexRecord.resultIds.length) {
          indexRecord.resultIds = kept
          indexRecord.updatedAt = now
          indexTouched = true
        }
      }
      const changedKeys = []
      if (touched) changedKeys.push('links', 'paper.results')
      if (indexTouched) changedKeys.push('artifactIndex')
      return { changedKeys, objects: [] }
      return touched ? { changedKeys: ['links', 'paper.results', 'artifactIndex'], objects: [] } : { changedKeys: [], objects: [] }
    }
    case 'paper.link-artifact': {
      const artifactId = str(p.artifactId, 100)
      if (!artifactId) throw new StoreError('invalid-command', 'paper.link-artifact 需要 artifactId')
      const resultIds = Array.isArray(p.resultIds)
        ? p.resultIds.map((x) => String(x))
        : (p.resultId !== undefined ? [str(p.resultId, 100)] : [])
      if (!resultIds.length || resultIds.some((x) => !x)) throw new StoreError('invalid-command', 'paper.link-artifact 需要 resultId 或 resultIds')
      let touched = false
      for (const resultId of resultIds) {
        const r = findResult(snapshot, resultId)
        if (!Array.isArray(r.figures)) r.figures = []
        if (!r.figures.includes(artifactId)) { r.figures.push(artifactId); r.updatedAt = now; touched = true }
        if (!snapshot.links.artifactRefs.some((x) => x.artifactId === artifactId && x.resultIds.includes(r.id))) {
          snapshot.links.artifactRefs.push({ artifactId, resultIds: [r.id], boundAt: now })
          touched = true
        }
      }
      // 成果索引同步：已登记 artifact 的 resultIds/claimIds 一并追加，
      // 使 materials 与成果归属在两条读模型下一致（原先该分支不可达，索引永不同步）。
      let indexTouched = false
      const indexRecord = indexItemOf(snapshot, artifactId)
      if (indexRecord) {
        const before = JSON.stringify([indexRecord.resultIds, indexRecord.claimIds])
        indexRecord.resultIds = cleanIndexList([...(indexRecord.resultIds || []), ...resultIds])
        if (Array.isArray(p.claimIds)) indexRecord.claimIds = cleanIndexList([...(indexRecord.claimIds || []), ...p.claimIds.map((x) => String(x))])
        if (JSON.stringify([indexRecord.resultIds, indexRecord.claimIds]) !== before) { indexRecord.updatedAt = now; indexTouched = true }
      }
      const changedKeys = []
      if (touched) changedKeys.push('links', 'paper.results')
      if (indexTouched) changedKeys.push('artifactIndex')
      return { changedKeys, objects: [] }
    }
    case 'paper.link-reference': {
      const r = findResult(snapshot, p.resultId)
      const usedAs = String(p.usedAs || '')
      if (!['method', 'concept', 'background', 'evidence'].includes(usedAs)) {
        throw new StoreError('invalid-command', 'usedAs 必须是 method | concept | background | evidence')
      }
      const doi = p.doi ? str(p.doi, 200).toLowerCase() : ''
      const title = str(p.title, 300).trim()
      if (!doi && !title) throw new StoreError('invalid-command', 'doi 与 title 至少提供一个')
      const dup = r.references.find((x) => x.usedAs === usedAs && ((doi && x.doi === doi) || (!doi && title && x.title === title)))
      if (!dup) {
        r.references.push({ doi, title, usedAs, claimIds: [...new Set((Array.isArray(p.claimIds) ? p.claimIds : []).map(String))], relation: str(p.relation, 40) || (usedAs === 'method' ? 'method' : 'context'), sourceLocator: str(p.sourceLocator, 1000), providedTitle: str(p.providedTitle, 300), verified: p.verified === true, verifyError: str(p.verifyError, 300), checkedAt: p.verified === true ? now : 0, addedAt: now })
      } else {
        // 低-5：幂等合并；无实际变化时不产生 changedKeys（不推进项目 revision）
        const merged = [...new Set([...(dup.claimIds || []), ...((Array.isArray(p.claimIds) ? p.claimIds : []).map(String))])]
        if (merged.length !== (dup.claimIds || []).length || (p.sourceLocator && dup.sourceLocator !== str(p.sourceLocator, 1000))) {
          dup.claimIds = merged
          if (p.sourceLocator) dup.sourceLocator = str(p.sourceLocator, 1000)
          return { changedKeys: ['paper.results'], objects: [] }
        }
        return { changedKeys: [], objects: [] }
      }
      return { changedKeys: ['paper.results'], objects: [] }
    }
    case 'paper.verify-reference': {
      const r = findResult(snapshot, p.resultId)
      const usedAs = String(p.usedAs || '')
      if (!['method', 'concept', 'background', 'evidence'].includes(usedAs)) {
        throw new StoreError('invalid-command', 'usedAs 必须是 method | concept | background | evidence')
      }
      const doi = str(p.doi, 200).toLowerCase()
      const ref0 = r.references.find((x) => x.usedAs === usedAs && (doi ? x.doi === doi : true))
      if (!ref0) throw new StoreError('object-not-found', `未找到（${usedAs}${doi ? ` doi:${doi}` : ''}）的参考文献条目`)
      ref0.verified = p.verified === true
      ref0.verifyError = p.verified === true ? '' : str(p.verifyError, 300)
      ref0.checkedAt = now
      if (p.verified === true && p.title) ref0.title = str(p.title, 300)
      return { changedKeys: ['paper.results'], objects: [] }
    }
    case 'paper.remove-reference': {
      const r = findResult(snapshot, p.resultId)
      const usedAs = String(p.usedAs || '')
      const doi = str(p.doi, 200).toLowerCase()
      const before = r.references.length
      r.references = r.references.filter((x) => !(x.usedAs === usedAs && (doi ? x.doi === doi : true)))
      if (r.references.length === before) throw new StoreError('object-not-found', `未找到（${usedAs}${doi ? ` doi:${doi}` : ''}）的参考文献条目`)
      return { changedKeys: ['paper.results'], objects: [] }
    }
    case 'paper.set-screening': {
      const r = findResult(snapshot, p.resultId)
      const decision = String(p.decision || '')
      if (!['include', 'exclude', 'maybe'].includes(decision)) throw new StoreError('invalid-command', 'decision 必须是 include | exclude | maybe')
      const note = str(p.screeningNote, 2000)
      if (decision === 'exclude' && note.trim() === '') throw new StoreError('invalid-command', 'decision=exclude 需要 screeningNote 说明排除理由')
      r.screening = { decision, note, decidedAt: now }
      return { changedKeys: ['paper.results'], objects: [] }
    }
    case 'paper.set-narrative': {
      snapshot.paper.narrative = str(p.narrative, 4000)
      return { changedKeys: ['paper'], objects: [] }
    }
    case 'paper.import-legacy-result': {
      // 阶段 5：旧 blueprint.json 的 result 完整字段导入（只读迁移语义）。
      // 幂等：legacyId 已存在（或同名 claim 的 result 已存在）则跳过；旧 confirmed=true
      // 保留为 legacy-migration 凭据（与旧 paperspine normalizeConfirmation 同语义）。
      const legacy = p.legacy && typeof p.legacy === 'object' ? p.legacy : null
      if (!legacy || typeof legacy.id !== 'string' || !legacy.id) throw new StoreError('invalid-command', 'paper.import-legacy-result 需要 legacy.id')
      const existing = (snapshot.paper.results || []).find((r) => r && (r.id === legacy.id || r.legacyId === legacy.id))
      if (existing) return { changedKeys: [], objects: [], skipped: legacy.id }
      const id = typeof legacy.id === 'string' && /^res-\d+$/.test(legacy.id) ? legacy.id : `res-${numOr(snapshot.paper.resultSeq, 0) + 1}`
      if (!snapshot.paper.results.some((r) => r && r.id === id)) snapshot.paper.resultSeq = Math.max(numOr(snapshot.paper.resultSeq, 0), Number(String(id).slice(4)) || 0)
      const claims = (Array.isArray(legacy.claims) ? legacy.claims : []).filter((c) => c && typeof c === 'object' && typeof c.id === 'string').map((c) => ({
        id: String(c.id), text: str(c.text, 1000), revision: numOr(c.revision, 1), status: c.status === 'retired' ? 'retired' : 'active', createdAt: now, updatedAt: now,
      }))
      const primaryClaimText = str(legacy.claim, 1000)
      if (claims.length === 0 && primaryClaimText) claims.push({ id: `${id}-claim-1`, text: primaryClaimText, revision: 1, status: 'active', createdAt: now, updatedAt: now })
      const result = {
        id,
        legacyId: String(legacy.id),
        title: str(legacy.title, 200) || id,
        claim: primaryClaimText || (claims[0] ? claims[0].text : ''),
        purpose: str(legacy.purpose, 1000),
        status: RESULT_STATUSES.includes(String(legacy.status)) ? String(legacy.status) : 'planned',
        direction: EVIDENCE_DIRECTIONS.includes(String(legacy.direction)) ? String(legacy.direction) : 'not_assessed',
        evidenceState: EVIDENCE_STATES.includes(String(legacy.evidenceState)) ? String(legacy.evidenceState) : 'planned',
        manuscriptRole: MANUSCRIPT_ROLES.includes(String(legacy.manuscriptRole)) ? String(legacy.manuscriptRole) : 'main',
        presentation: {
          mode: PRESENTATION_MODES.includes(legacy.presentation && legacy.presentation.mode) ? legacy.presentation.mode : 'undecided',
          rationale: str(legacy.presentation && legacy.presentation.rationale, 1000),
        },
        claims,
        claimSeq: claims.length,
        evidence: (Array.isArray(legacy.evidence) ? legacy.evidence : []).filter((e) => e && typeof e === 'object').map((e, i) => ({
          id: typeof e.id === 'string' && e.id ? String(e.id) : `${id}-ev-${i + 1}`,
          claimIds: (Array.isArray(e.claimIds) ? e.claimIds : []).map(String),
          ...(e.claimRevisions && typeof e.claimRevisions === 'object' ? { claimRevisions: { ...e.claimRevisions } } : {}),
          direction: EVIDENCE_DIRECTIONS.includes(String(e.direction)) ? String(e.direction) : 'not_assessed',
          state: EVIDENCE_STATES.includes(String(e.state)) ? String(e.state) : 'planned',
          sourceLocator: str(e.sourceLocator, 2000),
          conditions: str(e.conditions, 2000),
          uncertainty: str(e.uncertainty, 2000),
          allowedInterpretation: str(e.allowedInterpretation, 2000),
          prohibitedInterpretation: str(e.prohibitedInterpretation, 2000),
          note: str(e.note, 2000),
          createdAt: Number(e.createdAt) || 0,
          updatedAt: Number(e.updatedAt) || Number(e.createdAt) || 0,
        })),
        evidenceSeq: (Array.isArray(legacy.evidence) ? legacy.evidence : []).length,
        tasks: (Array.isArray(legacy.tasks) ? legacy.tasks : []).map(String),
        figures: (Array.isArray(legacy.figures) ? legacy.figures : []).map(String).slice(0, 50),
        references: (Array.isArray(legacy.references) ? legacy.references : []).filter((x) => x && typeof x === 'object').map((x) => ({
          doi: str(x.doi, 200).toLowerCase(),
          title: str(x.title, 300),
          usedAs: ['method', 'concept', 'background', 'evidence'].includes(String(x.usedAs)) ? String(x.usedAs) : 'background',
          claimIds: (Array.isArray(x.claimIds) ? x.claimIds : []).map(String),
          relation: str(x.relation, 40),
          sourceLocator: str(x.sourceLocator, 1000),
          providedTitle: str(x.providedTitle, 300),
          verified: x.verified === true,
          verifyError: str(x.verifyError, 300),
          checkedAt: Number(x.checkedAt) || 0,
          addedAt: now,
        })),
        screening: legacy.screening && typeof legacy.screening === 'object' ? { decision: ['include', 'exclude', 'maybe'].includes(String(legacy.screening.decision)) ? String(legacy.screening.decision) : 'maybe', note: str(legacy.screening.note, 2000), decidedAt: now } : null,
        notes: str(legacy.notes, 4000),
        revision: numOr(legacy.revision, 1),
        confirmed: false,
        confirmation: null,
        createdAt: now,
        updatedAt: now,
      }
      // 旧确认凭据迁移（fail-safe：hash 不可复用旧值——记录 legacy-migration 标记并绑定 revision）
      if (legacy.confirmed === true) {
        result.confirmed = true
        result.confirmation = {
          revisionId: `${id}-r${result.revision}`,
          objectRevision: result.revision,
          contentHash: contentHashOf(result),
          confirmedBy: 'user',
          confirmedAt: now,
          source: 'legacy-migration',
        }
      }
      snapshot.paper.results.push(result)
      return { changedKeys: ['paper.results'], objects: [{ objectId: id, objectRevision: result.revision, imported: true }] }
    }
    case 'paper.archive-object': {
      const objectId = str(p.objectId, 100)
      const obj = findObject(snapshot, objectId)
      if (!obj) throw new StoreError('object-not-found', `对象 ${objectId} 不存在`)
      rememberRevision(obj, 'archive', now)
      obj.archived = true
      obj.revision = objectRevisionOf(obj) + 1
      obj.confirmed = false
      obj.confirmation = null
      obj.updatedAt = now
      return { changedKeys: ['paper.revisions'], objects: [{ objectId, objectRevision: objectRevisionOf(obj), archived: true }] }
    }
    case 'paper.record-proposal': {
      const source = str(p.source, 300).trim()
      if (!source) throw new StoreError('invalid-command', '结构提案必须带来源；不能把聊天全文或任意 Markdown 当作业务状态')
      if (!Array.isArray(snapshot.paper.proposals)) snapshot.paper.proposals = []
      const proposal = {
        id: `prop-${snapshot.paper.proposals.length + 1}`,
        source,
        objectIds: (Array.isArray(p.objectIds) ? p.objectIds : []).map((item) => str(item, 80)).filter(Boolean),
        note: str(p.note, 500),
        createdAt: now,
      }
      snapshot.paper.proposals.push(proposal)
      return { changedKeys: ['paper.proposals'], objects: [{ objectId: proposal.id, proposal: true }] }
    }
    case 'paper.register-artifact': {
      const out = registerArtifact(snapshot, { ...p, projectId: snapshot.projectId }, now)
      return { changedKeys: out.created ? ['artifactIndex'] : [], objects: [{ objectId: out.id, created: out.created }] }
    }
    case 'paper.relink-artifact': {
      const out = relinkArtifact(snapshot, p, now)
      if (!out.ok) throw new StoreError('object-conflict', out.diagnostic || '历史版本引用不能被同名文件替换', out)
      return { changedKeys: ['artifactIndex'], objects: [{ objectId: out.record.id, relocated: true }] }
    }
    case 'paper.dispatch-gate': {
      const gate = assertDispatchGate(snapshot, p.resultIds)
      return { changedKeys: [], objects: [], gate }
    }
    case 'project.set-metadata': {
      // workspaceKey 是服务端授权列，不接受客户端、工具或 metadata 覆盖。
      if (p.title !== undefined) snapshot.metadata.title = str(p.title, 300)
      if (p.workspaceIdentity !== undefined) snapshot.metadata.workspaceIdentity = str(p.workspaceIdentity, 500)
      if (snapshot.metadata && Object.prototype.hasOwnProperty.call(snapshot.metadata, 'workspaceKey')) {
        delete snapshot.metadata.workspaceKey
      }
      return { changedKeys: ['metadata'], objects: [] }
    }
    default:
      throw new StoreError('invalid-command', `未知领域命令 ${command || '（空）'}（可用：${COMMANDS.join(', ')}）`)
  }
}

// ---- 批量执行（唯一写入口）---------------------------------------------------------
// batch: { mutationId, expectedRevision?, actor, operations: [{ operationId?, command, payload }], source? }
// 语义：单事务全成全败；一次 project revision；每个语义变化的对象各自 revision++。
// M3：角色权限在 module 内断言（不依赖调用方自觉）——paper.* 写命令需要 writePaper；
// 派单闸门需要 dispatch 能力；teammate/attached 直接 forbidden。
// M2：纯闸门批次（只含 paper.dispatch-gate）走只读校验——不推进 revision、不落回执，
// 每次都基于当前快照重算（幂等重放不会给出过期结论）。
// M4：project.attach-session 经 store.attachSessionWithAudit 统一维护表+快照+审计。
export function executePaperCommands(store, ref, batch) {
  if (!ref || !ref.projectId) return { kind: 'invalid', reason: '当前会话尚未绑定项目（先经 ensureProject 建立绑定）' }
  const ops = Array.isArray(batch.operations) ? batch.operations : []
  if (ops.length === 0) return { kind: 'invalid', reason: 'operations 不能为空' }
  for (const op of ops) {
    if (!COMMANDS.includes(String(op.command))) {
      return { kind: 'invalid', reason: `未知领域命令 ${String(op.command || '（空）')}` }
    }
    // attach-session 走 store.attachSessionWithAudit 单 op 特判（无 applyOperation 分支）；
    // 混入批量时给出明确原因，而不是落到「未知领域命令」。
    if (String(op.command) === 'project.attach-session' && ops.length !== 1) {
      return { kind: 'invalid', reason: 'project.attach-session 只能作为单条操作执行（绑定审计需独立事务）' }
    }
  }
  const source = String(batch.source || 'tool')
  const caps = ref.capabilities || {}
  // M3：能力断言（设计 §18.5 后端重校验）
  if (ref.relationship === 'fork') return { kind: 'forbidden', reason: 'fork 与父项目写时复制隔离，不能写入该项目' }
  if (!caps.writePaper) return { kind: 'forbidden', reason: '当前会话没有论文语义写权限（成员只能提交提案与任务回报）' }

  // M4：attach-session 统一路径（root_bindings 表为访问权真源）
  if (ops.length === 1 && String(ops[0].command) === 'project.attach-session') {
    const rootSessionId = String((ops[0].payload || {}).rootSessionId || '')
    if (!rootSessionId) return { kind: 'invalid', reason: 'project.attach-session 需要 rootSessionId' }
    try {
      const out = store.attachSessionWithAudit({ projectId: ref.projectId, rootSessionId, actor: batch.actor || {} })
      if (out.kind === 'applied') {
        return { kind: 'applied', receipt: { mutationId: String(batch.mutationId || ''), projectId: ref.projectId, revision: out.revision, command: 'project.attach-session', changedKeys: ['bindings'], objects: [], appliedAt: Date.now(), source } }
      }
      return { kind: 'already-applied', receipt: { mutationId: String(batch.mutationId || ''), projectId: ref.projectId, command: 'project.attach-session', bound: true, source } }
    } catch (err) {
      if (err instanceof StoreError) {
        return { kind: err.code === 'binding-conflict' ? 'conflict' : 'invalid', reason: err.message }
      }
      throw err
    }
  }

  const isPureGate = ops.every((op) => String(op.command) === 'paper.dispatch-gate')
  if (isPureGate) {
    // M2：只读闸门——不消耗 revision，重放总是基于当前状态
    if (!caps.dispatch) return { kind: 'forbidden', reason: '当前会话没有派单权限（只有队长可以派单）' }
    const snap = store.snapshotOf(ref.projectId)
    if (!snap || snap.corrupt) return { kind: 'invalid', reason: (snap && snap.error) || '项目不存在' }
    try {
      let gate = null
      for (const op of ops) gate = assertDispatchGate(snap.snapshot, (op.payload || {}).resultIds)
      return { kind: 'applied', receipt: { mutationId: String(batch.mutationId || ''), projectId: ref.projectId, gateOnly: true, command: 'paper.dispatch-gate', gate, appliedAt: Date.now(), source } }
    } catch (err) {
      if (err instanceof StoreError) return { kind: 'invalid', reason: err.message, ...(err.details || {}) }
      throw err
    }
  }

  if (ops.some((op) => String(op.command) === 'paper.dispatch-gate') && !caps.dispatch) {
    return { kind: 'forbidden', reason: '当前会话没有派单权限（只有队长可以派单）' }
  }

  // T3：legacy 导入台账由 batch.legacyImport 传给 store，在同一事务内与命令/审计/回执提交。
  const storeHooks = batch.legacyImport
    ? { legacyImport: { ...batch.legacyImport, projectId: ref.projectId } }
    : {}
  const result = store.execute(ref.projectId, {
    mutationId: String(batch.mutationId || ''),
    expectedRevision: batch.expectedRevision,
    command: ops.length === 1 ? String(ops[0].command) : `batch(${ops.length})`,
    payload: { operations: ops.map((op) => ({ command: op.command, payload: op.payload })) },
    actor: batch.actor || {},
    source: source,
  }, (current, now) => {
    const changedKeys = new Set()
    const objects = []
    const gate = {}
    for (const op of ops) {
      // 确认凭据的 source 与批次来源一致（action-card / ui-action / conversation…）
      const payload = op.command === 'paper.confirm-revision' ? { ...(op.payload || {}), source } : op.payload
      const out = applyOperation(current, { command: op.command, payload }, now)
      for (const k of out.changedKeys || []) changedKeys.add(k)
      for (const o of out.objects || []) objects.push({ operationId: op.operationId || null, ...o })
      if (out.gate) Object.assign(gate, out.gate)
    }
    current.metadata.updatedAt = now
    return { snapshot: current, changedKeys: [...changedKeys], objects, ...gate }
  }, storeHooks)
  return result
}

// 对象级确认的便捷封装（Remote act / Action Card 共用）
export function confirmObjectRevision(store, ref, payload, opts = {}) {
  return executePaperCommands(store, ref, {
    mutationId: String(opts.mutationId || ''),
    expectedRevision: opts.expectedRevision,
    source: opts.source || 'conversation',
    actor: { sessionId: ref.currentSessionId, relationship: ref.relationship },
    operations: [{ command: 'paper.confirm-revision', payload }],
  })
}
