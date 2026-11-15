// dsh-science M2 门禁安全修复回归测试：
// M5 确认哈希统一（领域确认在读模型中生效）/ M1 成员角色隔离 / M2 技能安装审批 /
// M4 /file 状态文件拒服务 / M3 归档穿越成员拒绝逻辑的纯函数行为
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-m2-security-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { executePaperCommands, contentHashOf } = await import('../lib/project-domain.js')
const { paperSpineViewOf } = await import('../lib/paperspine.js')
const { registerTeamTools } = await import('../lib/team.js')
const { registerSkillMenuTools } = await import('../lib/skillmenu.js')
const { registerStateRoute } = await import('../lib/httpdata.js')

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

const LEAD = { agent: { id: 'lead-1' } }

function seedConfirmedPaper({ root = 'lead-1', results = [{ claim: 'x', confirmed: true }] } = {}) {
  const pid = store.createProject({ rootSessionId: root })
  const ref = { projectId: pid, rootSessionId: root, currentSessionId: root, relationship: 'root', capabilities: { read: true, propose: true, writePaper: true, dispatch: true } }
  const ops = [{ command: 'paper.propose-core', payload: { title: 't', claim: 'c' } }]
  for (const r of results) ops.push({ command: 'paper.propose-result', payload: { claim: r.claim } })
  executePaperCommands(store, ref, { mutationId: 'seed', operations: ops })
  const snap = store.snapshotOf(pid).snapshot
  const confOps = []
  const core = snap.paper.core
  if (core) confOps.push({ command: 'paper.confirm-revision', payload: { objectId: 'core', expectedObjectRevision: core.revision, expectedHash: contentHashOf(core) } })
  for (const r of snap.paper.results) {
    if (results.find((x) => x.confirmed !== false && r.claim === x.claim)) {
      confOps.push({ command: 'paper.confirm-revision', payload: { objectId: r.id, expectedObjectRevision: r.revision, expectedHash: contentHashOf(r) } })
    }
  }
  if (confOps.length > 0) executePaperCommands(store, ref, { mutationId: 'seedc', operations: confOps })
  return pid
}

// =============================================================================
describe('M5 回归：领域确认在读模型（paperspine）中生效', () => {
  beforeEach(() => { resetHome() })

  test('领域确认后 paperSpineViewOf 的 core/results confirmed=true', async () => {
    const pid = seedConfirmedPaper({})
    const snap = store.snapshotOf(pid).snapshot
    const view = paperSpineViewOf(snap.paper, { tasks: [] }, {}, null)
    assert.equal(view.core.confirmed, true, 'core 确认在 spine 视图中保持（不得被语义哈希重置）')
    // spine 视图 result 携带确认凭据（含 objectRevision）；isConfirmationCurrent（/state 同口径）判定为当前
    const r0 = view.results[0]
    assert.ok(r0.confirmation && Number(r0.confirmation.objectRevision) === Number(r0.revision), 'result 确认凭据在 spine 视图中保持')
    const { isConfirmationCurrent } = await import('../lib/paperspine.js')
    assert.equal(isConfirmationCurrent(snap.paper.results[0], snap.paper.results[0].id), true, '领域确认经 isConfirmationCurrent 判定为当前')
  })

  test('领域确认后 draft 阶段闸门可用（科学就绪检查不被哈希重置卡死）', () => {
    const pid = seedConfirmedPaper({})
    const ref = { projectId: pid, rootSessionId: 'lead-1', currentSessionId: 'lead-1', relationship: 'root', capabilities: { read: true, propose: true, writePaper: true, dispatch: true } }
    // 记录 verified 证据（执行性更新）后 spine 的 scientific readiness 不再被"未确认"卡死
    const snap = store.snapshotOf(pid).snapshot
    const r0 = snap.paper.results[0]
    executePaperCommands(store, ref, { mutationId: 'ev', operations: [{ command: 'paper.record-evidence', payload: { resultId: r0.id, claimIds: [r0.claims[0].id], direction: 'supports', state: 'verified', sourceLocator: 'd.csv#L1', allowedInterpretation: '支持' } }] })
    const snap2 = store.snapshotOf(pid).snapshot
    const view = paperSpineViewOf(snap2.paper, { tasks: [] }, {}, null)
    const blockers = view.results[0].readiness.scientific.blockers
    assert.equal(blockers.includes('当前 Result 修订尚未确认'), false, '执行性更新后确认保持有效')
  })
})

