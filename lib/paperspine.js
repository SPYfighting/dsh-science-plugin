// DSH 论文证据主干 v2（DSH Evidence Spine）
//
// 这是蓝图的纯领域层：负责旧数据迁移、版本化确认和论文就绪状态计算。
// 文件读写、工具注册与 UI 投影仍由 blueprint.js/httpdata.js 承担。

import { createHash } from 'node:crypto'

export const PAPER_STAGES = ['explore', 'frame', 'execute', 'synthesize', 'draft', 'audit']
export const EVIDENCE_DIRECTIONS = ['not_assessed', 'supports', 'contradicts', 'inconclusive', 'not_applicable']
export const EVIDENCE_STATES = ['planned', 'observed', 'verified', 'disputed', 'invalidated']
export const MANUSCRIPT_ROLES = ['main', 'validation', 'control', 'boundary', 'supplement', 'excluded']
export const PRESENTATION_MODES = ['undecided', 'figure', 'table', 'prose', 'supplement', 'omit']
export const SUBMISSION_ITEMS = ['dataCode', 'ethics', 'reporting', 'limitations']

const clone = (value) => {
  try { return JSON.parse(JSON.stringify(value ?? {})) } catch { return {} }
}

const stringOf = (value, fallback = '') => typeof value === 'string' ? value : fallback
const enumOf = (value, allowed, fallback) => allowed.includes(value) ? value : fallback
const arrayOf = (value) => Array.isArray(value) ? value.filter(Boolean) : []

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  }
  return value
}

function semanticPayload(entity, entityId) {
  if (entityId === 'core') {
    return {
      title: stringOf(entity.title), claim: stringOf(entity.claim), innovation: stringOf(entity.innovation),
      venue: stringOf(entity.venue),
    }
  }
  return {
    title: stringOf(entity.title), claim: stringOf(entity.claim), purpose: stringOf(entity.purpose),
    manuscriptRole: enumOf(entity.manuscriptRole, MANUSCRIPT_ROLES, 'main'),
    claims: arrayOf(entity.claims).filter((c) => c.status !== 'retired').map((c) => ({
      id: stringOf(c.id), text: stringOf(c.text), revision: Number(c.revision) || 1,
    })),
  }
}

export function semanticHashOf(entity, entityId) {
  return createHash('sha256').update(JSON.stringify(stable(semanticPayload(entity || {}, entityId)))).digest('hex')
}

export function isConfirmationCurrent(entity, entityId) {
  if (!entity || entity.confirmed !== true || !entity.confirmation) return false
  const revision = Number(entity.revision) || 1
  if (entity.confirmation.revisionId !== `${entityId}-r${revision}`) return false
  // 路线 B（2026-11-13）：领域层确认凭据显式记录 objectRevision——语义修改才推进 revision、
  // 执行性更新（记录证据/链任务/改状态）不推进，因此 revision 相等即当前修订有效。
  // 旧凭据（legacy-migration / 旧工具）没有 objectRevision 字段时回退语义哈希比对。
  if (entity.confirmation.objectRevision != null) {
    return Number(entity.confirmation.objectRevision) === revision
  }
  return entity.confirmation.contentHash === semanticHashOf(entity, entityId)
}

export function confirmEntityRevision(entity, entityId, options = {}) {
  if (!entity || typeof entity !== 'object') throw new Error('无法确认空对象')
  entity.revision = Math.max(1, Number(entity.revision) || 1)
  const receipt = {
    revisionId: `${entityId}-r${entity.revision}`,
    contentHash: semanticHashOf(entity, entityId),
    confirmedBy: stringOf(options.confirmedBy, 'user'),
    confirmedAt: Number(options.confirmedAt) || Date.now(),
    source: stringOf(options.source, 'conversation'),
  }
  entity.confirmed = true
  entity.confirmation = receipt
  return receipt
}

export function reviseEntity(entity) {
  if (!entity || typeof entity !== 'object') return entity
  entity.revision = Math.max(1, Number(entity.revision) || 1) + 1
  entity.confirmed = false
  entity.confirmation = null
  return entity
}

function normalizeConfirmation(entity, entityId) {
  entity.revision = Math.max(1, Number(entity.revision) || 1)
  if (entity.confirmed === true && !entity.confirmation) {
    // 兼容旧版 confirmed=true：保留既有授权，同时明确标记为迁移凭据。
    confirmEntityRevision(entity, entityId, {
      source: 'legacy-migration',
      confirmedBy: 'user',
      confirmedAt: Number(entity.updatedAt) || 1,
    })
  } else if (!isConfirmationCurrent(entity, entityId)) {
    entity.confirmed = false
    entity.confirmation = null
  }
}

