// dsh-science 阶段 1 测试：T1.1 schema/迁移边界 / T1.2 首写建项目与权限 /
// T1.3 ProjectCommand 批量、revision、确认失效与派单硬闸门 / T1.4 outbox 消费与清理
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-project-domain-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { resolveProjectContext, ensureProject, assertPaperWriteAllowed } = await import('../lib/project-context.js')
const {
  executePaperCommands, confirmObjectRevision, applyOperation, assertDispatchGate,
  contentHashOf, objectRevisionOf, COMMANDS,
} = await import('../lib/project-domain.js')

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

function fakeCtx({ sessions = {}, members = [] } = {}) {
  if (members.length > 0) {
    mkdirSync(join(home, 'dsh-science'), { recursive: true })
    writeFileSync(join(home, 'dsh-science', 'team.json'), JSON.stringify({ members, tasks: [] }), 'utf8')
  }
  return {
    get(name) {
      if (name === 'sessions') return { get: (id) => sessions[id] }
      throw new Error(`cannot get: ${name}`)
    },
    effect(fn) { return fn() },
    on() { return () => {} },
  }
}

function capRef(pid, sid = 's1') {
  return { projectId: pid, rootSessionId: sid, currentSessionId: sid, relationship: 'root', capabilities: { read: true, propose: true, writePaper: true, dispatch: true } }
}

function seedConfirmedResult(pid, { claim = 'X 增加 Y', confirmed = true } = {}) {
  const r = executePaperCommands(store, capRef(pid), {
    mutationId: `seed-${Math.random().toString(36).slice(2)}`,
    operations: [{ command: 'paper.propose-result', payload: { title: 'R1', claim, purpose: 'p' } }],
  })
  const resultId = r.receipt.objects[0].objectId
  if (confirmed) {
    const snap = store.snapshotOf(pid)
    const obj = snap.snapshot.paper.results.find((x) => x.id === resultId)
    executePaperCommands(store, capRef(pid), {
      mutationId: `seed-confirm-${resultId}`,
      operations: [{ command: 'paper.confirm-revision', payload: { objectId: resultId, expectedObjectRevision: obj.revision, expectedHash: contentHashOf(obj) } }],
    })
  }
  return resultId
}

// =============================================================================
describe('T1.1 schema 与迁移边界', () => {
  beforeEach(() => { resetHome() })

  test('迁移 v1→v2 幂等：重开同一库不重复执行、legacy_imports 就位', () => {
    const pid = store.createProject({ rootSessionId: 'x' })
    store.close()
    const store2 = ProjectStore.open(home)
    try {
      assert.ok(store2.db.prepare("SELECT name FROM sqlite_master WHERE name='legacy_imports'").get())
      const versions = store2.db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => Number(r.version))
      assert.deepEqual(versions, [1, 2, 3, 4], '迁移版本序列完整（v3 = 幂等键按项目作用域；v4 = 工作区授权键）')
      // 旧库数据仍在
      assert.ok(store2.snapshotOf(pid))
      // T3 契约：台账是审计事实，同一 migrationId 只能写一次（普通 INSERT，不覆盖）。
      store2.recordLegacyImport({ migrationId: 'mig-1', projectId: pid, source: 'blueprint.json', sourceHash: 'h1', backupPath: 'b1' })
      assert.throws(
        () => store2.recordLegacyImport({ migrationId: 'mig-1', projectId: pid, source: 'blueprint.json', sourceHash: 'h1', backupPath: 'b2' }),
        /UNIQUE|constraint/i,
      )
      const row = store2.st.getLegacyImport.get('mig-1')
      assert.equal(row.backup_path, 'b1', '审计事实不可被 REPLACE 覆盖')
    } finally { store2.close() }
  })

  test('损坏 DB：打开时明确报错，不静默清空用户数据', () => {
    store.close()
    const dbFile = join(home, 'dsh-science', 'science-state.sqlite')
    writeFileSync(dbFile, Buffer.from('this is not a sqlite database at all'))
    assert.throws(() => ProjectStore.open(home), /file is not a database|not a database/i)
    // 原样保留（未被删除/重建）
    assert.ok(readFileSync(dbFile, 'utf8').includes('not a sqlite database'))
  })

  test('事务中断：进程内异常后库可用，无半提交状态', () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    assert.throws(() => store.runInTransaction(() => {
      store.st.insertProject.run('proj-broken', 1, 'x', 's1', '{}', 1, 1, '', 'legacy-unassigned')
      throw new Error('mid-tx crash')
    }), /mid-tx crash/)
    // 回滚后同一写可成功（连接健康）
    const again = store.runInTransaction(() => store.st.insertProject.run('proj-ok', 1, 't', 's1', '{}', 1, 1, '', 'legacy-unassigned'))
    assert.ok(again.changes >= 0)
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM projects WHERE id='proj-broken'").get().n, 0)
    assert.ok(store.snapshotOf(pid))
  })
})