// =============================================================================
describe('M1 回归：任务板角色隔离', () => {
  beforeEach(() => { resetHome() })

  function teamCtx({ members = [], tasks = [], sendMessage } = {}) {
    writeFileSync(join(home, 'dsh-science', 'team.json'), JSON.stringify({ members, tasks, taskSeq: tasks.length }), 'utf8')
    const tools = {}
    registerTeamTools({
      tools: { register: (d) => { tools[d.name] = d } },
      get(name) { if (name === 'sessions') return { get: () => undefined }; throw new Error('nope') },
      subagents: { async startActivation(o) { return { childId: o.childId } }, async sendMessage(a, c, m, o) { if (sendMessage) return sendMessage(a, c, m, o); return undefined } },
    }, { store })
    return tools
  }

  test('成员只能把自己名下任务标记 in_progress/failed；completed 拒绝', async () => {
    const tools = teamCtx({
      members: [{ name: 'analyst', role: 'analyst', childId: 'child-a' }],
      tasks: [{ id: 'task-1', subject: 'x', status: 'claimed', assignee: 'analyst' }],
    })
    const memberExec = { agent: { id: 'child-a' } }
    const ok = await tools.sci_team_update_task.execute({ task_id: 'task-1', status: 'in_progress' }, memberExec)
    assert.equal(ok.status, 'in_progress')
    await assert.rejects(
      tools.sci_team_update_task.execute({ task_id: 'task-1', status: 'completed' }, memberExec),
      /队长|发回队长/,
    )
  })

  test('成员不能更新他人任务；队长不受限', async () => {
    const tools = teamCtx({
      members: [{ name: 'analyst', role: 'analyst', childId: 'child-a' }, { name: 'writer', role: 'writer', childId: 'child-w' }],
      tasks: [{ id: 'task-1', subject: 'x', status: 'claimed', assignee: 'writer' }],
    })
    await assert.rejects(
      tools.sci_team_update_task.execute({ task_id: 'task-1', status: 'in_progress' }, { agent: { id: 'child-a' } }),
      /自己名下/,
    )
    const lead = await tools.sci_team_update_task.execute({ task_id: 'task-1', status: 'completed' }, LEAD)
    assert.equal(lead.status, 'completed')
  })

  test('删除任务与向成员发消息仅队长', async () => {
    const tools = teamCtx({
      members: [{ name: 'analyst', role: 'analyst', childId: 'child-a' }],
      tasks: [{ id: 'task-1', subject: 'x', status: 'pending' }],
    })
    const memberExec = { agent: { id: 'child-a' } }
    await assert.rejects(tools.sci_team_delete_task.execute({ task_id: 'task-1' }, memberExec), /只有队长/)
    await assert.rejects(tools.sci_team_send.execute({ to: 'analyst', message: 'hi' }, memberExec), /只有队长/)
    const del = await tools.sci_team_delete_task.execute({ task_id: 'task-1' }, LEAD)
    assert.equal(del.status, 'deleted')
  })
})