function normalizeSubmission(raw) {
  const out = {}
  for (const key of SUBMISSION_ITEMS) {
    const row = raw && typeof raw[key] === 'object' ? raw[key] : {}
    const status = ['pending', 'complete', 'not_applicable'].includes(row.status) ? row.status : 'pending'
    out[key] = { status, note: stringOf(row.note), updatedAt: Number(row.updatedAt) || 0 }
  }
  return out
}

function normalizeResult(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const id = stringOf(r.id)
  const legacyNegative = r.status === 'negative'
  const legacyDropped = r.status === 'dropped'
  const primaryClaimId = `${id}-claim-1`
  let claims = arrayOf(r.claims).map((c, index) => ({
    id: stringOf(c.id, `${id}-claim-${index + 1}`),
    text: stringOf(c.text, index === 0 ? stringOf(r.claim) : ''),
    revision: Math.max(1, Number(c.revision) || 1),
    status: c.status === 'retired' ? 'retired' : 'active',
    createdAt: Number(c.createdAt) || Number(r.updatedAt) || 0,
    updatedAt: Number(c.updatedAt) || Number(r.updatedAt) || 0,
  })).filter((c) => c.text)
  if (claims.length === 0 && stringOf(r.claim)) {
    claims = [{ id: primaryClaimId, text: stringOf(r.claim), revision: 1, status: 'active', createdAt: Number(r.updatedAt) || 0, updatedAt: Number(r.updatedAt) || 0 }]
  }
  const out = {
    ...r,
    id,
    title: stringOf(r.title, id),
    claim: stringOf(r.claim, claims[0] ? claims[0].text : ''),
    purpose: stringOf(r.purpose),
    status: stringOf(r.status, 'planned'),
    direction: enumOf(r.direction, EVIDENCE_DIRECTIONS, legacyNegative ? 'contradicts' : r.status === 'supported' ? 'supports' : 'not_assessed'),
    evidenceState: enumOf(r.evidenceState, EVIDENCE_STATES, r.status === 'supported' ? 'verified' : legacyNegative ? 'observed' : 'planned'),
    manuscriptRole: enumOf(r.manuscriptRole, MANUSCRIPT_ROLES, legacyDropped ? 'excluded' : legacyNegative ? 'boundary' : 'main'),
    presentation: {
      mode: enumOf(r.presentation && r.presentation.mode, PRESENTATION_MODES, 'undecided'),
      rationale: stringOf(r.presentation && r.presentation.rationale),
    },
    claims,
    claimSeq: Math.max(claims.length, Number(r.claimSeq) || 0),
    evidence: arrayOf(r.evidence).map((e, index) => ({
      id: stringOf(e.id, `${id}-ev-${index + 1}`),
      claimIds: arrayOf(e.claimIds).map(String),
      ...(e.claimRevisions && typeof e.claimRevisions === 'object' ? { claimRevisions: { ...e.claimRevisions } } : {}),
      direction: enumOf(e.direction, EVIDENCE_DIRECTIONS, 'not_assessed'),
      state: enumOf(e.state, EVIDENCE_STATES, 'planned'),
      sourceLocator: stringOf(e.sourceLocator),
      conditions: stringOf(e.conditions),
      uncertainty: stringOf(e.uncertainty),
      allowedInterpretation: stringOf(e.allowedInterpretation),
      prohibitedInterpretation: stringOf(e.prohibitedInterpretation),
      note: stringOf(e.note),
      createdAt: Number(e.createdAt) || 0,
      updatedAt: Number(e.updatedAt) || 0,
    })),
    evidenceSeq: Math.max(arrayOf(r.evidence).length, Number(r.evidenceSeq) || 0),
    tasks: arrayOf(r.tasks).map(String),
    figures: arrayOf(r.figures).map(String),
    references: arrayOf(r.references),
    screening: r.screening || null,
    notes: stringOf(r.notes),
    updatedAt: Number(r.updatedAt) || 0,
  }
  normalizeConfirmation(out, id)
  return out
}

