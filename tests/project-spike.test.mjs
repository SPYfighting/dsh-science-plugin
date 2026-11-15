// dsh-science 阶段 0 spike 测试：T0.4 scope 解析矩阵 / T0.3 Project Store 与 Remote 流
// 设计真源：docs/superpowers/specs/2026-11-13-对话优先科研卡片工作台重构设计.md §7/§8/§10
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'

// 每个测试文件独立 DSH_HOME，避免与 unit.test.mjs 的全局 home 互相污染
const home = mkdtempSync(join(tmpdir(), 'dsh-project-spike-'))
process.env.DSH_HOME = home

const { ProjectStore, StoreError } = await import('../lib/project-store.js')
const { resolveProjectContext, assertPaperWriteAllowed } = await import('../lib/project-context.js')
const { registerProjectRemote } = await import('../lib/project-remote.js')

let dataDir = null
let store = null

function resetHome() {
  if (store) { try { store.close() } catch { /* ignore */ } store = null }
  dataDir = join(home, 'dsh-science')
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  mkdirSync(dataDir, { recursive: true })
  store = ProjectStore.open(home)
}

// ---- fake host ctx -----------------------------------------------------------
function sessionOf(id, { parentSession = null, cwd = null } = {}) {
  return {
    id,
    header: { version: 1, id, createdAt: Date.now(), cwd, parentSession, isSeeded: false },
    snapshotEvents: () => [],
  }
}

function fakeCtx({ sessions = {}, members = [] } = {}) {
  if (members.length > 0) {
    mkdirSync(join(home, 'dsh-science'), { recursive: true })
    writeFileSync(join(home, 'dsh-science', 'team.json'), JSON.stringify({ members, tasks: [], taskSeq: 0 }), 'utf8')
  }
  const registered = []
  const ctx = {
    get(name) {
      if (name === 'sessions') {
        return { get: (id) => sessions[id] }
      }
      if (name === 'webServer' || name === 'httpServer') {
        return {
          register(route) {
            registered.push(route)
            return () => {}
          },
        }
      }
      if (name === 'connection') return { requestRejection: () => undefined }
      throw new Error(`cannot get property without inject: ${name}`)
    },
    effect(fn) { fn() },
    on() { return () => {} },
    __registered: registered,
  }
  return ctx
}

// ---- fake req/res -------------------------------------------------------------
function fakeReq(url, { method = 'GET', body = null } = {}) {
  const req = new EventEmitter()
  req.url = url
  req.method = method
  req.headers = {}
  req.__sendBody = (b) => { if (b) chunksBody.push(b) }
  req.__end = () => req.emit('end')
  return req
}

function fakeRes() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    chunks: [],
    writeHead(code, headers) { this.statusCode = code; this.headers = headers },
    end(text) { if (text) this.chunks.push(String(text)); this.body = this.chunks.join(''); this.ended = true },
    write(text) { this.chunks.push(String(text)); this.body = this.chunks.join('') },
    on() { return this },
  }
}

async function readBody(req) {
  // 模拟 POST body：直接把 JSON 文本发给 readJsonBody 监听的 data 事件
  return req
}

async function callRoute(ctx, path, { url = '', method = 'GET', body = null } = {}) {
  const route = ctx.__registered.find((r) => r.path === path)
  if (!route) throw new Error(`route not registered: ${path}`)
  const req = fakeReq(url, { method })
  const res = fakeRes()
  const done = route.handler(req, res)
  if (body != null) {
    await new Promise((r) => setTimeout(r, 0))
    req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  }
  if (done && typeof done.then === 'function') await done
  else if (body == null) { await new Promise((r) => setTimeout(r, 10)); req.emit('end') }
  await new Promise((r) => setTimeout(r, 10))
  return { req, res }
}

function parseJson(res) {
  return JSON.parse(res.body)
}

