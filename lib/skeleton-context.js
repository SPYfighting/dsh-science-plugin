// dsh-science — 暂定论文骨架生命周期与最小上下文包（路线 B T10）
//
// 骨架不是聊天全文。提案、修改和归档都追加修订；确认只绑定用户实际审阅过的对象修订。
// 上下文包只由服务端从当前会话的项目快照生成。过期引用返回被引用修订和当前修订，不改绑对象。

export const SKELETON_LIFECYCLE = Object.freeze([
  { action: 'propose', command: 'paper.propose-core | paper.propose-result | paper.record-proposal', effect: '追加待确认草案；必须带来源；不自动确认、不派发任务' },
  { action: 'confirm', command: 'paper.confirm-revision', effect: '只确认 expectedObjectRevision + expectedHash 对应的当前对象；探索和整理材料不受阶段限制' },
  { action: 'revise', command: 'paper.update-result | paper.propose-core | paper.record-claim | paper.retire-claim', effect: '语义变化追加 history 并推进对象修订；旧确认失效；旧任务/证据关系仍可按修订查询' },
  { action: 'archive', command: 'paper.archive-object', effect: '对象保留并标记 archived；追加归档修订；不删除任务、证据或历史关系' },
])

const CLIP = Object.freeze({ question: 160, claim: 240, evidence: 120 })

export function clipText(value, max) {
  const text = String(value || '')
  if (text.length <= max) return { text, truncated: false, sourceBytes: text.length }
  return { text: text.slice(0, max), truncated: true, sourceBytes: text.length, omittedBytes: text.length - max }
}

export function semanticSnapshotOf(obj) {
  const source = obj || {}
  return {
    revision: Math.max(1, Number(source.revision) || 1),
    title: String(source.title || ''),
    claim: String(source.claim || ''),
    purpose: String(source.purpose || ''),
    innovation: String(source.innovation || ''),
    venue: String(source.venue || ''),
    manuscriptRole: String(source.manuscriptRole || ''),
    status: String(source.status || ''),
    claimIds: (source.claims || []).map((item) => item && item.id).filter(Boolean),
    evidenceIds: (source.evidence || []).map((item) => item && item.id).filter(Boolean),
    taskIds: Array.isArray(source.tasks) ? [...source.tasks] : [],
    figureIds: Array.isArray(source.figures) ? [...source.figures] : [],
  }
}

export function rememberRevision(obj, reason, now) {
  if (!obj || typeof obj !== 'object') return null
  if (!Array.isArray(obj.history)) obj.history = []
  const entry = { ...semanticSnapshotOf(obj), reason, at: now }
  obj.history.push(entry)
  return entry
}

export function revisionRecordOf(obj, revision) {
  const wanted = Number(revision)
  if (!obj || !Number.isFinite(wanted)) return null
  if (Math.max(1, Number(obj.revision) || 1) === wanted) return semanticSnapshotOf(obj)
  return (obj.history || []).find((item) => Number(item.revision) === wanted) || null
}

export function citeObject(snapshot, objectRef) {
  const objectId = String(objectRef && (objectRef.objectId || objectRef.resultId || objectRef.id) || '')
  if (!objectId) return { status: 'unselected' }
  const paper = snapshot && snapshot.paper
  const obj = objectId === 'core' ? paper && paper.core : ((paper && paper.results) || []).find((item) => item && item.id === objectId)
  if (!obj) return { status: 'missing', objectId, message: '当前项目没有这个对象。没有改用其他项目或同名对象。' }
  const currentRevision = Math.max(1, Number(obj.revision) || 1)
  const expected = objectRef.expectedRevision != null ? Number(objectRef.expectedRevision) : null
  if (expected != null && expected !== currentRevision) {
    return {
      status: 'stale',
      objectId,
      citedRevision: expected,
      cited: revisionRecordOf(obj, expected),
      currentRevision,
      current: semanticSnapshotOf(obj),
      message: `引用的是 r${expected}，当前已是 r${currentRevision}。可以继续讨论旧修订，不会静默改成另一个对象。`,
    }
  }
  return { status: 'current', objectId, currentRevision, current: semanticSnapshotOf(obj) }
}