// =============================================================================
describe('T1.2 首写建项目与权限', () => {
  beforeEach(() => { resetHome() })

  test('unbound root：ensureProject 创建项目 + captain 绑定；重复调用不新建', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const first = ensureProject(ctx, 's1', { store, title: 'T' })
    assert.equal(first.ok, true)
    assert.equal(first.created, true)
    assert.ok(first.ref.projectId)
    const second = ensureProject(ctx, 's1', { store })
    assert.equal(second.created, false)
    assert.equal(second.ref.projectId, first.ref.projectId)
    // 未调用 ensureProject 前不产生项目
  })

  test('普通聊天/查看不建项目：resolveProjectContext 永不创建', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    resolveProjectContext(ctx, 's1', { store })
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM projects').get().n, 0)
  })

  test('队友在队长未绑定时：needs-binding，不猜归属', () => {
    const ctx = fakeCtx({
      sessions: { cap: sessionOf('cap'), mem: sessionOf('mem') },
      members: [{ name: 'scout', role: 'x', childId: 'mem', parentSessionId: 'cap' }],
    })
    const r = ensureProject(ctx, 'mem', { store })
    assert.equal(r.ok, false)
    assert.equal(r.code, 'needs-binding')
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM projects').get().n, 0)
  })

  test('fork：拒绝建项目（写时复制隔离）', () => {
    const ctx = fakeCtx({ sessions: { cap: sessionOf('cap'), f: sessionOf('f', { parentSession: 'cap' }) } })
    const r = ensureProject(ctx, 'f', { store })
    assert.equal(r.ok, false)
    assert.equal(r.code, 'fork-isolated')
  })

  test('executePaperCommands 拒绝未绑定 ref；队长经 ensureProject 后可写', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const scope = resolveProjectContext(ctx, 's1', { store })
    const bad = executePaperCommands(store, scope.ref, { mutationId: 'm1', operations: [{ command: 'paper.propose-core', payload: { claim: 'c' } }] })
    assert.equal(bad.kind, 'invalid')
    const ensured = ensureProject(ctx, 's1', { store })
    const ok = executePaperCommands(store, ensured.ref, { mutationId: 'm2', operations: [{ command: 'paper.propose-core', payload: { claim: '核心主张' } }] })
    assert.equal(ok.kind, 'applied')
    assert.equal(store.snapshotOf(ensured.ref.projectId).snapshot.paper.core.claim, '核心主张')
  })
})