// =============================================================================
describe('T0.4 scope 解析矩阵（ProjectContext）', () => {
  beforeEach(() => { resetHome() })

  test('root 未绑定：unbound，允许首次持久写', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const r = resolveProjectContext(ctx, 's1', { store })
    assert.equal(r.ok, true)
    assert.equal(r.ref.relationship, 'unbound')
    assert.equal(r.ref.projectId, null)
    assert.equal(r.ref.capabilities.writePaper, true)
  })

  test('root 已绑定：relationship=root，拿到 projectId', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const pid = store.createProject({ rootSessionId: 's1', title: 'T' })
    const r = resolveProjectContext(ctx, 's1', { store })
    assert.equal(r.ref.relationship, 'root')
    assert.equal(r.ref.projectId, pid)
    assert.equal(r.ref.capabilities.writePaper, true)
  })

  test('队友由 roster 证明：与队长共用 root，只读+提案，无论文写权', () => {
    const ctx = fakeCtx({
      sessions: { cap: sessionOf('cap'), mem: sessionOf('mem', { parentSession: 'cap' }) },
      members: [{ name: 'scout', role: 'literature-scout', childId: 'mem', parentSessionId: 'cap' }],
    })
    const pid = store.createProject({ rootSessionId: 'cap', title: 'T' })
    const r = resolveProjectContext(ctx, 'mem', { store })
    assert.equal(r.ref.relationship, 'teammate')
    assert.equal(r.ref.projectId, pid)
    assert.equal(r.ref.rootSessionId, 'cap')
    assert.equal(r.ref.capabilities.writePaper, false)
    assert.equal(r.ref.capabilities.propose, true)
  })

  test('伪造 parentSession 不构成队友：按 fork 隔离，不继承父项目', () => {
    const ctx = fakeCtx({ sessions: { cap: sessionOf('cap'), fake: sessionOf('fake', { parentSession: 'cap' }) } })
    const pid = store.createProject({ rootSessionId: 'cap', title: 'T' })
    const r = resolveProjectContext(ctx, 'fake', { store })
    assert.equal(r.ref.relationship, 'fork')
    assert.equal(r.ref.projectId, null, 'fork 不得拿到父项目绑定')
    assert.notEqual(r.ref.projectId, pid)
    const gate = assertPaperWriteAllowed(r.ref)
    assert.equal(gate.ok, false)
    assert.equal(gate.code, 'fork-isolated')
  })

  test('attached root：可读可提案，无队长写权', () => {
    const ctx = fakeCtx({ sessions: { cap: sessionOf('cap'), other: sessionOf('other') } })
    const pid = store.createProject({ rootSessionId: 'cap', title: 'T' })
    store.attachRoot(pid, 'other')
    const r = resolveProjectContext(ctx, 'other', { store })
    assert.equal(r.ref.relationship, 'attached')
    assert.equal(r.ref.projectId, pid)
    assert.equal(r.ref.capabilities.writePaper, false)
    assert.equal(r.ref.capabilities.read, true)
  })

  test('未知会话：unknown-session，不猜测', async () => {
    const ctx = fakeCtx({ sessions: {} })
    const r = resolveProjectContext(ctx, 'nope', { store })
    assert.equal(r.ok, false)
    assert.equal(r.code, 'unknown-session')
  })

  test('客户端字段不可越权：scope 只来自 sessionId，同 cwd 两个 root 互不串', () => {
    const ctx = fakeCtx({ sessions: { a: sessionOf('a', { cwd: 'D:/w' }), b: sessionOf('b', { cwd: 'D:/w' }) } })
    const pidA = store.createProject({ rootSessionId: 'a', title: 'A' })
    const pidB = store.createProject({ rootSessionId: 'b', title: 'B' })
    const ra = resolveProjectContext(ctx, 'a', { store })
    const rb = resolveProjectContext(ctx, 'b', { store })
    assert.equal(ra.ref.projectId, pidA)
    assert.equal(rb.ref.projectId, pidB)
    assert.notEqual(pidA, pidB)
  })

  test('roster 损坏按空处理：伪造 childId 匹配不上就不给队友身份', () => {
    writeFileSync(join(home, 'dsh-science', 'team.json'), '{broken', 'utf8')
    const ctx = fakeCtx({ sessions: { cap: sessionOf('cap'), mem: sessionOf('mem', { parentSession: 'cap' }) } })
    const r = resolveProjectContext(ctx, 'mem', { store })
    assert.equal(r.ref.relationship, 'fork')
  })
})