export function normalizePaperSpine(raw) {
  const source = clone(raw)
  const coreRaw = source.core && typeof source.core === 'object' ? source.core : {}
  const core = {
    ...coreRaw,
    title: stringOf(coreRaw.title), claim: stringOf(coreRaw.claim), innovation: stringOf(coreRaw.innovation),
    venue: stringOf(coreRaw.venue), updatedAt: Number(coreRaw.updatedAt) || 0,
  }
  normalizeConfirmation(core, 'core')
  return {
    ...source,
    schemaVersion: 2,
    stage: enumOf(source.stage, PAPER_STAGES, core.claim ? 'frame' : 'explore'),
    stageUpdatedAt: Number(source.stageUpdatedAt) || 0,
    core,
    results: arrayOf(source.results).filter((r) => r && typeof r === 'object' && typeof r.id === 'string').map(normalizeResult),
    narrative: stringOf(source.narrative),
    resultSeq: Number(source.resultSeq) || 0,
    submission: normalizeSubmission(source.submission),
    updatedAt: Number(source.updatedAt) || 0,
  }
}

const readiness = (blockers) => ({ state: blockers.length === 0 ? 'ready' : 'blocked', blockers })

// Evidence without a revision can safely describe the original claim. After the wording
// changes it remains in the history until the user records its interpretation for the new claim.
export function evidenceAppliesTo(evidence, claim) {
  if (!(evidence.claimIds || []).includes(claim.id)) return false
  const revision = Number(claim.revision) || 1
  return evidence.claimRevisions ? Number(evidence.claimRevisions[claim.id]) === revision : revision === 1
}

export function requiresEvidenceReview(e) {
  return e.state === 'disputed' || (['observed', 'verified'].includes(e.state) && ['contradicts', 'inconclusive'].includes(e.direction))
}

function assessClaim(claim, evidence, review) {
  const linked = evidence.filter((e) => e.claimIds.includes(claim.id))
  const current = linked.filter((e) => evidenceAppliesTo(e, claim))
  const historical = linked.filter((e) => !evidenceAppliesTo(e, claim))
  const verified = current.filter((e) => e.state === 'verified' && e.sourceLocator && e.allowedInterpretation)
  const support = verified.filter((e) => e.direction === 'supports')
  const conflicts = current.filter(requiresEvidenceReview)
  const blockers = []
  if (!verified.length) blockers.push('尚无可核验证据')
  else if (!support.length) blockers.push('现有证据不支撑该主张（仅有反向或中性证据）')
  if (!support.length && historical.length) blockers.push('旧修订的证据需按当前表述重新关联')
  const token = `${claim.id}@r${claim.revision}`
  const cited = new Set(String(review?.evidence || '').match(/[A-Za-z0-9_-]+/g) || [])
  const resolved = conflicts.length > 0 && review?.severity === 'pass' && review.token === token
    && Boolean(review.message.trim()) && conflicts.every((e) => cited.has(e.id) && (!e.createdAt || review.startedAt >= e.createdAt))
  if (conflicts.length && !resolved) {
    const sources = conflicts.map((e) => e.sourceLocator || e.id)
    blockers.push(`复核反向或不确定证据：${sources.join('、')}`)
  }
  if (review?.severity !== 'pass') blockers.push(review?.severity ? `主张审查尚未通过（${review.severity}）` : '尚未完成主张审查')
  return {
    id: claim.id, revision: claim.revision, text: claim.text,
    evidenceIds: current.map((e) => e.id), historicalEvidenceIds: historical.map((e) => e.id),
    conflictingEvidenceIds: conflicts.map((e) => e.id), conflictReviewed: resolved, review: review || null, blockers,
  }
}