function claimSummary(claim, expand) {
  const full = expand && expand.claims && expand.claims.includes(claim.id)
  const clip = clipText(claim.text, CLIP.claim)
  return {
    id: claim.id,
    revision: claim.revision || 1,
    status: claim.status || 'active',
    text: full ? String(claim.text || '') : clip.text,
    truncated: full ? false : clip.truncated,
  }
}

function evidenceSummary(item, expand) {
  const full = expand && expand.evidence && expand.evidence.includes(item.id)
  const clip = clipText(item.note || item.allowedInterpretation || '', CLIP.evidence)
  return {
    id: item.id,
    claimIds: item.claimIds || [],
    direction: item.direction,
    state: item.state,
    sourceLocator: item.sourceLocator || '',
    excerpt: full ? String(item.note || item.allowedInterpretation || '') : clip.text,
    truncated: full ? false : clip.truncated,
  }
}

export function buildContextPack(snapshot, { objectRef = null, expand = null } = {}) {
  if (!snapshot || !snapshot.paper) {
    return { kind: 'unbound', project: null, objects: [], openQuestions: [], truncated: [] }
  }
  const paper = snapshot.paper
  const question = clipText(paper.question, CLIP.question)
  const selected = citeObject(snapshot, objectRef)
  const objects = []
  if (selected.status === 'current') {
    const obj = selected.objectId === 'core' ? paper.core : paper.results.find((item) => item.id === selected.objectId)
    objects.push({
      objectId: selected.objectId,
      revision: selected.currentRevision,
      title: obj.title || '',
      claim: clipText(obj.claim, CLIP.claim),
      claims: (obj.claims || []).map((item) => claimSummary(item, expand)),
      evidence: (obj.evidence || []).map((item) => evidenceSummary(item, expand)),
      taskIds: obj.tasks || [],
      figureIds: obj.figures || [],
      archived: Boolean(obj.archived),
    })
  }
  const openQuestions = []
  if (paper.core && !paper.core.confirmed) openQuestions.push({ objectId: 'core', revision: paper.core.revision || 1, reason: '核心尚未确认' })
  for (const result of paper.results || []) {
    if (result && !result.archived && !result.confirmed) openQuestions.push({ objectId: result.id, revision: result.revision || 1, reason: 'Result 尚未确认' })
  }
  return {
    kind: 'project-context',
    project: {
      revision: snapshot.revision || 0,
      question: question.text,
      questionTruncated: question.truncated,
      stage: paper.stage || 'explore',
      coreRevision: paper.core ? paper.core.revision || 1 : 0,
      resultCount: (paper.results || []).length,
    },
    selection: selected,
    objects,
    openQuestions,
    derived: true,
  }
}

export function objectRefToken(target) {
  if (!target) return ''
  const objectId = typeof target === 'string' ? target : target.objectId || target.id
  if (!objectId) return ''
  const revision = typeof target === 'object' && target.revision != null ? ` revision=${Number(target.revision)}` : ''
  return `[[dsh-science-ref objectId=${objectId}${revision}]]`
}

export function parseObjectRef(text) {
  const match = String(text || '').match(/\[\[dsh-science-ref\s+objectId=([A-Za-z0-9_-]+)(?:\s+revision=(\d+))?\]\]/)
  if (!match) return null
  return { objectId: match[1], expectedRevision: match[2] ? Number(match[2]) : null }
}

const WRITE_RECEIPT_KEYS = ['receipt', 'saved']

export function stateChangeSummary(value) {
  if (!value || typeof value !== 'object') return null
  const parts = []
  if (value.resultId) parts.push(value.resultId)
  if (value.objectId) parts.push(value.objectId)
  if (value.taskId) parts.push(value.taskId)
  if (value.figureId) parts.push(value.figureId)
  if (value.claimId) parts.push(value.claimId)
  if (value.evidenceId) parts.push(value.evidenceId)
  if (value.stage) parts.push(`阶段 → ${value.stage}`)
  if (value.revision) parts.push(`rev ${value.revision}`)
  if (Array.isArray(value.changed) && value.changed.length > 0) parts.push(value.changed.join('、'))
  const wrote = value.saved === true || (value.receipt && typeof value.receipt === 'object')
  if (parts.length === 0 && wrote) parts.push('已保存')
  if (value.requireConfirm) parts.push('待用户确认')
  if (value.stale) parts.push('引用已过期')
  return parts.join(' · ') || null
}

export { WRITE_RECEIPT_KEYS }