// =============================================================================
describe('T1.3 批量命令、revision 与派单硬闸门', () => {
  beforeEach(() => { resetHome() })

  test('多操作一批：只推进一次 project revision，对象各自 revision', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    const r = executePaperCommands(store, ref, {
      mutationId: 'batch-1',
      operations: [
        { operationId: 'op-1', command: 'paper.propose-core', payload: { title: 'T', claim: 'C' } },
        { operationId: 'op-2', command: 'paper.propose-result', payload: { title: 'R1', claim: 'x' } },
        { operationId: 'op-3', command: 'paper.propose-result', payload: { title: 'R2', claim: 'y' } },
      ],
    })
    assert.equal(r.kind, 'applied')
    assert.equal(r.receipt.revision, 1, '一批只 +1 revision')
    assert.equal(r.receipt.objects.length, 3)
    const snap = store.snapshotOf(ref.projectId)
    assert.equal(snap.revision, 1)
    assert.equal(snap.snapshot.paper.results.length, 2)
    const audit = store.db.prepare('SELECT * FROM audit_events WHERE project_id = ?').all(ref.projectId)
    assert.equal(audit.length, 1, '一批一条审计')
    const outbox = store.db.prepare('SELECT * FROM outbox WHERE project_id = ?').all(ref.projectId)
    assert.equal(outbox.length, 1, '一批一条 outbox')
  })

  test('批量中途失败：整批回滚（全成全败），无部分成功', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    const r = executePaperCommands(store, ref, {
      mutationId: 'batch-broken',
      operations: [
        { command: 'paper.propose-core', payload: { claim: 'C' } },
        { command: 'paper.propose-result', payload: { claim: '' } }, // 缺 claim → 拒绝
      ],
    })
    assert.equal(r.kind, 'invalid')
    const snap = store.snapshotOf(ref.projectId)
    assert.equal(snap.revision, 0, '整批回滚，revision 不变')
    assert.equal(snap.snapshot.paper.core, null, 'op1 的写入一并回滚')
    // 幂等回执不落盘：同 mutationId 重试可成功
    const retry = executePaperCommands(store, ref, {
      mutationId: 'batch-broken',
      operations: [{ command: 'paper.propose-core', payload: { claim: 'C' } }],
    })
    assert.equal(retry.kind, 'applied')
  })

  test('重复 mutationId（跨批）：返回原回执，不重复执行', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    const r1 = executePaperCommands(store, ref, { mutationId: 'same', operations: [{ command: 'paper.propose-result', payload: { claim: 'x' } }] })
    const r2 = executePaperCommands(store, ref, { mutationId: 'same', operations: [{ command: 'paper.propose-result', payload: { claim: 'x' } }] })
    assert.equal(r2.kind, 'already-applied')
    assert.deepEqual(r2.receipt, r1.receipt)
    assert.equal(store.snapshotOf(ref.projectId).snapshot.paper.results.length, 1)
  })

  test('H2 回归：跨项目同 mutationId 互不干扰（幂等键按项目作用域）', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1'), s2: sessionOf('s2') } })
    const a = ensureProject(ctx, 's1', { store })
    const b = ensureProject(ctx, 's2', { store })
    const op = [{ command: 'paper.propose-result', payload: { claim: 'shared-key-op' } }]
    const ra = executePaperCommands(store, a.ref, { mutationId: 'res-1-op', operations: op })
    assert.equal(ra.kind, 'applied')
    const rb = executePaperCommands(store, b.ref, { mutationId: 'res-1-op', operations: op })
    assert.equal(rb.kind, 'applied', '同幂等键在另一项目必须正常应用（不得返回他项目回执）')
    assert.notEqual(rb.receipt.projectId, ra.receipt.projectId)
    assert.equal(store.snapshotOf(b.ref.projectId).snapshot.paper.results.length, 1)
    assert.equal(store.snapshotOf(a.ref.projectId).snapshot.paper.results.length, 1)
    // 各自重放仍幂等
    assert.equal(executePaperCommands(store, a.ref, { mutationId: 'res-1-op', operations: op }).kind, 'already-applied')
    assert.equal(executePaperCommands(store, b.ref, { mutationId: 'res-1-op', operations: op }).kind, 'already-applied')
  })

  test('H1 回归：确认后记录证据/链任务不使确认失效，闸门仍放行', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    executePaperCommands(store, ref, { mutationId: 'core', operations: [{ command: 'paper.propose-core', payload: { claim: 'C' } }] })
    const coreObj = store.snapshotOf(ref.projectId).snapshot.paper.core
    executePaperCommands(store, ref, { mutationId: 'cc', operations: [{ command: 'paper.confirm-revision', payload: { objectId: 'core', expectedObjectRevision: coreObj.revision, expectedHash: contentHashOf(coreObj) } }] })
    const rid = seedConfirmedResult(ref.projectId)
    // 执行性更新：记录证据（verified）+ 链任务
    const snap = store.snapshotOf(ref.projectId).snapshot
    const r0 = snap.paper.results.find((x) => x.id === rid)
    executePaperCommands(store, ref, { mutationId: 'ev', operations: [{ command: 'paper.record-evidence', payload: { resultId: rid, claimIds: [r0.claims[0].id], direction: 'supports', state: 'verified', sourceLocator: 'data.csv#L1', allowedInterpretation: '支持' } }] })
    executePaperCommands(store, ref, { mutationId: 'task', operations: [{ command: 'paper.link-task', payload: { resultId: rid, taskId: 'task-1' } }] })
    // 闸门仍放行（对象 revision 未变，confirmation.objectRevision 仍等于当前 revision）
    const gate = executePaperCommands(store, ref, { mutationId: 'g', operations: [{ command: 'paper.dispatch-gate', payload: { resultIds: [rid] } }] })
    assert.equal(gate.kind, 'applied', `执行性更新后闸门必须放行（得到：${gate.kind} ${gate.reason || ''}）`)
    // 语义修改后才重新锁死
    executePaperCommands(store, ref, { mutationId: 'sem', operations: [{ command: 'paper.update-result', payload: { resultId: rid, claim: 'X 显著增加 Y' } }] })
    const gate2 = executePaperCommands(store, ref, { mutationId: 'g2', operations: [{ command: 'paper.dispatch-gate', payload: { resultIds: [rid] } }] })
    assert.equal(gate2.kind, 'invalid')
    assert.match(gate2.reason, /尚未确认/)
  })

  test('M9 回归：确认缺失 expectedObjectRevision 在服务端拒绝（防盲确认）', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    executePaperCommands(store, ref, { mutationId: 'r', operations: [{ command: 'paper.propose-result', payload: { claim: 'x' } }] })
    const r = executePaperCommands(store, ref, { mutationId: 'c', operations: [{ command: 'paper.confirm-revision', payload: { objectId: 'res-1' } }] })
    assert.equal(r.kind, 'invalid')
    assert.match(r.reason, /expectedObjectRevision/)
    assert.equal(store.snapshotOf(ref.projectId).snapshot.paper.results[0].confirmed, false)
  })

  test('T4：确认缺失 expectedHash 拒绝；hash 不符返回结构化 object-conflict', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    executePaperCommands(store, ref, { mutationId: 'r', operations: [{ command: 'paper.propose-result', payload: { claim: 'x' } }] })
    const obj = store.snapshotOf(ref.projectId).snapshot.paper.results[0]
    const noHash = executePaperCommands(store, ref, { mutationId: 'c1', operations: [{ command: 'paper.confirm-revision', payload: { objectId: 'res-1', expectedObjectRevision: obj.revision } }] })
    assert.equal(noHash.kind, 'invalid')
    assert.match(noHash.reason, /expectedHash/)
    assert.equal(obj.confirmed, false)
    const wrongHash = executePaperCommands(store, ref, { mutationId: 'c2', operations: [{ command: 'paper.confirm-revision', payload: { objectId: 'res-1', expectedObjectRevision: obj.revision, expectedHash: 'deadbeefdeadbeef' } }] })
    assert.equal(wrongHash.kind, 'conflict', '对象内容变化必须返回结构化 conflict')
    assert.equal(wrongHash.code, 'object-conflict')
    assert.equal(wrongHash.objectRevision, obj.revision)
    assert.equal(typeof wrongHash.currentHash, 'string')
    assert.equal(store.snapshotOf(ref.projectId).snapshot.paper.results[0].confirmed, false)
    const ok = executePaperCommands(store, ref, { mutationId: 'c3', operations: [{ command: 'paper.confirm-revision', payload: { objectId: 'res-1', expectedObjectRevision: obj.revision, expectedHash: contentHashOf(obj) } }] })
    assert.equal(ok.kind, 'applied')
  })

  test('M2 回归：纯闸门重放总是重算（确认失效后重放给出新结论）', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    executePaperCommands(store, ref, { mutationId: 'core', operations: [{ command: 'paper.propose-core', payload: { claim: 'C' } }] })
    const coreObj = store.snapshotOf(ref.projectId).snapshot.paper.core
    executePaperCommands(store, ref, { mutationId: 'cc', operations: [{ command: 'paper.confirm-revision', payload: { objectId: 'core', expectedObjectRevision: coreObj.revision, expectedHash: contentHashOf(coreObj) } }] })
    const rid = seedConfirmedResult(ref.projectId)
    const op = { command: 'paper.dispatch-gate', payload: { resultIds: [rid] } }
    assert.equal(executePaperCommands(store, ref, { mutationId: 'gate-x', operations: [op] }).kind, 'applied')
    // 核心语义修改后，同 mutationId 的"重放"必须给出新的失败结论（不得吃 already-applied 缓存）
    executePaperCommands(store, ref, { mutationId: 'mod', operations: [{ command: 'paper.propose-core', payload: { claim: 'C2' } }] })
    const replay = executePaperCommands(store, ref, { mutationId: 'gate-x', operations: [op] })
    assert.equal(replay.kind, 'invalid', '纯闸门不落回执——重放必须重算')
  })

  test('M3 回归：teammate 直接调 executePaperCommands 被 module 内断言拒绝', () => {
    const ctx = fakeCtx({
      sessions: { cap: sessionOf('cap'), mem: sessionOf('mem') },
      members: [{ name: 'scout', role: 'x', childId: 'mem', parentSessionId: 'cap' }],
    })
    const capEnsured = ensureProject(ctx, 'cap', { store })
    const memScope = resolveProjectContext(ctx, 'mem', { store })
    assert.equal(memScope.ref.capabilities.writePaper, false)
    const r = executePaperCommands(store, memScope.ref, { mutationId: 'm1', operations: [{ command: 'paper.propose-result', payload: { claim: 'x' } }] })
    assert.equal(r.kind, 'forbidden')
    assert.equal(store.snapshotOf(capEnsured.ref.projectId).snapshot.paper.results.length, 0)
  })

  test('M4 回归：attach-session 统一路径——表+快照+审计同事务；改绑被拒', () => {
    const ctx = fakeCtx({ sessions: { cap: sessionOf('cap'), other: sessionOf('other') } })
    const { ref } = ensureProject(ctx, 'cap', { store })
    const revBefore = store.snapshotOf(ref.projectId).revision
    const r = executePaperCommands(store, ref, { mutationId: 'att-1', operations: [{ command: 'project.attach-session', payload: { rootSessionId: 'other' } }] })
    assert.equal(r.kind, 'applied')
    assert.equal(store.bindingOfRootSession('other').projectId, ref.projectId, 'root_bindings 表已更新（访问权生效）')
    const snap = store.snapshotOf(ref.projectId)
    assert.ok(snap.snapshot.bindings.attachedRootSessionIds.includes('other'), '快照镜像同步')
    assert.equal(snap.revision, revBefore + 1, 'attach 推进 revision 并可被 observe 感知')
    const audit = store.db.prepare("SELECT * FROM audit_events WHERE command='project.attach-session'").all()
    assert.equal(audit.length, 1, 'attach 落审计')
    // 改绑到另一项目被拒
    const b = ensureProject(ctx, 'other2', { store, title: 'B' }).ref
    void b
    const conflict = executePaperCommands(store, { ...ref, projectId: store.createProject({ rootSessionId: 'third' }) }, { mutationId: 'att-2', operations: [{ command: 'project.attach-session', payload: { rootSessionId: 'other' } }] })
    assert.equal(conflict.kind, 'conflict', '已绑定 root 不能被静默改绑')
  })

  test('语义修改使确认失效；执行性字段（status/direction）不失效', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    const rid = seedConfirmedResult(ref.projectId)
    const confirmBefore = store.snapshotOf(ref.projectId).snapshot.paper.results[0].confirmation
    // 非语义更新
    executePaperCommands(store, ref, { mutationId: 'u1', operations: [{ command: 'paper.update-result', payload: { resultId: rid, status: 'in_progress' } }] })
    let snap = store.snapshotOf(ref.projectId).snapshot
    let r0 = snap.paper.results[0]
    assert.equal(r0.confirmed, true, 'status 更新不失效确认')
    assert.equal(r0.confirmation.revisionId, confirmBefore.revisionId)
    assert.equal(r0.revision, 1, '非语义更新不推进对象 revision')
    // 语义更新
    executePaperCommands(store, ref, { mutationId: 'u2', operations: [{ command: 'paper.update-result', payload: { resultId: rid, claim: 'X 显著增加 Y' } }] })
    snap = store.snapshotOf(ref.projectId).snapshot
    r0 = snap.paper.results[0]
    assert.equal(r0.confirmed, false)
    assert.equal(r0.confirmation, null)
    assert.equal(r0.revision, 2)
  })

  test('无关对象更新不影响另一对象的确认（确认粒度 = 对象）', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    const r1 = executePaperCommands(store, ref, { mutationId: 'a', operations: [{ command: 'paper.propose-result', payload: { claim: 'x' } }] })
    const r2 = executePaperCommands(store, ref, { mutationId: 'b', operations: [{ command: 'paper.propose-result', payload: { claim: 'y' } }] })
    const id1 = r1.receipt.objects[0].objectId
    const id2 = r2.receipt.objects[0].objectId
    for (const id of [id1, id2]) {
      const obj = store.snapshotOf(ref.projectId).snapshot.paper.results.find((x) => x.id === id)
      executePaperCommands(store, ref, { mutationId: `c-${id}`, operations: [{ command: 'paper.confirm-revision', payload: { objectId: id, expectedObjectRevision: obj.revision, expectedHash: contentHashOf(obj) } }] })
    }
    // 修改 res-1 语义
    executePaperCommands(store, ref, { mutationId: 'm', operations: [{ command: 'paper.update-result', payload: { resultId: id1, claim: 'x2' } }] })
    const snap = store.snapshotOf(ref.projectId).snapshot
    assert.equal(snap.paper.results.find((x) => x.id === id1).confirmed, false)
    assert.equal(snap.paper.results.find((x) => x.id === id2).confirmed, true, '无关对象的确认保持有效')
  })

  test('派单硬闸门：空 resultIds / 未确认 core / 未确认 Result 都在服务端拒绝（结构化结果）', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    // 空 resultIds
    let r = executePaperCommands(store, ref, { mutationId: 'g0', operations: [{ command: 'paper.dispatch-gate', payload: { resultIds: [] } }] })
    assert.equal(r.kind, 'invalid')
    assert.match(r.reason, /显式携带/)
    // 核心未确认
    executePaperCommands(store, ref, { mutationId: 'core', operations: [{ command: 'paper.propose-core', payload: { claim: 'C' } }] })
    const rid = seedConfirmedResult(ref.projectId, { confirmed: true })
    r = executePaperCommands(store, ref, { mutationId: 'g1', operations: [{ command: 'paper.dispatch-gate', payload: { resultIds: [rid] } }] })
    assert.equal(r.kind, 'invalid')
    assert.match(r.reason, /核心当前修订尚未确认/)
    // 确认核心后，未确认 Result 仍被拒
    const coreObj = store.snapshotOf(ref.projectId).snapshot.paper.core
    executePaperCommands(store, ref, { mutationId: 'cc', operations: [{ command: 'paper.confirm-revision', payload: { objectId: 'core', expectedObjectRevision: coreObj.revision, expectedHash: contentHashOf(coreObj) } }] })
    executePaperCommands(store, ref, { mutationId: 'r2', operations: [{ command: 'paper.propose-result', payload: { claim: 'z' } }] })
    const unconfirmedId = store.snapshotOf(ref.projectId).snapshot.paper.results.find((x) => x.claim === 'z').id
    r = executePaperCommands(store, ref, { mutationId: 'g2', operations: [{ command: 'paper.dispatch-gate', payload: { resultIds: [rid, unconfirmedId] } }] })
    assert.equal(r.kind, 'invalid')
    assert.match(r.reason, /尚未确认/)
    // 全部确认 → 放行（纯闸门：只读校验，不推进 revision，gate 结果在 receipt 上）
    const beforeGate = store.snapshotOf(ref.projectId).revision
    r = executePaperCommands(store, ref, { mutationId: 'g3', operations: [{ command: 'paper.dispatch-gate', payload: { resultIds: [rid] } }] })
    assert.equal(r.kind, 'applied')
    assert.deepEqual(r.receipt.gate.resultIds, [rid])
    assert.equal(r.receipt.gateOnly, true)
    assert.equal(store.snapshotOf(ref.projectId).revision, beforeGate, '纯闸门不推进 revision')
  })

  test('assertDispatchGate 直接抛错（供派单工具在创建任务前断言）', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    const snap = store.snapshotOf(ref.projectId).snapshot
    assert.throws(() => assertDispatchGate(snap, []), /显式携带/)
  })

  test('确认后语义修改 → 派单闸门重新失败（闸门在执行时重算）', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    executePaperCommands(store, ref, { mutationId: 'core', operations: [{ command: 'paper.propose-core', payload: { claim: 'C' } }] })
    const coreObj = store.snapshotOf(ref.projectId).snapshot.paper.core
    executePaperCommands(store, ref, { mutationId: 'cc', operations: [{ command: 'paper.confirm-revision', payload: { objectId: 'core', expectedObjectRevision: coreObj.revision, expectedHash: contentHashOf(coreObj) } }] })
    const rid = seedConfirmedResult(ref.projectId)
    let r = executePaperCommands(store, ref, { mutationId: 'g1', operations: [{ command: 'paper.dispatch-gate', payload: { resultIds: [rid] } }] })
    assert.equal(r.kind, 'applied')
    executePaperCommands(store, ref, { mutationId: 'mod', operations: [{ command: 'paper.propose-core', payload: { claim: 'C2' } }] })
    r = executePaperCommands(store, ref, { mutationId: 'g2', operations: [{ command: 'paper.dispatch-gate', payload: { resultIds: [rid] } }] })
    assert.equal(r.kind, 'invalid')
    assert.match(r.reason, /核心当前修订尚未确认/)
  })

  test('T6：stage 只校验枚举并记录说明，不再是 execute 前置闸门', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    // 无核心/无已确认 Result 也可记录 execute（阶段是描述性上下文）
    const r = executePaperCommands(store, ref, { mutationId: 's1x', operations: [{ command: 'paper.set-stage', payload: { stage: 'execute', note: '先探索再细化' } }] })
    assert.equal(r.kind, 'applied')
    const snap = store.snapshotOf(ref.projectId).snapshot
    assert.equal(snap.paper.stage, 'execute')
    assert.equal(snap.paper.stageNote, '先探索再细化')
    // 非法枚举仍拒绝
    const bad = executePaperCommands(store, ref, { mutationId: 's1bad', operations: [{ command: 'paper.set-stage', payload: { stage: 'nope' } }] })
    assert.equal(bad.kind, 'invalid')
    assert.match(bad.reason, /stage 必须是/)
    // 正式派单闸门不受 stage 影响：无核心时 dispatch gate 仍拒绝
    const gate = executePaperCommands(store, ref, { mutationId: 'g1', operations: [{ command: 'paper.dispatch-gate', payload: { resultIds: ['res-1'] } }] })
    assert.equal(gate.kind, 'invalid')
    assert.match(gate.reason, /核心尚未建立|不存在/)
  })

  test('verified 证据必须有来源定位与允许解释（结构化拒绝）', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    const rid = seedConfirmedResult(ref.projectId, { confirmed: false })
    const snap = store.snapshotOf(ref.projectId).snapshot
    const r0 = snap.paper.results[0]
    let r = executePaperCommands(store, ref, {
      mutationId: 'e1',
      operations: [{ command: 'paper.record-evidence', payload: { resultId: rid, claimIds: [r0.claims[0].id], direction: 'supports', state: 'verified' } }],
    })
    assert.equal(r.kind, 'invalid')
    assert.match(r.reason, /sourceLocator/)
    r = executePaperCommands(store, ref, {
      mutationId: 'e2',
      operations: [{ command: 'paper.record-evidence', payload: { resultId: rid, claimIds: [r0.claims[0].id], direction: 'supports', state: 'verified', sourceLocator: 'data/results.csv#L12', allowedInterpretation: '在本实验条件下支持' } }],
    })
    assert.equal(r.kind, 'applied')
  })

  test('领域命令词汇封闭：未知命令在事务外先拒绝', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    const r = executePaperCommands(store, ref, { mutationId: 'x', operations: [{ command: 'paper.arbitrary-sql', payload: {} }] })
    assert.equal(r.kind, 'invalid')
    assert.equal(store.snapshotOf(ref.projectId).revision, 0)
    assert.ok(COMMANDS.includes('paper.dispatch-gate'))
  })
})

