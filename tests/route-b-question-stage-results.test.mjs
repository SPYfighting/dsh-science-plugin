// 路线 B T6：研究问题写入、阶段去闸门、Result 硬上限移除、确认语义字段失效率。
// 依据任务书 T6 必测矩阵：question/scope/sourceSummary 进入审计+revision+卡片投影但不自动
// 确认；stage 只校验枚举；Result 只保留 >5 软提醒；改变确认摘要/纳入排除/派单目标的字段
// 必须推进 revision 并使旧确认不可用。
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const home = mkdtempSync(join(tmpdir(), 'dsh-routeb-t6-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { executePaperCommands, contentHashOf } = await import('../lib/project-domain.js')
const { registerBlueprintTools } = await import('../lib/blueprint.js')
const { registerStateRoute } = await import('../lib/httpdata.js')
const { stateViewOf } = await import('../client-src/workbench/state-view.js')
const { blueprintViewOf } = await import('../lib/project-adapter.js')

const dataDir = join(home, 'dsh-science')
let store = null
let mutationSeq = 0

function resetHome() {
  if (store) { try { store.close() } catch { /* ignore */ } store = null }
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  mkdirSync(dataDir, { recursive: true })
  store = ProjectStore.open(home)
  mutationSeq = 0
}

const sessions = { s1: { id: 's1', header: { version: 1, id: 's1', createdAt: 1, parentSession: null, isSeeded: false } } }
const sessionsSvc = { get: (id) => sessions[id] }

function fakeCtx(extra = {}) {
  return {
    get(name) {
      if (name === 'sessions') return sessionsSvc
      if (name === 'webServer' || name === 'httpServer') return extra.server
      return undefined
    },
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register() {} },
    ...(extra.ctx || {}),
  }
}

const refOf = (pid, root = 's1') => ({
  projectId: pid,
  rootSessionId: root,
  currentSessionId: root,
  relationship: 'root',
  capabilities: { read: true, propose: true, writePaper: true, dispatch: true },
})

function nextMutation(prefix) { return `${prefix}-${String(++mutationSeq)}` }

function seedProject({ results = [{ claim: 'R1' }], title = '项目' } = {}) {
  const pid = store.createProject({ rootSessionId: 's1', title })
  const ops = [{ command: 'paper.propose-core', payload: { title, claim: '核心主张' } }]
  for (const r of results) ops.push({ command: 'paper.propose-result', payload: { title: r.title || r.claim, claim: r.claim } })
  executePaperCommands(store, refOf(pid), { mutationId: nextMutation('seed'), operations: ops })
  return pid
}

function confirmObject(pid, objectId) {
  const snap = store.snapshotOf(pid).snapshot
  const obj = objectId === 'core' ? snap.paper.core : snap.paper.results.find((r) => r.id === objectId)
  const r = executePaperCommands(store, refOf(pid), {
    mutationId: nextMutation(`confirm-${objectId}`),
    operations: [{ command: 'paper.confirm-revision', payload: { objectId, expectedObjectRevision: obj.revision, expectedHash: contentHashOf(obj) } }],
  })
  assert.equal(r.kind, 'applied', JSON.stringify(r))
}

function stateHarness() {
  const handlers = {}
  const server = { register: (def) => { handlers[def.path] = def.handler; return () => {} } }
  registerStateRoute(fakeCtx({ server }), { store })
  return async (path) => {
    let status = 0
    let body = ''
    const res = {
      writeHead(code) { status = code },
      end(text) { if (text) body += String(text) },
      write(text) { if (text) body += String(text) },
    }
    const req = new EventEmitter()
    req.url = path
    req.method = 'GET'
    req.headers = {}
    await handlers['/plugins/dsh-science/state'](req, res)
    return { status, body, json: () => JSON.parse(body) }
  }
}

function toolsHarness() {
  const tools = {}
  registerBlueprintTools({ tools: { register: (def) => { tools[def.name] = def } }, effect: (fn) => fn(), on: () => () => {} }, { store })
  return { tools, exec: { agent: { id: 's1' } } }
}

describe('T6：研究问题、阶段与 Result 自由度', () => {
  beforeEach(() => { resetHome() })

  test('研究问题写入：审计 + project revision + /state 与卡片投影；不自动确认核心/Result', async () => {
    const pid = seedProject()
    confirmObject(pid, 'core')
    confirmObject(pid, 'res-1')
    const before = store.snapshotOf(pid)
    const r = executePaperCommands(store, refOf(pid), {
      mutationId: nextMutation('question'),
      operations: [{ command: 'paper.set-question', payload: { question: 'MYC 是否驱动耐药？', scope: '三阴性乳腺癌细胞系', sourceSummary: '自有 RNA-seq 与 3 篇近三年文献' } }],
    })
    assert.equal(r.kind, 'applied')
    const after = store.snapshotOf(pid)
    assert.ok(after.revision > before.revision, '研究问题变化必须推进 project revision')
    assert.equal(after.snapshot.paper.question, 'MYC 是否驱动耐药？')
    assert.equal(after.snapshot.paper.scope, '三阴性乳腺癌细胞系')
    assert.equal(after.snapshot.paper.sourceSummary, '自有 RNA-seq 与 3 篇近三年文献')
    assert.ok(after.snapshot.paper.questionUpdatedAt > 0)
    assert.equal(after.snapshot.paper.core.confirmed, true, '研究问题变化不得使核心确认失效')
    assert.equal(after.snapshot.paper.results[0].confirmed, true, '研究问题变化不得使 Result 确认失效')

    const audit = store.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE project_id = ? AND command = 'paper.set-question'").get(pid).n
    assert.ok(audit >= 1, '研究问题变化必须进入审计')
    const auditRow = store.db.prepare("SELECT payload FROM audit_events WHERE project_id = ? AND command = 'paper.set-question' ORDER BY seq DESC LIMIT 1").get(pid)
    assert.match(auditRow.payload, /MYC 是否驱动耐药/)

    const state = await stateHarness()('/plugins/dsh-science/state?sessionId=s1')
    assert.equal(state.status, 200)
    const payload = state.json()
    assert.equal(payload.blueprint.question, 'MYC 是否驱动耐药？')
    assert.equal(payload.blueprint.scope, '三阴性乳腺癌细胞系')
    assert.equal(payload.blueprint.sourceSummary, '自有 RNA-seq 与 3 篇近三年文献')

    // 卡片投影（客户端由 project snapshot 派生）读取同一组字段
    const view = stateViewOf({ ts: 1, blueprint: blueprintViewOf(after.snapshot), team: { members: [], tasks: [] } })
    assert.equal(view.paper.question, 'MYC 是否驱动耐药？')
    assert.equal(view.paper.scope, '三阴性乳腺癌细胞系')
    assert.equal(view.paper.sourceSummary, '自有 RNA-seq 与 3 篇近三年文献')
  })

  test('研究问题写入幂等；空 payload 拒绝；没有核心时也不自动创建/确认核心', () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    const mutationId = nextMutation('q')
    const first = executePaperCommands(store, refOf(pid), { mutationId, operations: [{ command: 'paper.set-question', payload: { question: '问题 A' } }] })
    assert.equal(first.kind, 'applied')
    const snap = store.snapshotOf(pid)
    const replay = executePaperCommands(store, refOf(pid), { mutationId, operations: [{ command: 'paper.set-question', payload: { question: '问题 A' } }] })
    assert.equal(replay.kind, 'already-applied', '相同 mutationId 重放必须命中幂等回执')
    assert.equal(store.snapshotOf(pid).revision, snap.revision, '幂等重放不推进 revision')

    const empty = executePaperCommands(store, refOf(pid), { mutationId: nextMutation('q'), operations: [{ command: 'paper.set-question', payload: {} }] })
    assert.equal(empty.kind, 'invalid')
    assert.match(empty.reason, /question|scope|sourceSummary/)

    const final = store.snapshotOf(pid).snapshot
    assert.equal(final.paper.core, null, '研究问题写入不得自动创建核心')
    assert.equal(final.paper.results.length, 0)
  })

  test('sci_blueprint_set 接入研究问题/范围/来源摘要，并在回执中说明不自动确认', async () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    const { tools, exec } = toolsHarness()
    const out = await tools.sci_blueprint_set.execute({
      core_title: 'T6 标题', claim: 'T6 核心', question: '研究问题 Q', scope: '范围 S', source_summary: '来源摘要 SS',
    }, exec)
    assert.equal(out.ok, true)
    assert.equal(out.question, '研究问题 Q')
    assert.equal(out.scope, '范围 S')
    assert.equal(out.sourceSummary, '来源摘要 SS')
    assert.equal(out.coreConfirmed, false)
    assert.ok(out.changed.includes('question'))
    assert.ok(out.changed.includes('scope'))
    assert.match(out.note, /不会自动确认/)

    const snap = store.snapshotOf(pid).snapshot
    assert.equal(snap.paper.core.claim, 'T6 核心')
    assert.equal(snap.paper.core.confirmed, false, 'sci_blueprint_set 不得自动确认核心')
    assert.equal(snap.paper.question, '研究问题 Q')
    assert.equal(snap.paper.results.length, 0)

    // 仅改研究问题：核心对象 revision/确认状态不变
    const coreBefore = snap.paper.core
    const out2 = await tools.sci_blueprint_set.execute({ question: '研究问题 Q2' }, exec)
    const after = store.snapshotOf(pid).snapshot
    assert.equal(out2.coreConfirmed, false)
    assert.equal(after.paper.core.revision, coreBefore.revision)
    assert.equal(after.paper.core.claim, 'T6 核心')
    assert.equal(after.paper.question, '研究问题 Q2')
  })

  test('阶段只校验枚举并记录说明；execute/audit 不再要求确认；派单闸门仍独立拒绝', async () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    const { tools, exec } = toolsHarness()
    const execute = await tools.sci_blueprint_stage.execute({ stage: 'execute', note: '先执行再确认' }, exec)
    assert.equal(execute.stage, 'execute')
    assert.equal(execute.gated, false)
    const audit = await tools.sci_blueprint_stage.execute({ stage: 'audit', note: 'audit 备注' }, exec)
    assert.equal(audit.stage, 'audit')
    assert.equal(store.snapshotOf(pid).snapshot.paper.stage, 'audit')
    assert.equal(store.snapshotOf(pid).snapshot.paper.stageNote, 'audit 备注')

    const bad = executePaperCommands(store, refOf(pid), { mutationId: nextMutation('stage'), operations: [{ command: 'paper.set-stage', payload: { stage: 'invalid-stage' } }] })
    assert.equal(bad.kind, 'invalid')

    const gate = executePaperCommands(store, refOf(pid), { mutationId: nextMutation('gate'), operations: [{ command: 'paper.dispatch-gate', payload: { resultIds: ['res-1'] } }] })
    assert.equal(gate.kind, 'invalid')
    assert.match(gate.reason, /核心尚未建立|不存在/)
  })

  test('移除 7 个 Result 硬上限：第 8 个仍可写入；>5 给软提醒', async () => {
    const pid = store.createProject({ rootSessionId: 's1' })
    for (let i = 1; i <= 8; i++) {
      const r = executePaperCommands(store, refOf(pid), { mutationId: nextMutation(`r${i}`), operations: [{ command: 'paper.propose-result', payload: { title: `R${i}`, claim: `claim ${i}` } }] })
      assert.equal(r.kind, 'applied', `第 ${i} 个 Result 不应被硬上限拒绝：${JSON.stringify(r)}`)
    }
    assert.equal(store.snapshotOf(pid).snapshot.paper.results.length, 8)

    const { tools, exec } = toolsHarness()
    const added = await tools.sci_result_add.execute({ result_title: 'R9', claim: 'claim 9' }, exec)
    assert.equal(added.resultCount, 9)
    assert.match(added.warning || '', /超过 5 个/)
    const overview = await tools.sci_blueprint_overview.execute({}, exec)
    assert.equal(overview.results.length, 9)
    assert.ok(overview.softWarnings.length > 0, '超过 5 个 Result 必须给软提醒')
    assert.match(overview.softWarnings[0], /Result 已有 9 个/)
  })

  test('语义字段失效矩阵：manuscriptRole/purpose/status 跨 dropped 推进 revision+失效确认；非 dropped 状态不失效', () => {
    const pid = seedProject({ results: [{ claim: 'R1' }, { claim: 'R2' }, { claim: 'R3' }] })
    for (const id of ['res-1', 'res-2', 'res-3']) confirmObject(pid, id)

    // 纳入/排除决定：manuscriptRole 变更
    let before = store.snapshotOf(pid).snapshot.paper.results[0]
    executePaperCommands(store, refOf(pid), { mutationId: nextMutation('role'), operations: [{ command: 'paper.update-result', payload: { resultId: 'res-1', manuscriptRole: 'excluded' } }] })
    let after = store.snapshotOf(pid).snapshot.paper.results[0]
    assert.equal(after.revision, before.revision + 1, 'manuscriptRole 变更必须推进对象 revision')
    assert.equal(after.confirmed, false, 'manuscriptRole 变更必须使旧确认失效')
    assert.notEqual(contentHashOf(after), contentHashOf(before))

    // dropped 边界：排除出正文
    before = store.snapshotOf(pid).snapshot.paper.results[1]
    executePaperCommands(store, refOf(pid), { mutationId: nextMutation('drop'), operations: [{ command: 'paper.update-result', payload: { resultId: 'res-2', status: 'dropped' } }] })
    after = store.snapshotOf(pid).snapshot.paper.results[1]
    assert.equal(after.revision, before.revision + 1, 'status 跨越 dropped 必须推进 revision')
    assert.equal(after.confirmed, false, 'status 跨越 dropped 必须使旧确认失效')

    // 非 dropped 的执行事实：不失效
    before = store.snapshotOf(pid).snapshot.paper.results[2]
    executePaperCommands(store, refOf(pid), { mutationId: nextMutation('progress'), operations: [{ command: 'paper.update-result', payload: { resultId: 'res-3', status: 'in_progress' } }] })
    after = store.snapshotOf(pid).snapshot.paper.results[2]
    assert.equal(after.revision, before.revision, 'status 未跨越 dropped 不推进 revision')
    assert.equal(after.confirmed, true, '执行性状态更新不使确认失效')

    // purpose 属于确认摘要
    before = store.snapshotOf(pid).snapshot.paper.results[2]
    executePaperCommands(store, refOf(pid), { mutationId: nextMutation('purpose'), operations: [{ command: 'paper.update-result', payload: { resultId: 'res-3', purpose: '新的科学目的' } }] })
    after = store.snapshotOf(pid).snapshot.paper.results[2]
    assert.equal(after.revision, before.revision + 1)
    assert.equal(after.confirmed, false)
  })

  test('阴性/排除/恢复场景：确认状态与 dispatch gate 一致', () => {
    const pid = seedProject()
    confirmObject(pid, 'core')
    confirmObject(pid, 'res-1')
    const gate = (id = 'res-1') => executePaperCommands(store, refOf(pid), { mutationId: nextMutation('gate'), operations: [{ command: 'paper.dispatch-gate', payload: { resultIds: [id] } }] })
    assert.equal(gate().kind, 'applied', '已确认且纳入正文 → 可派单')

    // 阴性结果（非 dropped）：执行事实，不失效确认，仍可派单
    executePaperCommands(store, refOf(pid), { mutationId: nextMutation('negative'), operations: [{ command: 'paper.update-result', payload: { resultId: 'res-1', status: 'negative', notes: '调整表述后重跑' } }] })
    assert.equal(store.snapshotOf(pid).snapshot.paper.results[0].confirmed, true)
    assert.equal(gate().kind, 'applied', '阴性但未排除的结果仍可派单')

    // 排除出正文：旧确认失效，派单被结构化拒绝
    executePaperCommands(store, refOf(pid), { mutationId: nextMutation('excluded'), operations: [{ command: 'paper.update-result', payload: { resultId: 'res-1', manuscriptRole: 'excluded' } }] })
    assert.equal(store.snapshotOf(pid).snapshot.paper.results[0].confirmed, false)
    const excludedGate = gate()
    assert.equal(excludedGate.kind, 'invalid')
    assert.match(excludedGate.reason, /已排除出正文/)

    // 恢复纳入：重新确认后恢复可派单
    executePaperCommands(store, refOf(pid), { mutationId: nextMutation('restored'), operations: [{ command: 'paper.update-result', payload: { resultId: 'res-1', manuscriptRole: 'main' } }] })
    confirmObject(pid, 'res-1')
    assert.equal(gate().kind, 'applied')

    // dropped：排除出正文，旧确认失效，派单拒绝；恢复 planned 后重新确认可派单
    executePaperCommands(store, refOf(pid), { mutationId: nextMutation('drop'), operations: [{ command: 'paper.update-result', payload: { resultId: 'res-1', status: 'dropped' } }] })
    assert.equal(store.snapshotOf(pid).snapshot.paper.results[0].confirmed, false)
    const droppedGate = gate()
    assert.equal(droppedGate.kind, 'invalid')
    assert.match(droppedGate.reason, /已排除出正文/)
    executePaperCommands(store, refOf(pid), { mutationId: nextMutation('undrop'), operations: [{ command: 'paper.update-result', payload: { resultId: 'res-1', status: 'planned' } }] })
    confirmObject(pid, 'res-1')
    assert.equal(gate().kind, 'applied')
  })

  test('UI 静态护栏：dock 展示研究问题；Result 超过 5 个默认折叠（软提醒）', () => {
    const dock = readFileSync(fileURLToPath(new URL('../client-src/conversation/ScienceDock.jsx', import.meta.url)), 'utf8')
    assert.match(dock, /paper\.question/, 'dock 必须展示研究问题（只写 question 也能在卡上看到）')
    const spine = readFileSync(fileURLToPath(new URL('../client-src/workbench/PaperSpinePage.jsx', import.meta.url)), 'utf8')
    assert.match(spine, /previewLimit/, '工作台必须对超过 5 个 Result 做折叠')
    assert.match(spine, /显示全部/, '折叠后必须提供展开入口')
    assert.match(spine, /软提醒/, '折叠提示必须说明超过 5 个只是软提醒')
  })
})
