// dsh-science 阶段 6 科研语义修复回归测试：
// H1 presentationRationale 落盘 / M1 claim 文本同步 / M2 negative-notes 领域约束 /
// M6 claim 退休 / L1 核心 claim 非空 / L2 dropped 闸门 / L6 审查重试提示
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-semantic-fix-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { executePaperCommands, contentHashOf, objectRevisionOf, assertDispatchGate } = await import('../lib/project-domain.js')

let store = null

function resetHome() {
  if (store) { try { store.close() } catch { /* ignore */ } store = null }
  rmSync(join(home, 'dsh-science'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  mkdirSync(join(home, 'dsh-science'), { recursive: true })
  store = ProjectStore.open(home)
}

const REF = (pid) => ({ projectId: pid, rootSessionId: 'lead-1', currentSessionId: 'lead-1', relationship: 'root', capabilities: { read: true, propose: true, writePaper: true, dispatch: true } })

function seedProject() {
  const pid = store.createProject({ rootSessionId: 'lead-1' })
  executePaperCommands(store, REF(pid), { mutationId: 'seed', operations: [
    { command: 'paper.propose-core', payload: { title: 'T', claim: 'C' } },
    { command: 'paper.propose-result', payload: { title: 'R1', claim: '原始主张', purpose: 'p' } },
  ] })
  return pid
}

describe('科研语义修复回归（阶段 6）', () => {
  beforeEach(() => { resetHome() })

  test('H1 回归：presentation_rationale 持久化（不再被领域层丢弃）', () => {
    const pid = seedProject()
    executePaperCommands(store, REF(pid), { mutationId: 'u1', operations: [{ command: 'paper.update-result', payload: { resultId: 'res-1', presentationMode: 'figure', presentationRationale: '效应量对比需主图呈现' } }] })
    const view = store.snapshotOf(pid).snapshot
    const r0 = view.paper.results[0]
    assert.equal(r0.presentation.mode, 'figure')
    assert.equal(r0.presentation.rationale, '效应量对比需主图呈现')
  })

  test('M1 回归：主 claim 修改同步首个 active claim（revision 推进，id 稳定）', () => {
    const pid = seedProject()
    const before = store.snapshotOf(pid).snapshot.paper.results[0]
    const claimId = before.claims[0].id
    executePaperCommands(store, REF(pid), { mutationId: 'u2', operations: [{ command: 'paper.update-result', payload: { resultId: 'res-1', claim: '修改后的主张' } }] })
    const after = store.snapshotOf(pid).snapshot.paper.results[0]
    assert.equal(after.claim, '修改后的主张')
    assert.equal(after.claims[0].id, claimId, 'claim id 稳定')
    assert.equal(after.claims[0].text, '修改后的主张', 'claim 文本同步（审查清单/语义哈希不再用旧文本）')
    assert.equal(after.claims[0].revision, 2, 'claim revision 推进（保留历史）')
  })

  test('M2 回归：status=negative 无 notes 在领域层拒绝', () => {
    const pid = seedProject()
    const r = executePaperCommands(store, REF(pid), { mutationId: 'u3', operations: [{ command: 'paper.update-result', payload: { resultId: 'res-1', status: 'negative' } }] })
    assert.equal(r.kind, 'invalid')
    assert.match(r.reason, /negative 需要 notes/)
    // 带 notes 可通过
    const ok = executePaperCommands(store, REF(pid), { mutationId: 'u4', operations: [{ command: 'paper.update-result', payload: { resultId: 'res-1', status: 'negative', notes: '调整表述重跑队列分析' } }] })
    assert.equal(ok.kind, 'applied')
  })

  test('M6 回归：claim 退休（保留 id 与证据引用，确认失效）', () => {
    const pid = seedProject()
    executePaperCommands(store, REF(pid), { mutationId: 'c1', operations: [{ command: 'paper.record-claim', payload: { resultId: 'res-1', text: '待退休主张' } }] })
    const before = store.snapshotOf(pid).snapshot.paper.results[0]
    const retireTarget = before.claims.find((c) => c.text === '待退休主张')
    executePaperCommands(store, REF(pid), { mutationId: 'r1', operations: [{ command: 'paper.retire-claim', payload: { resultId: 'res-1', claimId: retireTarget.id, reason: '证据不支持' } }] })
    const after = store.snapshotOf(pid).snapshot.paper.results[0]
    const retired = after.claims.find((c) => c.id === retireTarget.id)
    assert.equal(retired.status, 'retired')
    assert.equal(retired.retiredReason, '证据不支持')
    assert.equal(after.confirmed, false, '语义修改使确认失效')
  })

  test('L2 回归：dropped Result 被派单闸门拒绝', () => {
    const pid = seedProject()
    const coreAtConfirm = store.snapshotOf(pid).snapshot.paper.core
    executePaperCommands(store, REF(pid), { mutationId: 'cc', operations: [{ command: 'paper.confirm-revision', payload: { objectId: 'core', expectedObjectRevision: coreAtConfirm.revision, expectedHash: contentHashOf(coreAtConfirm) } }] })
    executePaperCommands(store, REF(pid), { mutationId: 'drop', operations: [{ command: 'paper.update-result', payload: { resultId: 'res-1', status: 'dropped' } }] })
    const snap = store.snapshotOf(pid).snapshot
    assert.throws(() => assertDispatchGate(snap, ['res-1']), /已排除出正文/)
  })

  test('L1 回归：无 claim 的核心不能通过派单闸门', () => {
    const pid = seedProject()
    executePaperCommands(store, REF(pid), { mutationId: 'core1', operations: [{ command: 'paper.propose-core', payload: { title: 'T2', claim: '' } }] })
    const snap = store.snapshotOf(pid).snapshot
    assert.equal(snap.paper.core.claim, '', '核心 claim 已清空')
    assert.throws(() => assertDispatchGate(snap, ['res-1']), /核心尚未建立/)
  })
})
