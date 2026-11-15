// dsh-science T0.5 spike 测试：
// 1) sci-paper-confirm Action Card handler（服务端重解析 scope + 对象 CAS + decision 回执）
// 2) 未知 session event 负向兼容（禁止依赖自定义 durable event 的回归护栏）
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-actioncard-spike-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { scienceConfirmKind, registerScienceActionCards, SCIENCE_CONFIRM_ACTION } = await import('../lib/action-cards.js')
const { contentHashOf } = await import('../lib/project-domain.js')

let store = null

function resetHome() {
  if (store) { try { store.close() } catch { /* ignore */ } store = null }
  rmSync(join(home, 'dsh-science'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  mkdirSync(join(home, 'dsh-science'), { recursive: true })
  store = ProjectStore.open(home)
}

function sessionOf(id, parentSession = null) {
  return { id, header: { version: 1, id, createdAt: 1, parentSession, isSeeded: false } }
}

function fakeHostCtx({ sessions = {}, actionCards } = {}) {
  return {
    get(name) {
      if (name === 'sessions') return { get: (id) => sessions[id] }
      if (name === 'actionCards') return actionCards
      throw new Error(`cannot get property without inject: ${name}`)
    },
    effect(fn) { return fn() },
    on() { return () => {} },
  }
}

function fakeAgent(ctx, sessionId) {
  return { ctx, session: { id: sessionId } }
}

const PROPOSAL = (over = {}) => ({
  callId: 'call-1',
  turn: 3,
  action: SCIENCE_CONFIRM_ACTION,
  title: '确认研究主张',
  brief: '确认后才能派发执行任务',
  details: {
    projectId: 'PROJ',
    objectId: 'res-1',
    objectRevision: 1,
    projectRevision: 0,
    expectedHash: 'hash-12345678',
    title: 'R1',
    summary: '',
    ...over,
  },
})

// T4：从当前快照构造一张“用户实际看到的版本”卡片（对象 revision + 内容哈希 + 项目 revision）。
function proposalFor(pid, over = {}) {
  const snap = store.snapshotOf(pid).snapshot
  const objectId = over.objectId || 'res-1'
  const object = objectId === 'core' ? snap.paper.core : snap.paper.results.find((r) => r && r.id === objectId)
  return PROPOSAL({
    projectId: pid,
    objectId,
    objectRevision: object.revision,
    projectRevision: snap.revision,
    expectedHash: contentHashOf(object),
    ...over,
  })
}

describe('T0.5 sci-paper-confirm Action Card', () => {
  beforeEach(() => { resetHome() })

  function setup({ sessions, decisions = [] } = {}) {
    const actionCards = {
      registered: [],
      decisions,
      register(kind) { this.registered.push(kind); return () => {} },
      record(agent, decision) { this.decisions.push(decision) },
    }
    const ctx = fakeHostCtx({ sessions, actionCards })
    const dispose = registerScienceActionCards(ctx, { store })
    return { actionCards, ctx, dispose, kind: actionCards.registered[0] }
  }

  test('kind 注册：action/skill/verbs/details 齐备，hash/projectRevision 必填', () => {
    const { kind, dispose } = setup({ sessions: {} })
    assert.equal(kind.action, SCIENCE_CONFIRM_ACTION)
    assert.equal(kind.skill, 'sci-hypothesis')
    assert.deepEqual(Object.keys(kind.verbs), ['confirm', 'reject'])
    const parsed = kind.details.parse(PROPOSAL().details)
    assert.equal(parsed.objectId, 'res-1')
    assert.equal(parsed.expectedHash, 'hash-12345678')
    assert.throws(() => kind.details.parse({ ...PROPOSAL().details, expectedHash: undefined }), /expectedHash/i, 'T4：缺内容哈希不得提案')
    assert.throws(() => kind.details.parse({ ...PROPOSAL().details, projectRevision: undefined }), /projectRevision/i, 'T4：缺项目 revision 不得提案')
    dispose()
  })

  test('confirm：服务端 CAS 通过 → settled + confirmed 回执落快照', async () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    store.execute(pid, { mutationId: 'm1', command: 'p', payload: {}, actor: {} }, (c) => {
      c.paper.results.push({ id: 'res-1', title: 'R1', revision: 1, confirmed: false, claim: 'x' })
      return { snapshot: c, changedKeys: ['paper.results'] }
    })
    const { kind, actionCards, ctx } = setup({ sessions: { s1: sessionOf('s1') } })
    const agent = fakeAgent(ctx, 's1')
    const r = await kind.act(agent, proposalFor(pid), 'confirm', undefined)
    assert.equal(r.status, 'settled')
    assert.equal(r.decision.phase, 'confirmed')
    assert.equal(r.decision.data.objectId, 'res-1')
    assert.ok(r.decision.data.expectedHash)
    assert.equal(actionCards.decisions.length, 1)
    const snap = store.snapshotOf(pid)
    assert.equal(snap.snapshot.paper.results[0].confirmed, true)
    assert.equal(snap.snapshot.paper.results[0].confirmation.source, 'action-card')
  })

  test('confirm：同一 callId 重放 → already-applied 仍 settled（幂等，不重复 decision/审计）', async () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    store.execute(pid, { mutationId: 'm1', command: 'p', payload: {}, actor: {} }, (c) => {
      c.paper.results.push({ id: 'res-1', title: 'R1', revision: 1, confirmed: false })
      return { snapshot: c, changedKeys: [] }
    })
    const proposal = proposalFor(pid)
    const { kind, actionCards, ctx } = setup({ sessions: { s1: sessionOf('s1') } })
    const agent = fakeAgent(ctx, 's1')
    const first = await kind.act(agent, proposal, 'confirm', undefined)
    assert.equal(first.status, 'settled')
    const again = await kind.act(agent, proposal, 'confirm', undefined)
    assert.equal(again.status, 'settled')
    assert.equal(again.decision.phase, 'confirmed')
    assert.equal(actionCards.decisions.length, 1, '重放不重复追加 decision')
    const audits = store.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE mutation_id = 'card-call-1'").get().n
    assert.equal(audits, 1, '重放不重复审计回执')
  })

  test('无关对象变化不使卡片失效；目标对象变化 → refused 且不落确认', async () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    store.execute(pid, { mutationId: 'm1', command: 'p', payload: {}, actor: {} }, (c) => {
      c.paper.results.push({ id: 'res-1', title: 'R1', revision: 1, confirmed: false, claim: 'x' })
      c.paper.results.push({ id: 'res-2', title: 'R2', revision: 1, confirmed: false, claim: 'y' })
      return { snapshot: c, changedKeys: ['paper.results'] }
    })
    const proposal = proposalFor(pid, { objectId: 'res-1' })
    // 无关对象更新：项目 revision 前进，但目标 res-1 revision/hash 未变
    store.execute(pid, { mutationId: 'm2', command: 'p', payload: {}, actor: {} }, (c) => {
      c.paper.results[1].claim = 'y2'
      c.paper.results[1].revision = 2
      return { snapshot: c, changedKeys: ['paper.results'] }
    })
    const { kind, ctx } = setup({ sessions: { s1: sessionOf('s1') } })
    const agent = fakeAgent(ctx, 's1')
    const settled = await kind.act(agent, proposal, 'confirm', undefined)
    assert.equal(settled.status, 'settled', `无关对象变化应允许：${settled.reason || ''}`)
    assert.equal(store.snapshotOf(pid).snapshot.paper.results[0].confirmed, true)

    // 目标对象变化：新卡绑定旧 revision/hash → refused，且不改变对象确认状态
    const pid2 = store.createProject({ rootSessionId: 's2' })
    store.execute(pid2, { mutationId: 'p1', command: 'p', payload: {}, actor: {} }, (c) => {
      c.paper.results.push({ id: 'res-1', title: 'R1', revision: 1, confirmed: false, claim: 'v1' })
      return { snapshot: c, changedKeys: [] }
    })
    const staleProposal = proposalFor(pid2, { objectId: 'res-1' })
    store.execute(pid2, { mutationId: 'p2', command: 'p', payload: {}, actor: {} }, (c) => {
      c.paper.results[0].claim = 'v2'
      c.paper.results[0].revision = 2
      return { snapshot: c, changedKeys: [] }
    })
    const { kind: kind2, ctx: ctx2 } = setup({ sessions: { s2: sessionOf('s2') } })
    const refused = await kind2.act(fakeAgent(ctx2, 's2'), staleProposal, 'confirm', undefined)
    assert.equal(refused.status, 'refused')
    assert.match(refused.reason, /变化|修改|失效/)
    assert.equal(store.snapshotOf(pid2).snapshot.paper.results[0].confirmed, false, '旧卡不得确认新内容')
  })

  test('卡片 projectId 与当前会话绑定不一致：refused（不接受卡片自报 scope）', async () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    const pidOther = store.createProject({ rootSessionId: 's2' })
    const { kind, ctx } = setup({ sessions: { s1: sessionOf('s1') } })
    const r = await kind.act(fakeAgent(ctx, 's1'), PROPOSAL({ projectId: pidOther }), 'confirm', undefined)
    assert.equal(r.status, 'refused')
    assert.match(r.reason, /不一致/)
    assert.equal(store.snapshotOf(pid).snapshot.paper.results.length, 0)
  })

  test('队友会话：refused（无论文写权）', async () => {
    mkdirSync(join(home, 'dsh-science'), { recursive: true })
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(home, 'dsh-science', 'team.json'), JSON.stringify({ members: [{ name: 'scout', role: 'x', childId: 'mem', parentSessionId: 'cap' }], tasks: [] }), 'utf8')
    const pid = store.createProject({ rootSessionId: 'cap' })
    store.execute(pid, { mutationId: 'm1', command: 'p', payload: {}, actor: {} }, (c) => {
      c.paper.results.push({ id: 'res-1', title: 'R1', revision: 1, confirmed: false })
      return { snapshot: c, changedKeys: [] }
    })
    const { kind, ctx } = setup({ sessions: { mem: sessionOf('mem') } })
    const r = await kind.act(fakeAgent(ctx, 'mem'), PROPOSAL({ projectId: pid }), 'confirm', undefined)
    assert.equal(r.status, 'refused')
    assert.match(r.reason, /权限/)
  })

  test('reject：settled + rejected decision，记录 hash/projectRevision 且不修改论文语义', async () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    store.execute(pid, { mutationId: 'm1', command: 'p', payload: {}, actor: {} }, (c) => {
      c.paper.results.push({ id: 'res-1', title: 'R1', revision: 1, confirmed: false, claim: 'x' })
      return { snapshot: c, changedKeys: [] }
    })
    const proposal = proposalFor(pid)
    const before = store.snapshotOf(pid)
    const { kind, actionCards, ctx } = setup({ sessions: { s1: sessionOf('s1') } })
    const r = await kind.act(fakeAgent(ctx, 's1'), proposal, 'reject', undefined)
    assert.equal(r.status, 'settled')
    assert.equal(r.decision.phase, 'rejected')
    assert.equal(r.decision.data.objectId, 'res-1')
    assert.equal(r.decision.data.expectedHash, proposal.details.expectedHash)
    assert.equal(r.decision.data.projectRevision, proposal.details.projectRevision)
    assert.equal(r.decision.data.nextAction, 'discuss-in-conversation')
    assert.equal(actionCards.decisions[0].data.objectId, 'res-1')
    const after = store.snapshotOf(pid)
    assert.equal(after.revision, before.revision, 'reject 不推进项目 revision')
    assert.equal(after.snapshot.paper.results[0].confirmed, false, 'reject 不修改论文语义')
  })

  test('actionCards 服务缺失：注册跳过且不抛错（headless 档案降级）', () => {
    const ctx = fakeHostCtx({ sessions: {} })
    ctx.get = (name) => { if (name === 'sessions') return { get: () => undefined }; throw new Error('no inject') }
    const dispose = registerScienceActionCards(ctx, { store })
    assert.equal(dispose, null)
  })
})

