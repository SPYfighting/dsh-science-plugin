// dsh-science — 项目文件、证据与成果索引（路线 B T11）
//
// 索引只保存稳定引用。登记、关联和重新定位都不批量移动、重命名或删除文件。
// 文件存在不等于证据已核验；同名文件不能替换历史版本引用。

import { createHash } from 'node:crypto'
import { isAbsolute, relative, resolve } from 'node:path'

export const ARTIFACT_KINDS = Object.freeze(['data', 'code', 'figure', 'manuscript', 'reference', 'other'])
export const ARTIFACT_SOURCES = Object.freeze(['user-file', 'work-product', 'registered-evidence'])

export function artifactIdOf(projectId, versionToken) {
  const digest = createHash('sha256').update(`dsh-science-artifact-v1\0${projectId}\0${versionToken}`).digest('hex')
  return `art-${digest.slice(0, 16)}`
}

function cleanList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean))]
}

function indexOf(snapshot) {
  if (!snapshot.artifactIndex || !Array.isArray(snapshot.artifactIndex.items)) {
    snapshot.artifactIndex = { items: [] }
  }
  return snapshot.artifactIndex
}

// 领域命令需要按 id 取索引记录，并让 paper.figures/links 与索引双向一致。
export function indexItemOf(snapshot, artifactId) {
  return indexOf(snapshot).items.find((item) => item && item.id === String(artifactId || '')) || null
}

export function cleanIndexList(list) {
  return cleanList(list)
}

export function registerArtifact(snapshot, payload, now) {
  const projectId = String(payload.projectId || snapshot.projectId || '')
  const versionToken = String(payload.versionToken || '').trim()
  const source = String(payload.source || '')
  const kind = String(payload.kind || '')
  if (!projectId) throw new Error('artifact-project-required')
  if (!versionToken) throw new Error('artifact-version-required')
  if (!ARTIFACT_SOURCES.includes(source)) throw new Error('artifact-source-invalid')
  if (!ARTIFACT_KINDS.includes(kind)) throw new Error('artifact-kind-invalid')
  const index = indexOf(snapshot)
  const id = artifactIdOf(projectId, versionToken)
  const existing = index.items.find((item) => item.id === id)
  if (existing) return { id, created: false, record: existing }
  const record = {
    id,
    projectId,
    kind,
    source,
    verified: false,
    pathRef: payload.pathRef || null,
    versionToken,
    summary: String(payload.summary || '').slice(0, 500),
    taskId: String(payload.taskId || ''),
    resultIds: cleanList(payload.resultIds),
    claimIds: cleanList(payload.claimIds),
    status: 'available',
    previousVersionId: String(payload.previousVersionId || ''),
    registeredAt: now,
    updatedAt: now,
  }
  index.items.push(record)
  return { id, created: true, record }
}

export function linkArtifact(snapshot, payload, now) {
  const index = indexOf(snapshot)
  const record = index.items.find((item) => item.id === String(payload.artifactId || ''))
  if (!record) throw new Error('artifact-not-found')
  record.resultIds = cleanList([...record.resultIds, ...cleanList(payload.resultIds)])
  record.claimIds = cleanList([...record.claimIds, ...cleanList(payload.claimIds)])
  record.updatedAt = now
  return record
}

export function relinkArtifact(snapshot, payload, now) {
  const index = indexOf(snapshot)
  const record = index.items.find((item) => item.id === String(payload.artifactId || ''))
  if (!record) throw new Error('artifact-not-found')
  if (String(payload.versionToken || '') !== record.versionToken) {
    return { ok: false, reason: 'version-changed', cited: record.versionToken, found: String(payload.versionToken || '') }
  }
  record.pathRef = payload.pathRef
  record.status = 'available'
  record.updatedAt = now
  return { ok: true, record }
}

export function diagnoseArtifact(record, probe) {
  if (!record) return { status: 'missing-record', diagnostic: '当前项目没有这条索引。' }
  if (!probe || probe.exists !== true) {
    return { status: 'missing', diagnostic: '文件已失联。可以重新定位，不能假装仍可打开。' }
  }
  if (probe.versionToken && probe.versionToken !== record.versionToken) {
    return { status: 'version-changed', cited: record.versionToken, found: probe.versionToken, diagnostic: '同名文件的版本已变化，不能替换历史引用。' }
  }
  return { status: 'available', diagnostic: '' }
}

export function authorizeArtifactRead({ record, projectId, hostAllows, locate }) {
  if (!record || record.projectId !== projectId) return { ok: false, status: 404, reason: 'not-found' }
  if (hostAllows !== true) return { ok: false, status: 403, reason: 'host-denied' }
  const located = typeof locate === 'function' ? locate(record) : { insideBoundary: false }
  if (!located || located.insideBoundary !== true) return { ok: false, status: 403, reason: 'path-boundary' }
  const diagnosis = diagnoseArtifact(record, located)
  if (diagnosis.status === 'missing') return { ok: false, status: 404, reason: 'missing-file', diagnostic: diagnosis.diagnostic }
  if (diagnosis.status === 'version-changed') return { ok: false, status: 409, reason: 'version-changed', diagnostic: diagnosis.diagnostic }
  return { ok: true, artifactId: record.id, summary: record.summary }
}

export function locateProjectPath(pathRef, { root, exists, versionOf }) {
  const raw = pathRef && pathRef.path
  if (!root || !raw || raw.includes('\0') || isAbsolute(raw) || raw.split(/[\\/]/).includes('..')) {
    return { insideBoundary: false, exists: false }
  }
  const abs = resolve(root, raw)
  const rel = relative(root, abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return { insideBoundary: false, exists: false }
  const present = exists(abs) === true
  return { insideBoundary: true, exists: present, path: abs, versionToken: present && versionOf ? versionOf(abs) : '' }
}

export function artifactsForResult(snapshot, resultId) {
  const items = snapshot && snapshot.artifactIndex && snapshot.artifactIndex.items || []
  return items.filter((item) => item.resultIds.includes(resultId))
}