export function paperSpineViewOf(rawBlueprint, teamState, figuresState, reviewCoverage = null) {
  const bp = normalizePaperSpine(rawBlueprint)
  const tasks = arrayOf(teamState && teamState.tasks).filter((t) => t && t.status !== 'deleted')
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const figures = Array.isArray(figuresState)
    ? figuresState.filter(Boolean)
    : Object.values(figuresState && typeof figuresState === 'object' ? figuresState : {}).filter(Boolean)
  const figureById = new Map(figures.filter((f) => f && f.id).map((f) => [f.id, f]))
  const reviewById = new Map(arrayOf(reviewCoverage && reviewCoverage.results).map((r) => [r.id, r]))
  const submissionBlockers = SUBMISSION_ITEMS.filter((key) => !['complete', 'not_applicable'].includes(bp.submission[key].status))

  const results = bp.results.map((r) => {
    const excluded = r.manuscriptRole === 'excluded'
    const taskIds = new Set(r.tasks)
    for (const task of tasks) {
      const ids = arrayOf(task.resultIds).map(String)
      if (task.resultId) ids.push(String(task.resultId))
      if (ids.includes(r.id)) taskIds.add(task.id)
    }
    const linkedTasks = [...taskIds].map((id) => taskById.get(id)).filter(Boolean)
    const incompleteTasks = linkedTasks.filter((t) => !['completed', 'cancelled'].includes(t.status))
    const linkedFigures = r.figures.map((id) => figureById.get(id)).filter(Boolean)
    const approvedFigures = linkedFigures.filter((f) => f.audit && f.audit.overallStatus === 'approved')
    const activeClaims = r.claims.filter((c) => c.status !== 'retired' && c.text)
    const verifiedEvidence = r.evidence.filter((e) => e.state === 'verified' && e.sourceLocator && e.allowedInterpretation)
    const review = reviewById.get(r.id)
    const claimAssessments = activeClaims.map((claim) => {
      const item = review?.claimReviews?.find((v) => v.id === claim.id)
        || (!review?.claimReviews?.length && activeClaims.length === 1 ? review : null)
      return assessClaim(claim, r.evidence, item)
    })
    const scientificBlockers = []
    if (!excluded) {
      if (!isConfirmationCurrent(r, r.id)) scientificBlockers.push('当前 Result 修订尚未确认')
      if (!activeClaims.length) scientificBlockers.push('尚无可检验 Claim')
      for (const claim of claimAssessments) {
        for (const blocker of claim.blockers) scientificBlockers.push(activeClaims.length === 1 ? blocker : `${claim.id}：${blocker}`)
      }
      if (['fail', 'warn'].includes(review?.resultReview?.severity)) scientificBlockers.push('结果整体审查尚未通过')
      if (incompleteTasks.length > 0) scientificBlockers.push(`有 ${incompleteTasks.length} 项工作未完成`)
    }
    const scientific = excluded ? { state: 'excluded', blockers: [] } : readiness(scientificBlockers)

    const manuscriptBlockers = []
    if (!excluded) {
      if (scientific.state !== 'ready') manuscriptBlockers.push('科学证据尚未就绪')
      if (r.presentation.mode === 'undecided') manuscriptBlockers.push('尚未决定呈现方式')
      if (r.presentation.mode === 'figure' && approvedFigures.length === 0) manuscriptBlockers.push('尚无批准图件')
      const unverifiedRefs = r.references.filter((ref) => ref && !ref.verified).length
      if (unverifiedRefs > 0) manuscriptBlockers.push(`有 ${unverifiedRefs} 条参考文献未核验`)
    }
    const manuscript = excluded ? { state: 'excluded', blockers: [] } : readiness(manuscriptBlockers)
    const resultSubmissionBlockers = excluded ? [] : [
      ...(manuscript.state === 'ready' ? [] : ['文稿尚未就绪']),
      ...submissionBlockers.map((key) => `投稿检查未完成：${key}`),
    ]

    return {
      id: r.id, title: r.title, claim: r.claim, purpose: r.purpose, excluded,
      direction: r.direction, evidenceState: r.evidenceState, manuscriptRole: r.manuscriptRole,
      presentation: r.presentation, confirmation: r.confirmation, revision: r.revision,
      claims: activeClaims, claimAssessments, evidence: r.evidence,
      counts: {
        claims: activeClaims.length, evidence: r.evidence.length, verifiedEvidence: verifiedEvidence.length,
        tasks: linkedTasks.length, completedTasks: linkedTasks.filter((t) => t.status === 'completed').length,
        figures: linkedFigures.length, approvedFigures: approvedFigures.length,
        references: r.references.length, verifiedReferences: r.references.filter((ref) => ref && ref.verified).length,
      },
      readiness: { scientific, manuscript, submission: excluded ? { state: 'excluded', blockers: [] } : readiness(resultSubmissionBlockers) },
      nextAction: scientific.blockers[0] || manuscript.blockers[0] || resultSubmissionBlockers[0] || '该 Result 已通过当前全部闸门',
    }
  })
  const included = results.filter((r) => !r.excluded)
  const counts = {
    total: results.length,
    included: included.length,
    scientificReady: included.filter((r) => r.readiness.scientific.state === 'ready').length,
    manuscriptReady: included.filter((r) => r.readiness.manuscript.state === 'ready').length,
    submissionReady: included.filter((r) => r.readiness.submission.state === 'ready').length,
  }
  const firstBlocked = included.find((r) => r.readiness.submission.state !== 'ready')
  return {
    schemaVersion: 2,
    stage: bp.stage,
    core: {
      title: bp.core.title, claim: bp.core.claim, revision: bp.core.revision,
      confirmed: isConfirmationCurrent(bp.core, 'core'), confirmation: bp.core.confirmation,
    },
    submission: bp.submission,
    counts,
    results,
    nextDecision: firstBlocked ? `${firstBlocked.id}：${firstBlocked.nextAction}` : included.length ? '全部 Result 已通过当前投稿闸门' : '先建立并确认文章 Result',
  }
}