// =============================================================================
describe('T0.5 未知 session event 负向兼容（不得依赖自定义 durable event）', () => {
  // dsh-session-persistence 不是本插件依赖：从本地 DSH 安装（test-env）加载，
  // 找不到时跳过（负向护栏仍由 lib 静态扫描测试兜底）。
  async function loadPersistence() {
    const candidates = [
      '@deepseek-ai/dsh-session-persistence',
      new URL('../../../test-env/node_modules/@deepseek-ai/dsh-session-persistence/lib/index.js', import.meta.url).href,
    ]
    for (const spec of candidates) {
      try { return await import(spec) } catch { /* next */ }
    }
    return null
  }

  test('未知非 ignorable 事件被持久化校验拒绝（SessionFormatUnsupportedError）', async (t) => {
    const persistence = await loadPersistence()
    if (!persistence) { t.skip('本地无 dsh-session-persistence（跳过运行时负向探针）'); return }
    const { validateStoredEvents, SessionFormatUnsupportedError } = persistence
    const meta = { id: 'neg-probe', version: 1, createdAt: 1, cwd: process.cwd(), isSeeded: false }
    const events = [{ seq: 0, type: 'plugin:dsh-science/turn-card', data: { x: 1 }, ts: 1 }]
    assert.throws(() => validateStoredEvents(meta, events), SessionFormatUnsupportedError,
      '自定义 plugin:* 事件必须被拒绝——本项目不得依赖该路径')
  })

  test('ignorable 标记的未知事件可携带但被未知读取方跳过（仅官方 experimental 合同）', async (t) => {
    const persistence = await loadPersistence()
    if (!persistence) { t.skip('本地无 dsh-session-persistence'); return }
    const { validateStoredEvents } = persistence
    const meta = { id: 'neg-probe-2', version: 1, createdAt: 1, cwd: process.cwd(), isSeeded: false }
    const events = [{ seq: 0, type: 'plugin:dsh-science/turn-card', data: { x: 1 }, ts: 1, ignorable: true }]
    const out = validateStoredEvents(meta, events)
    assert.equal(out[0].ignorable, true)
  })

  test('本插件 lib 不引用 appendPluginRecord / session.append 自定义事件（静态护栏）', async () => {
    const { readdirSync, readFileSync } = await import('node:fs')
    const libDir = join(home, '..', '..', '..', '..', 'plugin', 'dsh-science', 'lib')
    // 直接扫描插件目录（相对测试文件定位，避免依赖 cwd）
    const { fileURLToPath } = await import('node:url')
    const libReal = join(fileURLToPath(new URL('../lib/', import.meta.url)))
    const files = readdirSync(libReal).filter((f) => f.endsWith('.js'))
    const offenders = []
    for (const f of files) {
      const text = readFileSync(join(libReal, f), 'utf8')
      if (/appendPluginRecord\s*\(/.test(text)) offenders.push(`${f}: appendPluginRecord`)
      if (/\.append\(\s*['"]plugin:dsh-science/.test(text)) offenders.push(`${f}: custom session event`)
    }
    assert.deepEqual(offenders, [], '禁止把未支持的自定义事件接口放进关键路径')
  })
})