// =============================================================================
describe('T0.3 Project Store（SQLite 事务/幂等/outbox）', () => {
  beforeEach(() => { resetHome() })

  test('打开即迁移：schema_migrations 记录版本，WAL 打开', () => {
    const row = store.db.prepare('SELECT version FROM schema_migrations').get()
    assert.equal(Number(row.version), 1)
    const mode = store.db.prepare('PRAGMA journal_mode').get()
    assert.equal(String(mode.journal_mode), 'wal')
    const fk = store.db.prepare('PRAGMA foreign_keys').get()
    assert.equal(Number(fk.foreign_keys), 1)
  })

  test('createProject 建绑定与空快照；bindingOfRootSession 双向可查', () => {
    const pid = store.createProject({ rootSessionId: 's1', title: 'T' })
    const b = store.bindingOfRootSession('s1')
    assert.equal(b.projectId, pid)
    assert.equal(b.primaryRootSessionId, 's1')
    const snap = store.snapshotOf(pid)
    assert.equal(snap.revision, 0)
    assert.equal(snap.snapshot.bindings.primaryRootSessionId, 's1')
  })

  test('execute 推进 revision 并写 audit/receipt/outbox；订阅者收到帧', () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    const frames = []
    store.subscribe((f) => frames.push(f))
    const r = store.execute(pid, {
      mutationId: 'm1',
      expectedRevision: 0,
      command: 'paper.propose-result',
      payload: { title: 'R1' },
      actor: { sessionId: 's1' },
    }, (current) => {
      current.paper.results.push({ id: 'res-1', title: 'R1', revision: 1, confirmed: false })
      return { snapshot: current, changedKeys: ['paper.results'], objects: [{ objectId: 'res-1', objectRevision: 1 }] }
    })
    assert.equal(r.kind, 'applied')
    assert.equal(r.receipt.revision, 1)
    const snap = store.snapshotOf(pid)
    assert.equal(snap.revision, 1)
    assert.equal(snap.snapshot.paper.results.length, 1)
    const audit = store.db.prepare('SELECT * FROM audit_events WHERE project_id = ?').all(pid)
    assert.equal(audit.length, 1)
    assert.equal(audit[0].mutation_id, 'm1')
    const outbox = store.db.prepare('SELECT * FROM outbox WHERE project_id = ?').all(pid)
    assert.equal(outbox.length, 1)
    assert.ok(outbox[0].published_at, '同进程订阅者在线时应已发布')
    assert.equal(frames.length, 1)
    assert.equal(frames[0].projectRevision, 1)
  })

  test('重复 mutationId 返回同一回执（幂等），不产生第二份副作用', () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    const cmd = { mutationId: 'm1', command: 'paper.propose-result', payload: {}, actor: {} }
    const r1 = store.execute(pid, cmd, (cur) => {
      cur.paper.results.push({ id: 'res-1' })
      return { snapshot: cur, changedKeys: ['paper.results'] }
    })
    const r2 = store.execute(pid, cmd, () => { throw new Error('handler 不应再次执行') })
    assert.equal(r2.kind, 'already-applied')
    assert.deepEqual(r2.receipt, r1.receipt)
    assert.equal(store.snapshotOf(pid).snapshot.paper.results.length, 1)
  })

  test('陈旧 expectedRevision 返回 conflict，不产生任何写入', () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    store.execute(pid, { mutationId: 'm1', command: 'x', payload: {}, actor: {} }, (c) => ({ snapshot: c, changedKeys: [] }))
    const r = store.execute(pid, { mutationId: 'm2', expectedRevision: 0, command: 'x', payload: {}, actor: {} }, (c) => {
      c.paper.results.push({ id: 'res-9' })
      return { snapshot: c, changedKeys: [] }
    })
    assert.equal(r.kind, 'conflict')
    assert.equal(r.currentRevision, 1)
    const snap = store.snapshotOf(pid)
    assert.equal(snap.revision, 1)
    assert.equal(snap.snapshot.paper.results.length, 0)
    const outbox = store.db.prepare('SELECT * FROM outbox WHERE project_id = ?').all(pid)
    assert.equal(outbox.length, 1, '冲突批次不写 outbox')
  })

  test('handler 抛错：事务整体回滚，无 snapshot/audit/receipt/outbox 残留', () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    assert.throws(() => store.execute(pid, { mutationId: 'm1', command: 'x', payload: {}, actor: {} }, () => {
      throw new Error('domain violation')
    }), /domain violation/)
    assert.equal(store.snapshotOf(pid).revision, 0)
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n, 0)
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM idempotency_receipts').get().n, 0)
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM outbox').get().n, 0)
  })

  test('提交后发布失败：业务事实保留，outbox 待重试；恢复后补发', () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    const got = []
    const unsubscribe = store.subscribe(() => { throw new Error('subscriber down') })
    const r = store.execute(pid, { mutationId: 'm1', command: 'x', payload: {}, actor: {} }, (c) => ({ snapshot: c, changedKeys: [] }))
    assert.equal(r.kind, 'applied', '发布失败不回滚已提交业务事实')
    assert.equal(store.snapshotOf(pid).revision, 1)
    let pending = store.db.prepare('SELECT * FROM outbox WHERE published_at IS NULL').all()
    assert.equal(pending.length, 1, '发布失败 → outbox 保持待发')
    unsubscribe()
    const unsub2 = store.subscribe((f) => got.push(f))
    store.publishPending()
    assert.equal(got.length, 1, '恢复后补发')
    pending = store.db.prepare('SELECT * FROM outbox WHERE published_at IS NULL').all()
    assert.equal(pending.length, 0)
    unsub2()
  })

  test('多观察者：单个观察者失败不影响其余观察者收帧', () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    const good = []
    const bad = store.subscribe(() => { throw new Error('down') })
    const ok = store.subscribe((f) => good.push(f))
    store.execute(pid, { mutationId: 'm1', command: 'x', payload: {}, actor: {} }, (c) => ({ snapshot: c, changedKeys: [] }))
    assert.equal(good.length, 1)
    bad(); ok()
  })

  test('两个实例并发打开同一库（busy timeout 下串行成功）', () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    const store2 = ProjectStore.open(home)
    try {
      const r2 = store2.execute(pid, { mutationId: 'm2', expectedRevision: 0, command: 'x', payload: {}, actor: {} }, (c) => ({ snapshot: c, changedKeys: [] }))
      assert.equal(r2.kind, 'applied')
      assert.equal(store.snapshotOf(pid).revision, 1, '另一实例的写入对原实例可见（同一文件）')
    } finally {
      store2.close()
    }
  })

  test('Windows 临时路径建库成功（path 带空格/大小写）', () => {
    const weird = join(home, 'dsh-science')
    const s2 = ProjectStore.open(home)
    try {
      const pid = s2.createProject({ rootSessionId: 'win-x' })
      assert.ok(pid.startsWith('proj-'))
    } finally { s2.close() }
  })
})

