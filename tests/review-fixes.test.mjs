// 五路轻量独立复核（2026-11-15）修复回归：
// 阻断-1 M1 claim 同步不覆盖用户子主张 / 重要-1 negative-notes 可绕过 /
// 重要-2 link-artifact 重复命令与索引不同步 / 重要-3 review 陈旧修订误挂 /
// 重要-4 action card confirm 未声明 writes / 重要-5 附挂会话越权改任务板 /
// 重要-6 证据方向不参与就绪判定
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-review-fixes-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { executePaperCommands, COMMANDS, contentHashOf } = await import('../lib/project-domain.js')
const { reviewCoverageOf } = await import('../lib/reviewcov.js')
const { paperSpineViewOf } = await import('../lib/paperspine.js')
const { blueprintViewOf } = await import('../lib/project-adapter.js')

let store = null

function resetHome() {
  if (store) { try { store.close() } catch { /* ignore */ } store = null }
  rmSync(join(home, 'dsh-science'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  mkdirSync(join(home, 'dsh-science'), { recursive: true })
  store = ProjectStore.open(home)
}

function setup(claim = '初始主张') {
  const pid = store.createProject({ rootSessionId: 'root-a', title: '测试课题' })
  const ref = { projectId: pid, rootSessionId: 'root-a', currentSessionId: 'root-a', relationship: 'root', capabilities: { read: true, propose: true, writePaper: true, dispatch: true } }
  executePaperCommands(store, ref, { mutationId: 'seed', operations: [{ command: 'paper.propose-result', payload: { claim } }] })
  return { pid, ref }
}
const snapOf = (pid) => store.snapshotOf(pid).snapshot

describe('复核修复：领域语义', () => {
  beforeEach(() => resetHome())

  test('阻断-1：主 claim 退休后，update-result 不覆盖用户手写子主张', () => {
    const { pid, ref } = setup('镜像主主张')
    let snap = snapOf(pid)
    const resId = snap.paper.results[0].id
    // propose-result 自带一条镜像 claim（res-N-claim-1）
    const mirrorId = snap.paper.results[0].claims[0].id
    assert.equal(snap.paper.results[0].claims[0].text, '镜像主主张')
    // 退休镜像后，用户手写一条独立子主张（与主主张文本不同）
    executePaperCommands(store, ref, { mutationId: 'c2', operations: [{ command: 'paper.retire-claim', payload: { resultId: resId, claimId: mirrorId } }] })
    executePaperCommands(store, ref, { mutationId: 'c3', operations: [{ command: 'paper.record-claim', payload: { resultId: resId, text: '用户手写子主张' } }] })
    // 只改 status，同时把主 claim 原样回传 —— 旧实现会在此把子主张改写成陈旧主主张
    executePaperCommands(store, ref, { mutationId: 'c4', operations: [{ command: 'paper.update-result', payload: { resultId: resId, claim: '镜像主主张', status: 'in_progress' } }] })
    snap = snapOf(pid)
    const active = snap.paper.results[0].claims.filter((c) => c.status !== 'retired')
    assert.equal(active.length, 1)
    assert.equal(active[0].text, '用户手写子主张', '用户手写子主张不得被陈旧主主张覆盖')
  })

  test('阻断-1 补充：镜像 claim 随主主张变化同步，且旧文本进入 history', () => {
    const { pid, ref } = setup('第一版')
    let snap = snapOf(pid)
    const resId = snap.paper.results[0].id
    executePaperCommands(store, ref, { mutationId: 'c1', operations: [{ command: 'paper.record-claim', payload: { resultId: resId, text: '第一版' } }] })
    executePaperCommands(store, ref, { mutationId: 'c2', operations: [{ command: 'paper.update-result', payload: { resultId: resId, claim: '第二版' } }] })
    snap = snapOf(pid)
    const primary = snap.paper.results[0].claims[0]
    assert.equal(primary.text, '第二版', '镜像 claim 应跟随主主张')
    assert.equal(primary.revision, 2)
    assert.equal(primary.history[0].text, '第一版', '旧文本必须留痕')
  })

  test('重要-1：已是 negative 的结果，后续 update 不能清空 notes', () => {
    const { pid, ref } = setup()
    const resId = snapOf(pid).paper.results[0].id
    executePaperCommands(store, ref, { mutationId: 'n1', operations: [{ command: 'paper.update-result', payload: { resultId: resId, status: 'negative', notes: '该结果证伪核心的 sub-claim' } }] })
    const out = executePaperCommands(store, ref, { mutationId: 'n2', operations: [{ command: 'paper.update-result', payload: { resultId: resId, notes: '' } }] })
    assert.equal(out.kind, 'invalid', '清空 negative 说明必须被领域层拒绝')
    assert.match(out.reason, /notes/)
    assert.equal(snapOf(pid).paper.results[0].notes, '该结果证伪核心的 sub-claim', '拒绝时不得产生副作用')
  })

  test('重要-2：COMMANDS 无重复项；link-artifact 只等于一个实现且同步索引', () => {
    assert.equal(new Set(COMMANDS).size, COMMANDS.length, '命令表不得有重复项')
    const { pid, ref } = setup()
    const resId = snapOf(pid).paper.results[0].id
    executePaperCommands(store, ref, { mutationId: 'a1', operations: [{ command: 'paper.register-artifact', payload: { kind: 'data', source: 'user-file', versionToken: 'v1', summary: '数据', pathRef: { path: 'data/x.csv' } } }] })
    const artId = snapOf(pid).artifactIndex.items[0].id
    executePaperCommands(store, ref, { mutationId: 'a2', operations: [{ command: 'paper.link-artifact', payload: { resultId: resId, artifactId: artId } }] })
    let snap = snapOf(pid)
    assert.deepEqual(snap.artifactIndex.items[0].resultIds, [resId], '索引必须记录结果关联')
    assert.ok(snap.paper.results[0].figures.includes(artId))
    executePaperCommands(store, ref, { mutationId: 'a3', operations: [{ command: 'paper.unlink-artifact', payload: { artifactId: artId } }] })
    snap = snapOf(pid)
    assert.deepEqual(snap.artifactIndex.items[0].resultIds, [], '解除关联必须同步清理索引')
    assert.equal(snap.paper.results[0].figures.includes(artId), false)
  })

  test('重要-3：claim 修订前进后，旧修订审查不得挂到当前对象', () => {
    const bp = {
      core: { claim: '核心主张', revision: 1, confirmed: true },
      results: [{ id: 'res-1', claim: '结果主张 v2', revision: 2, confirmed: true, claims: [] }],
    }
    const reviews = { r1: { id: 'r1', sessionId: 'session-x', findings: [{ check: 'blueprint-claim', claim: 'res-1@r1', severity: 'pass', message: '旧修订通过' }] } }
    const cov = reviewCoverageOf(bp, reviews, 'session-x')
    assert.equal(cov.results[0].severity, null, '过期修订的审查结论不得落到当前修订')
    // 当前修订的审查仍然生效
    const fresh = { r2: { id: 'r2', sessionId: 'session-x', findings: [{ check: 'blueprint-claim', claim: 'res-1@r2', severity: 'pass', message: '现行通过' }] } }
    assert.equal(reviewCoverageOf(bp, fresh, 'session-x').results[0].severity, 'pass')
  })

  test('重要-6：只有反向证据时 scientific 不就绪', () => {
    const { pid, ref } = setup()
    const snap0 = snapOf(pid)
    const resId = snap0.paper.results[0].id
    const claimId = snap0.paper.results[0].claims[0].id
    const out = executePaperCommands(store, ref, {
      mutationId: 'e1',
      operations: [{ command: 'paper.record-evidence', payload: { resultId: resId, claimIds: [claimId], direction: 'contradicts', state: 'verified', sourceLocator: 'Fig 1', allowedInterpretation: '反向证据' } }],
    })
    assert.equal(out.kind, 'applied', `记录反向证据应成功：${out.reason || ''}`)
    const snap = snapOf(pid)
    // 用与生产一致的适配层把快照转成 blueprint 形状，再算论文骨架视图。
    const bp = blueprintViewOf(snap)
    const view = paperSpineViewOf(bp, { members: [], tasks: [] }, { figures: [] }, null)
    const item = (view.results || []).find((r) => r.id === resId)
    assert.ok(item, '结果必须出现在论文骨架视图里')
    const scientific = item.readiness.scientific
    assert.notEqual(scientific.state, 'ready', '仅有反向证据不得判为科学就绪')
    assert.match(scientific.blockers.join('；'), /不支撑该主张/)
  })
})