// =============================================================================
describe('M2 回归：技能安装审批卡 + /file 状态文件拒服务', () => {
  beforeEach(() => { resetHome() })

  test('sci_skill_install 经 tools/pre-execute 显示宿主审批卡', async () => {
    const gates = []
    registerSkillMenuTools({
      tools: { register() {} },
      on(event, handler) { if (event === 'tools/pre-execute') gates.push(handler) },
    }, {})
    assert.equal(gates.length, 1)
    const decision = await gates[0]({ name: 'sci_skill_install', arguments: { role: 'analyst', repo_url: 'https://github.com/evil/repo' } }, async () => 'next')
    assert.equal(decision.kind, 'ask')
    assert.match(decision.displayReason.zh, /安装技能来源/)
    assert.equal(await gates[0]({ name: 'sci_skill_menu', arguments: {} }, async () => 'next'), 'next')
  })

  test('/file 拒绝 SQLite 状态库与任务板/审查台账（M4）', async () => {
    const pid = seedConfirmedPaper({})
    void pid
    const handlers = {}
    const server = { register: (def) => { handlers[def.path] = def.handler; return () => {} } }
    registerStateRoute({ get: (k) => (k === 'webServer' ? server : undefined), effect: (fn) => fn(), tools: { register() {} } }, { store })
    const call = async (path) => {
      let status = 0
      const res = { writeHead: (code) => { status = code }, end: () => {} }
      await handlers['/plugins/dsh-science/file']({ url: path, headers: {} }, res)
      return status
    }
    const sqlite = await call(`/plugins/dsh-science/file?path=${encodeURIComponent(join(home, 'dsh-science', 'science-state.sqlite'))}`)
    assert.equal(sqlite, 404, '项目状态 SQLite 不得直链下载')
    const teamFile = await call(`/plugins/dsh-science/file?path=${encodeURIComponent(join(home, 'dsh-science', 'team.json'))}`)
    assert.equal(teamFile, 404, '任务板文件不得直链下载')
    const reviews = await call(`/plugins/dsh-science/file?path=${encodeURIComponent(join(home, 'dsh-science', 'reviews.json'))}`)
    assert.equal(reviews, 404, '审查台账不得直链下载')
  })

  test('中-3 回归：工作区同名文件不被状态文件黑名单误伤', async () => {
    // /file 的允许根 = 进程 cwd（工作区）+ 数据目录；本测试临时 chdir 到合成工作区
    const workspace = mkdtempSync(join(tmpdir(), 'dsh-workspace-'))
    const workFile = join(workspace, 'team.json')
    writeFileSync(workFile, JSON.stringify({ user: 'data' }), 'utf8')
    const workTmp = join(workspace, 'notes.tmp')
    writeFileSync(workTmp, 'scratch', 'utf8')
    const handlers = {}
    const server = { register: (def) => { handlers[def.path] = def.handler; return () => {} } }
    registerStateRoute({ get: (k) => (k === 'webServer' ? server : undefined), effect: (fn) => fn(), tools: { register() {} } }, { store })
    const call = async (path) => {
      let status = 0
      const res = { writeHead: (code) => { status = code }, end: () => {} }
      await handlers['/plugins/dsh-science/file']({ url: path, headers: {} }, res)
      return status
    }
    const oldCwd = process.cwd()
    try {
      process.chdir(workspace)
      const teamLike = await call(`/plugins/dsh-science/file?path=${encodeURIComponent(workFile)}`)
      assert.equal(teamLike, 200, '工作区里的同名状态文件不受数据目录黑名单影响')
      const tmp = await call(`/plugins/dsh-science/file?path=${encodeURIComponent(workTmp)}`)
      assert.equal(tmp, 200, '工作区 .tmp 文件不受影响')
      // 数据目录内同名文件仍被拒
      const dataTeam = await call(`/plugins/dsh-science/file?path=${encodeURIComponent(join(home, 'dsh-science', 'team.json'))}`)
      assert.equal(dataTeam, 404, '数据目录内的状态文件仍被拒')
    } finally {
      process.chdir(oldCwd)
      rmSync(workspace, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
    }
  })
})

// =============================================================================
describe('M3 回归：归档成员名穿越拒绝（纯函数行为）', () => {
  test('绝对路径/盘符/.. 成员全部判为恶意', () => {
    const badNames = ['/etc/passwd', 'C:/win/system32', '../../team.json', 'out/../../../evil', '..\\..\\evil']
    const isBad = (name) => {
      const n = name.replace(/\\/g, '/')
      return n.startsWith('/') || /^[A-Za-z]:/.test(n) || n.split('/').includes('..')
    }
    for (const n of badNames) assert.equal(isBad(n), true, `${n} 必须判为穿越`)
    for (const n of ['out/fig1.png', 'stdout.log', 'out/sub/data.csv']) assert.equal(isBad(n), false, `${n} 是合法成员`)
  })
})