// =============================================================================
describe('T1.4 outbox 消费与清理', () => {
  beforeEach(() => { resetHome() })

  test('outbox 帧按 revision 单调排列；publishPending 不重发已发布帧', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    const frames = []
    const off = store.subscribe((f) => frames.push(f.projectRevision))
    for (let i = 0; i < 3; i++) {
      executePaperCommands(store, ref, { mutationId: `m${i}`, operations: [{ command: 'paper.propose-result', payload: { claim: `c${i}` } }] })
    }
    assert.deepEqual(frames, [1, 2, 3])
    off()
    const before = store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE published_at IS NOT NULL').get().n
    store.publishPending()
    const after = store.db.prepare('SELECT COUNT(*) n FROM outbox WHERE published_at IS NOT NULL').get().n
    assert.equal(after, before)
  })

  test('无订阅者时帧标记为已发布（跨进程拉取方按 revision 补齐，无需重试）', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    executePaperCommands(store, ref, { mutationId: 'm1', operations: [{ command: 'paper.propose-result', payload: { claim: 'c' } }] })
    const pending = store.db.prepare('SELECT * FROM outbox WHERE published_at IS NULL').all()
    assert.equal(pending.length, 0, '无本地订阅者 → 无需重试，帧标记已发布')
    const published = store.db.prepare('SELECT * FROM outbox WHERE published_at IS NOT NULL').all()
    assert.equal(published.length, 1)
    assert.equal(JSON.parse(published[0].frame).projectRevision, 1, '帧内容保留供审计/补发查询')
  })

  test('pruneOutbox 有界清理：只删已发布的老帧，保留未发布与最近 N 条', () => {
    const ctx = fakeCtx({ sessions: { s1: sessionOf('s1') } })
    const { ref } = ensureProject(ctx, 's1', { store })
    // 5 条已发布（无订阅者路径）
    for (let i = 0; i < 5; i++) {
      executePaperCommands(store, ref, { mutationId: `m${i}`, operations: [{ command: 'paper.propose-result', payload: { claim: `c${i}` } }] })
    }
    // 1 条未发布（订阅者抛错路径）
    const bad = store.subscribe(() => { throw new Error('down') })
    executePaperCommands(store, ref, { mutationId: 'm-pending', operations: [{ command: 'paper.propose-result', payload: { claim: 'pending' } }] })
    bad()
    store.pruneOutbox(3)
    const rows = store.db.prepare('SELECT * FROM outbox ORDER BY id').all()
    assert.equal(rows.length, 4, '保留最近 3 条已发布 + 1 条未发布')
    assert.equal(rows.filter((r) => r.published_at == null).length, 1)
    assert.equal(rows[rows.length - 1].published_at, null, '未发布帧最后保留')
  })
})