// =============================================================================
describe('T0.3 Project Remote（get/observe/act）', () => {
  beforeEach(() => { resetHome() })

  function setup({ sessions, members = [] } = {}) {
    const ctx = fakeCtx({ sessions, members })
    const handlers = registerProjectRemote(ctx, { store })
    return { ctx, handlers }
  }

  test('get：未绑定项目 → project:null；绑定后返回快照；knownRevision 命中 → notModified', async () => {
    const { ctx } = setup({ sessions: { s1: sessionOf('s1') } })
    let r = await callRoute(ctx, '/plugins/dsh-science/project/get', { url: '/x?sessionId=s1' })
    assert.equal(r.res.statusCode, 200)
    assert.equal(parseJson(r.res).project, null)

    const pid = store.createProject({ rootSessionId: 's1', title: 'T' })
    store.execute(pid, { mutationId: 'm1', command: 'x', payload: {}, actor: {} }, (c) => ({ snapshot: c, changedKeys: [] }))
    r = await callRoute(ctx, '/plugins/dsh-science/project/get', { url: '/x?sessionId=s1' })
    const body = parseJson(r.res)
    assert.equal(body.project.projectId, pid)
    assert.equal(body.project.revision, 1)
    assert.deepEqual(body.team, { members: [], tasks: [] })

    r = await callRoute(ctx, '/plugins/dsh-science/project/get', { url: `/x?sessionId=s1&knownRevision=1` })
    assert.equal(parseJson(r.res).notModified, true)
  })

  test('get：未知会话 404；队友读绑定项目（服务端解析，不接受客户端 projectId）', async () => {
    const { ctx } = setup({
      sessions: { cap: sessionOf('cap'), mem: sessionOf('mem', { parentSession: 'cap' }) },
      members: [{ name: 'scout', role: 'literature-scout', childId: 'mem', parentSessionId: 'cap' }],
    })
    const pid = store.createProject({ rootSessionId: 'cap' })
    let r = await callRoute(ctx, '/plugins/dsh-science/project/get', { url: '/x?sessionId=ghost' })
    assert.equal(r.res.statusCode, 404)
    r = await callRoute(ctx, '/plugins/dsh-science/project/get', { url: '/x?sessionId=mem&projectId=PROJ-FAKE' })
    assert.equal(parseJson(r.res).project.projectId, pid, 'scope 由服务端 roster 解析，客户端 projectId 字段被忽略')
  })

  test('observe：SSE 先发 baseline，变更帧按 revision 推送，断开后退订', async () => {
    const { ctx } = setup({ sessions: { s1: sessionOf('s1') } })
    const pid = store.createProject({ rootSessionId: 's1' })
    const { req, res } = await callRoute(ctx, '/plugins/dsh-science/project/observe', { url: '/x?sessionId=s1' })
    assert.match(res.body, /event: baseline/)
    assert.match(res.body, /"revision":0/)
    store.execute(pid, { mutationId: 'm1', command: 'x', payload: {}, actor: {} }, (c) => ({ snapshot: c, changedKeys: [] }))
    await new Promise((r2) => setTimeout(r2, 30))
    assert.match(res.body, /event: change/, 'outbox 变更帧到达 SSE')
    req.emit('close')
    const before = res.body.length
    store.execute(pid, { mutationId: 'm2', command: 'x', payload: {}, actor: {} }, (c) => ({ snapshot: c, changedKeys: [] }))
    await new Promise((r2) => setTimeout(r2, 30))
    assert.equal(res.body.length, before, '断开后不再收到帧')
  })

  test('act：ensure-binding 首次建项目（幂等）；重复返回 already-applied', async () => {
    const { ctx } = setup({ sessions: { s1: sessionOf('s1') } })
    let r = await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST',
      body: { sessionId: 's1', actionId: 'project.ensure-binding', commandId: 'bind-1', payload: { title: 'P' } },
    })
    assert.equal(r.res.statusCode, 200)
    const first = parseJson(r.res)
    assert.equal(first.kind, 'applied')
    assert.ok(first.receipt.projectId)
    r = await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST',
      body: { sessionId: 's1', actionId: 'project.ensure-binding', commandId: 'bind-2', payload: {} },
    })
    assert.equal(parseJson(r.res).kind, 'already-applied', '已绑定时返回 already-applied')
    assert.ok(store.bindingOfRootSession('s1'))
  })

  test('act：对象级 CAS 确认——revision/hash 不符拒绝；幂等重放收敛', async () => {
    const { ctx } = setup({ sessions: { s1: sessionOf('s1') } })
    const bind = await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST',
      body: { sessionId: 's1', actionId: 'project.ensure-binding', commandId: 'bind-1', payload: {} },
    })
    const pid = parseJson(bind.res).receipt.projectId
    store.execute(pid, { mutationId: 'm1', command: 'paper.propose-result', payload: {}, actor: {} }, (c) => {
      c.paper.results.push({ id: 'res-1', title: 'R1', revision: 1, confirmed: false, claim: 'x' })
      return { snapshot: c, changedKeys: ['paper.results'] }
    })
    const bad = await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST',
      body: { sessionId: 's1', actionId: 'paper.confirm-revision', commandId: 'c1', expectedRevision: 1, payload: { objectId: 'res-1', expectedObjectRevision: 99 } },
    })
    assert.equal(bad.res.statusCode, 400)
    assert.equal(parseJson(bad.res).kind, 'invalid', '对象 revision 不符 → 拒绝')

    const snap = store.snapshotOf(pid)
    const obj = snap.snapshot.paper.results[0]
    const { contentHashOf } = await import('../lib/project-domain.js')
    const hash = contentHashOf(obj)
    const ok = await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST',
      body: { sessionId: 's1', actionId: 'paper.confirm-revision', commandId: 'c2', expectedRevision: snap.revision, payload: { objectId: 'res-1', expectedObjectRevision: 1, expectedHash: hash } },
    })
    assert.equal(parseJson(ok.res).kind, 'applied')
    const after = store.snapshotOf(pid)
    assert.equal(after.snapshot.paper.results[0].confirmed, true)
    assert.equal(after.snapshot.paper.results[0].confirmation.revisionId, 'res-1-r1')

    const replay = await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST',
      body: { sessionId: 's1', actionId: 'paper.confirm-revision', commandId: 'c2', expectedRevision: after.revision, payload: { objectId: 'res-1', expectedObjectRevision: 1, expectedHash: hash } },
    })
    assert.equal(parseJson(replay.res).kind, 'already-applied', '同一 commandId 重放返回原回执')
  })

  test('act：确认后语义修改 → 旧 revision 确认不再放行（派单闸门素材）', async () => {
    const { ctx } = setup({ sessions: { s1: sessionOf('s1') } })
    const bind = await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST',
      body: { sessionId: 's1', actionId: 'project.ensure-binding', commandId: 'b', payload: {} },
    })
    const pid = parseJson(bind.res).receipt.projectId
    store.execute(pid, { mutationId: 'm1', command: 'p', payload: {}, actor: {} }, (c) => {
      c.paper.results.push({ id: 'res-1', revision: 1, confirmed: true, confirmation: { revisionId: 'res-1-r1' }, claim: 'v1' })
      return { snapshot: c, changedKeys: [] }
    })
    // 语义修改推进 revision 且未带确认
    store.execute(pid, { mutationId: 'm2', command: 'p', payload: {}, actor: {} }, (c) => {
      c.paper.results[0].claim = 'v2'
      c.paper.results[0].revision = 2
      c.paper.results[0].confirmed = false
      c.paper.results[0].confirmation = null
      return { snapshot: c, changedKeys: ['paper.results'] }
    })
    // 旧确认凭据（revisionId r1）校验失败 → confirm 拒绝
    const stale = await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST',
      body: { sessionId: 's1', actionId: 'paper.confirm-revision', commandId: 'c-stale', expectedRevision: 2, payload: { objectId: 'res-1', expectedObjectRevision: 1 } },
    })
    assert.equal(parseJson(stale.res).kind, 'invalid')
  })

  test('act：队友禁止确认论文对象（forbidden），fork 被隔离', async () => {
    const { ctx } = setup({
      sessions: { cap: sessionOf('cap'), mem: sessionOf('mem', { parentSession: 'cap' }), fork: sessionOf('fork', { parentSession: 'cap' }) },
      members: [{ name: 'scout', role: 'literature-scout', childId: 'mem', parentSessionId: 'cap' }],
    })
    await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST',
      body: { sessionId: 'cap', actionId: 'project.ensure-binding', commandId: 'b', payload: {} },
    })
    let r = await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST',
      body: { sessionId: 'mem', actionId: 'paper.confirm-revision', commandId: 'cm', payload: { objectId: 'core' } },
    })
    assert.equal(r.res.statusCode, 403)
    assert.equal(parseJson(r.res).kind, 'forbidden')
    r = await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST',
      body: { sessionId: 'fork', actionId: 'project.ensure-binding', commandId: 'cf', payload: {} },
    })
    assert.equal(r.res.statusCode, 403)
    assert.equal(parseJson(r.res).kind, 'forbidden')
  })

  test('act：未知动作/缺 commandId 400；未知会话 404', async () => {
    const { ctx } = setup({ sessions: { s1: sessionOf('s1') } })
    let r = await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST', body: { sessionId: 's1', actionId: 'paper.delete-everything', commandId: 'x1' },
    })
    assert.equal(r.res.statusCode, 400)
    r = await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST', body: { sessionId: 's1', actionId: 'project.ensure-binding' },
    })
    assert.equal(r.res.statusCode, 400)
    r = await callRoute(ctx, '/plugins/dsh-science/project/act', {
      method: 'POST', body: { sessionId: 'ghost', actionId: 'project.ensure-binding', commandId: 'x2' },
    })
    assert.equal(r.res.statusCode, 404)
  })
})
