// dsh-science 阶段 5 测试：T5.1 旧数据只读导入（完整字段/幂等/备份不删/预览/损坏容错）
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-t51-import-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { importLegacyBlueprint, readScope, blueprintViewOf } = await import('../lib/project-adapter.js')
const { registerBlueprintTools } = await import('../lib/blueprint.js')

let store = null

function resetHome() {
  if (store) { try { store.close() } catch { /* ignore */ } store = null }
  rmSync(join(home, 'dsh-science'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  mkdirSync(join(home, 'dsh-science'), { recursive: true })
  store = ProjectStore.open(home)
}

const EXEC = { agent: { id: 'import-lead' } }

const LEGACY = {
  version: '0.13.0',
  core: { title: '旧核心标题', claim: '旧核心主张', innovation: '旧创新点', venue: 'Nature', confirmed: true },
  results: [
    {
      id: 'res-1', title: '旧结果一', claim: '旧主张 A', purpose: 'p1', status: 'supported', confirmed: true,
      direction: 'supports', evidenceState: 'verified', manuscriptRole: 'main',
      presentation: { mode: 'figure', rationale: '主图' },
      claims: [{ id: 'res-1-claim-1', text: '旧主张 A', revision: 2 }],
      evidence: [{ id: 'res-1-ev-1', claimIds: ['res-1-claim-1'], direction: 'supports', state: 'verified', sourceLocator: 'a.csv#L1', allowedInterpretation: 'ok' }],
      references: [{ doi: '10.1/legacy', title: 'Legacy Ref', usedAs: 'method', verified: true }],
      tasks: Array.from({ length: 59 }, (_, i) => 'task-' + (i + 1)), figures: ['fig-1'], notes: '旧备注',
    },
    { id: 'res-2', title: '旧结果二', claim: '旧主张 B', status: 'planned', confirmed: false },
  ],
}

describe('T5.1 旧数据只读导入', () => {
  beforeEach(() => { resetHome() })

  test('完整字段导入：状态/证据/文献/任务/图件引用与旧确认凭据（legacy-migration）', () => {
    const r = importLegacyBlueprint({ get: () => { throw new Error('no sessions') } }, EXEC, { store, legacy: LEGACY, sourceFile: 'blueprint.json' })
    assert.equal(r.ok, true)
    const scope = readScope({ get: () => { throw new Error('no sessions') } }, EXEC, { store })
    const view = blueprintViewOf(scope.snapshot)
    assert.equal(view.core.title, '旧核心标题')
    assert.equal(view.results.length, 2)
    const r1 = view.results.find((x) => x.id === 'res-1')
    assert.equal(r1.status, 'supported')
    assert.equal(r1.direction, 'supports')
    assert.equal(r1.evidenceState, 'verified')
    assert.equal(r1.presentation.mode, 'figure')
    assert.equal(r1.evidence.length, 1)
    assert.equal(r1.evidence[0].sourceLocator, 'a.csv#L1')
    assert.equal(r1.references[0].doi, '10.1/legacy')
    assert.deepEqual(r1.tasks, LEGACY.results[0].tasks)
    assert.deepEqual(r1.figures, ['fig-1'])
    assert.equal(r1.notes, '旧备注')
    // 旧确认保留为 legacy-migration 凭据（读模型判定为当前）
    assert.equal(r1.confirmed, true)
    assert.equal(r1.confirmation.source, 'legacy-migration')
    // 未确认的 res-2 保持待确认
    const r2 = view.results.find((x) => x.id === 'res-2')
    assert.equal(r2.confirmed, false)
    // 台账：migrationId + 源 hash
    const migrationId = r.migrationId
    const row = store.st.getLegacyImport.get(migrationId)
    assert.ok(row, 'legacy_imports 台账落行')
    assert.equal(row.source, 'blueprint.json')
  })

  test('重复导入幂等：同源返回 duplicate，不产生第二份数据', () => {
    importLegacyBlueprint({ get: () => { throw new Error('x') } }, EXEC, { store, legacy: LEGACY })
    const again = importLegacyBlueprint({ get: () => { throw new Error('x') } }, EXEC, { store, legacy: LEGACY })
    assert.equal(again.ok, true)
    assert.equal(again.duplicate, true)
    const scope = readScope({ get: () => { throw new Error('x') } }, EXEC, { store })
    assert.equal(blueprintViewOf(scope.snapshot).results.length, 2)
  })

  test('dryRun 预览：不落任何写入', () => {
    const preview = importLegacyBlueprint({ get: () => { throw new Error('x') } }, EXEC, { store, legacy: LEGACY, dryRun: true })
    assert.equal(preview.ok, true)
    assert.equal(preview.preview, true)
    assert.match(preview.note, /预览/)
    assert.equal(preview.results.length, 2)
    const scope = readScope({ get: () => { throw new Error('x') } }, EXEC, { store })
    assert.equal(scope.snapshot, null, '预览不建项目')
  })

  test('原文件不删不改（只读备份语义）', () => {
    const file = join(home, 'dsh-science', 'blueprint.json')
    writeFileSync(file, JSON.stringify(LEGACY), 'utf8')
    const before = readFileSync(file, 'utf8')
    importLegacyBlueprint({ get: () => { throw new Error('x') } }, EXEC, { store, legacy: LEGACY, sourceFile: file })
    assert.equal(readFileSync(file, 'utf8'), before, '原文件字节级不变')
  })

  test('损坏/部分旧数据容错：非对象/缺字段安全导入可导入部分', () => {
    const partial = { core: { claim: '只有主张' }, results: [null, { id: 'res-1', claim: 'ok' }, 'junk', { title: '无 id' }] }
    const r = importLegacyBlueprint({ get: () => { throw new Error('x') } }, EXEC, { store, legacy: partial })
    assert.equal(r.ok, true)
    const scope = readScope({ get: () => { throw new Error('x') } }, EXEC, { store })
    const view = blueprintViewOf(scope.snapshot)
    assert.equal(view.core.claim, '只有主张')
    assert.equal(view.results.length, 1, '无 id/坏条目跳过')
  })

  test('跨项目冲突：同源已导入其他项目时拒绝', () => {
    importLegacyBlueprint({ get: () => { throw new Error('x') } }, EXEC, { store, legacy: LEGACY })
    // 另一个 root 的项目
    const otherPid = store.createProject({ rootSessionId: 'other-root' })
    void otherPid
    const otherExec = { agent: { id: 'other-root' } }
    const r = importLegacyBlueprint({ get: () => { throw new Error('x') } }, otherExec, { store, legacy: LEGACY })
    assert.equal(r.ok, false)
    assert.match(r.error, /已导入过其他项目/)
  })

  test('ID 冲突：已有同名 result 时跳过（幂等语义）', () => {
    // 先造一个 res-1
    importLegacyBlueprint({ get: () => { throw new Error('x') } }, EXEC, { store, legacy: { core: {}, results: [{ id: 'res-1', claim: '先到的' }] } })
    // 另一份不同 hash 的旧数据也带 res-1
    const second = { core: {}, results: [{ id: 'res-1', claim: '后到的' }] }
    const r = importLegacyBlueprint({ get: () => { throw new Error('x') } }, EXEC, { store, legacy: second })
    assert.equal(r.ok, true)
    const scope = readScope({ get: () => { throw new Error('x') } }, EXEC, { store })
    const view = blueprintViewOf(scope.snapshot)
    const res1 = view.results.find((x) => x.id === 'res-1')
    assert.equal(res1.claim, '先到的', '同名 result 不被覆盖')
  })

  test('工具面：dry_run 参数透传 + 损坏 JSON 明确报错', async () => {
    const tools = {}
    registerBlueprintTools({ tools: { register: (d) => { tools[d.name] = d } } }, { store: storeRef() })
    const preview = await tools.sci_blueprint_import_legacy.execute({ legacy_json: JSON.stringify(LEGACY), dry_run: true }, EXEC)
    assert.equal(preview.preview, true)
    await assert.rejects(
      tools.sci_blueprint_import_legacy.execute({ legacy_json: '{broken' }, EXEC),
      /不是合法 JSON/,
    )
  })
})

// 测试 store 助手（本文件独立 home）
let storeRefCounter = 0
function storeRef() {
  storeRefCounter++
  return store
}

// ---------------------------------------------------------------------------
// T3：legacy 导入与台账事务合并（故障注入 / reconcile / 审计事实不可覆盖）
describe('T3 legacy 导入与台账同事务', () => {
  beforeEach(() => { resetHome() })

  const NO_SESSIONS = { get: () => { throw new Error('no sessions') } }
  const importOnce = () => importLegacyBlueprint(NO_SESSIONS, EXEC, { store, legacy: LEGACY, sourceFile: 'blueprint.json' })
  const ledgerRows = () => store.db.prepare('SELECT * FROM legacy_imports').all()
  const auditCount = () => store.db.prepare('SELECT COUNT(*) AS n FROM audit_events').get().n

  function snapshotInfo() {
    const binding = store.bindingOfRootSession('import-lead')
    if (!binding) return { projectId: null, revision: 0, results: 0 }
    const snap = store.snapshotOf(binding.projectId).snapshot
    return { projectId: binding.projectId, revision: snap.revision, results: snap.paper.results.length }
  }

  for (const stage of ['before-command', 'after-snapshot', 'at-ledger']) {
    test(`${stage} 故障：整批回滚、无台账/回执；重试最多导入一次`, () => {
      store.setFaultInjector((s) => { if (s === stage) throw new Error(`fault:${s}`) })
      const failed = importOnce()
      store.setFaultInjector(null)
      assert.equal(failed.ok, false, JSON.stringify(failed))
      assert.equal(failed.committed, false)
      assert.equal(ledgerRows().length, 0, '故障点不得留下台账')
      assert.equal(auditCount(), 0, '故障点不得留下审计事实')
      assert.equal(snapshotInfo().results, 0, '故障点不得留下已导入结果')

      const retried = importOnce()
      assert.equal(retried.ok, true)
      assert.equal(ledgerRows().length, 1)
      assert.equal(auditCount(), 1)
      assert.equal(snapshotInfo().results, 2)
      const revision = snapshotInfo().revision
      const again = importOnce()
      assert.equal(again.duplicate, true)
      assert.equal(snapshotInfo().revision, revision, '重复导入不推进 revision')
      assert.equal(ledgerRows().length, 1)
      assert.equal(auditCount(), 1, '审计事实 append-only')
    })
  }

  test('after-commit 通知故障：事实已提交；重试返回原回执且不重复导入', () => {
    store.setFaultInjector((s) => { if (s === 'after-commit') throw new Error('notify down') })
    const failed = importOnce()
    store.setFaultInjector(null)
    assert.equal(failed.ok, false)
    assert.equal(failed.committed, true)
    assert.equal(ledgerRows().length, 1, 'commit 后台账已存在')
    assert.equal(snapshotInfo().results, 2)
    const revision = snapshotInfo().revision
    const retried = importOnce()
    assert.equal(retried.ok, true)
    assert.equal(retried.duplicate, true)
    assert.equal(retried.revision, revision)
    assert.equal(ledgerRows().length, 1)
    assert.equal(auditCount(), 1)
    assert.equal(snapshotInfo().results, 2)
  })

  test('有回执无台账的旧异常：同事务 reconcile，不重复导入、不推进 revision', () => {
    const first = importOnce()
    assert.equal(first.ok, true)
    const before = snapshotInfo()
    store.db.prepare('DELETE FROM legacy_imports WHERE migration_id = ?').run(first.migrationId)
    assert.equal(ledgerRows().length, 0)
    const repaired = importOnce()
    assert.equal(repaired.ok, true)
    assert.equal(repaired.duplicate, true)
    assert.equal(repaired.reconciled, true)
    assert.equal(repaired.receipt.mutationId, first.migrationId)
    assert.equal(repaired.revision, before.revision)
    assert.equal(snapshotInfo().revision, before.revision)
    assert.equal(snapshotInfo().results, before.results)
    assert.equal(ledgerRows().length, 1)
    assert.equal(auditCount(), 1)
  })

  test('重复 migrationId 返回原回执；台账是普通 INSERT，不被 REPLACE 覆盖', () => {
    const first = importOnce()
    assert.equal(first.ok, true)
    const again = importOnce()
    assert.equal(again.ok, true)
    assert.equal(again.duplicate, true)
    assert.equal(again.receipt.mutationId, first.migrationId)
    assert.equal(again.receipt.revision, first.revision)
    assert.equal(again.revision, first.revision)
    assert.throws(
      () => store.recordLegacyImport({ migrationId: first.migrationId, projectId: first.projectId, source: 'tampered', sourceHash: 'x', backupPath: '' }),
      /UNIQUE|constraint/i,
    )
    const row = store.st.getLegacyImport.get(first.migrationId)
    assert.equal(row.source, 'blueprint.json', '原台账来源未被覆盖')
    assert.equal(auditCount(), 1)
  })
})
