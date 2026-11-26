import { changeExpertConfig } from '../lib/project-experts.js'
// 路线 B T2 回归：团队成员与任务成为项目内对象。
// 依据：任务书 T2 必测矩阵——A/B 同名成员 childId 不同；status 不串项目；
// A 不能唤醒或更新 B 的任务/成员；审查任务有项目归属并被正确过滤。
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-routeb-team-objects-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { executePaperCommands, contentHashOf } = await import('../lib/project-domain.js')
const { registerTeamTools, sanitizeTeamState } = await import('../lib/team.js')
const { registerStateRoute } = await import('../lib/httpdata.js')
const { DEFAULT_TEAM, ROLES } = await import('../lib/roles.js')

const dataDir = join(home, 'dsh-science')
let store = null

function resetHome() {
  if (store) { try { store.close() } catch { /* ignore */ } store = null }
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  mkdirSync(dataDir, { recursive: true })
  store = ProjectStore.open(home)
}

const sessions = {}
function sessionOf(id, parentSession = null) {
  return { id, header: { version: 1, id, createdAt: 1, parentSession, isSeeded: false } }
}
const sessionsSvc = { get: (id) => sessions[id] }
function seedSessionMap(entries) {
  for (const key of Object.keys(sessions)) delete sessions[key]
  for (const [id, value] of Object.entries(entries)) sessions[id] = value
}

const LEAD_A = { id: 'lead-a' }
const LEAD_B = { id: 'lead-b' }
const refOf = (pid, root) => ({
  projectId: pid,
  rootSessionId: root,
  currentSessionId: root,
  relationship: 'root',
  capabilities: { read: true, propose: true, writePaper: true, dispatch: true },
})

function seedProject(root, title) {
  const pid = store.createProject({ rootSessionId: root, title })
  executePaperCommands(store, refOf(pid, root), {
    mutationId: `seed-${root}`,
    operations: [
      { command: 'paper.propose-core', payload: { title, claim: '核心主张' } },
      { command: 'paper.propose-result', payload: { title: 'R1', claim: 'R1' } },
    ],
  })
  const snap = store.snapshotOf(pid).snapshot
  const confirmOps = []
  for (const object of [snap.paper.core, snap.paper.results[0]]) {
    confirmOps.push({
      command: 'paper.confirm-revision',
      payload: {
        objectId: object === snap.paper.core ? 'core' : object.id,
        expectedObjectRevision: object.revision,
        expectedHash: contentHashOf(object),
      },
    })
  }
  executePaperCommands(store, refOf(pid, root), { mutationId: `confirm-${root}`, operations: confirmOps })
  return pid
}

function setupTeam() {
  const tools = {}
  const messages = []
  const ctx = {
    get(name) {
      if (name === 'sessions') return sessionsSvc
      return undefined
    },
    tools: { register: (def) => { tools[def.name] = def } },
    subagents: {
      async startActivation(opts) { return { childId: opts.childId } },
      async sendMessage(agent, childId, content) {
        messages.push({ agent, childId, text: content.map((block) => block.text).join('') })
      },
    },
  }
  registerTeamTools(ctx, { store })
  return { tools, messages }
}

const teamState = () => JSON.parse(readFileSync(join(dataDir, 'team.json'), 'utf8'))

function stateHarness() {
  const handlers = {}
  const server = { register: (def) => { handlers[def.path] = def.handler; return () => {} } }
  const ctx = {
    get(name) {
      if (name === 'webServer' || name === 'httpServer') return server
      if (name === 'sessions') return sessionsSvc
      return undefined
    },
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register() {} },
  }
  registerStateRoute(ctx, { store })
  return async (path) => {
    let status = 0
    let body = ''
    const res = { writeHead: (code) => { status = code }, end: (b) => { body = String(b || '') } }
    await handlers[path.split('?')[0]]({ url: path, headers: {} }, res)
    return { status, body }
  }
}

describe('T2：项目内成员与任务', () => {
  beforeEach(() => {
    resetHome()
    seedSessionMap({ 'lead-a': sessionOf('lead-a'), 'lead-b': sessionOf('lead-b') })
  })

  test('A/B 各自 spawn_all 得到同名成员但 childId 不同；status 不串项目', async () => {
    for (const lead of [LEAD_A, LEAD_B]) {
      const projectId = store.bindingOfRootSession(lead.id)?.projectId || store.createProject({ rootSessionId: lead.id, title: '测试' })
      for (const role of DEFAULT_TEAM) changeExpertConfig(projectId, { action: 'add', role })
    }
    const { tools } = setupTeam()
    const a = await tools.sci_team_spawn_all.execute({}, { agent: LEAD_A })
    const b = await tools.sci_team_spawn_all.execute({}, { agent: LEAD_B })
    assert.equal(a.results.filter((row) => row.ok).length, DEFAULT_TEAM.length)
    assert.equal(b.results.filter((row) => row.ok).length, DEFAULT_TEAM.length)

    const state = teamState()
    for (const role of DEFAULT_TEAM) {
      const name = ROLES[role].member
      const same = state.members.filter((m) => m.name === name)
      assert.equal(same.length, 2, `成员 ${name} 应在两个项目各有一份`)
      assert.equal(new Set(same.map((m) => m.childId)).size, 2)
      assert.deepEqual(same.map((m) => m.rootSessionId).sort(), ['lead-a', 'lead-b'])
    }

    const statusA = await tools.sci_team_status.execute({}, { agent: LEAD_A })
    const statusB = await tools.sci_team_status.execute({}, { agent: LEAD_B })
    assert.equal(statusA.members.length, DEFAULT_TEAM.length)
    assert.equal(statusB.members.length, DEFAULT_TEAM.length)
    const aChildIds = new Set(statusA.members.map((m) => m.childId))
    assert.equal(statusB.members.some((m) => aChildIds.has(m.childId)), false, 'status B 出现了 A 的成员 childId')
  })

  test('A 不能跨项目唤醒成员：同名只触达本项目成员，本项目不存在的成员被拒绝', async () => {
    for (const lead of [LEAD_A, LEAD_B]) {
      const projectId = store.bindingOfRootSession(lead.id)?.projectId || store.createProject({ rootSessionId: lead.id, title: '测试' })
      for (const role of DEFAULT_TEAM) changeExpertConfig(projectId, { action: 'add', role })
    }
    const { tools, messages } = setupTeam()
    await tools.sci_team_spawn_all.execute({}, { agent: LEAD_A })
    await tools.sci_team_spawn_all.execute({}, { agent: LEAD_B })
    const stateAfter = teamState()
    const reviewerA = stateAfter.members.find((m) => m.name === 'reviewer' && m.rootSessionId === 'lead-a')
    const reviewerB = stateAfter.members.find((m) => m.name === 'reviewer' && m.rootSessionId === 'lead-b')
    assert.notEqual(reviewerA.childId, reviewerB.childId)

    messages.length = 0
    const sent = await tools.sci_team_send.execute({ to: 'reviewer', message: 'A 的审查请求' }, { agent: LEAD_A })
    assert.equal(sent.ok, true)
    assert.equal(messages.length, 1)
    assert.equal(messages[0].childId, reviewerA.childId, 'A 只能唤醒 A 项目的 reviewer')
    assert.equal(messages.some((m) => m.childId === reviewerB.childId), false)

    // 只属于 B 的成员名（自定义名）在 A 中不可达。
    const onlyB = await tools.sci_team_spawn.execute({ role: 'analyst', name: 'b-only' }, { agent: LEAD_B })
    assert.equal(onlyB.ok, true)
    messages.length = 0
    await assert.rejects(
      tools.sci_team_send.execute({ to: 'b-only', message: '跨项目消息' }, { agent: LEAD_A }),
      /不在当前项目|不可达/,
    )
    assert.equal(messages.length, 0)
  })

  test('A 不能更新或删除 B 的任务；blocked_by 不能引用其他项目任务', async () => {
    const pidA = seedProject('lead-a', 'A')
    const pidB = seedProject('lead-b', 'B')
    void pidA
    void pidB
    writeFileSync(join(dataDir, 'team.json'), JSON.stringify({
      members: [
        { name: 'analyst', role: 'analyst', childId: 'child-a', parentSessionId: 'lead-a', rootSessionId: 'lead-a', projectId: pidA },
        { name: 'analyst', role: 'analyst', childId: 'child-b', parentSessionId: 'lead-b', rootSessionId: 'lead-b', projectId: pidB },
      ],
      tasks: [
        { id: 'task-1', subject: 'A 任务', status: 'pending', assignee: 'analyst', rootSessionId: 'lead-a', projectId: pidA },
        { id: 'task-2', subject: 'B 任务', status: 'pending', assignee: 'analyst', rootSessionId: 'lead-b', projectId: pidB },
      ],
      taskSeq: 2,
    }), 'utf8')
    const { tools } = setupTeam()

    await assert.rejects(
      tools.sci_team_update_task.execute({ task_id: 'task-2', status: 'completed' }, { agent: LEAD_A }),
      /属于另一个会话|不能跨项目/,
    )
    await assert.rejects(
      tools.sci_team_delete_task.execute({ task_id: 'task-2' }, { agent: LEAD_A }),
      /属于另一个会话|不能跨项目/,
    )
    const own = await tools.sci_team_update_task.execute({ task_id: 'task-1', status: 'completed' }, { agent: LEAD_A })
    assert.equal(own.status, 'completed')

    // blocked_by 指向其他项目的任务：hard 闸门按“不存在或不属于当前项目”拒绝。
    writeFileSync(join(dataDir, 'config.json'), JSON.stringify({ blockedGate: 'hard' }), 'utf8')
    await assert.rejects(
      tools.sci_team_dispatch.execute(
        { subject: 'A 后续', task_desc: 'x', blocked_by: ['task-2'], result_id: 'res-1' },
        { agent: LEAD_A },
      ),
      /task-2/,
    )
  })

  test('审查任务带项目归属，且 /state 只投影所属项目', async () => {
    const pidA = seedProject('lead-a', 'A')
    const pidB = seedProject('lead-b', 'B')
    for (const lead of [LEAD_A, LEAD_B]) {
      const projectId = store.bindingOfRootSession(lead.id)?.projectId || store.createProject({ rootSessionId: lead.id, title: '测试' })
      for (const role of DEFAULT_TEAM) changeExpertConfig(projectId, { action: 'add', role })
    }
    const { tools } = setupTeam()
    await tools.sci_team_spawn_all.execute({}, { agent: LEAD_A })
    await tools.sci_team_spawn_all.execute({}, { agent: LEAD_B })
    const reviewA = await tools.sci_review_send.execute({ scope: 'turn', target: 'A' }, { agent: LEAD_A })
    const reviewB = await tools.sci_review_send.execute({ scope: 'turn', target: 'B' }, { agent: LEAD_B })
    const board = teamState()
    const taskA = board.tasks.find((t) => t.id === reviewA.taskId)
    const taskB = board.tasks.find((t) => t.id === reviewB.taskId)
    assert.equal(taskA.rootSessionId, 'lead-a')
    assert.equal(taskA.projectId, pidA)
    assert.equal(taskA.isReview, true)
    assert.equal(taskB.rootSessionId, 'lead-b')
    assert.equal(taskB.projectId, pidB)

    const call = stateHarness()
    const a = await call('/plugins/dsh-science/state?sessionId=lead-a')
    const b = await call('/plugins/dsh-science/state?sessionId=lead-b')
    assert.equal(a.status, 200, a.body)
    assert.equal(b.status, 200, b.body)
    const payloadA = JSON.parse(a.body)
    const payloadB = JSON.parse(b.body)
    assert.deepEqual(payloadA.team.tasks.map((t) => t.id), [reviewA.taskId])
    assert.deepEqual(payloadB.team.tasks.map((t) => t.id), [reviewB.taskId])
    assert.equal(payloadA.team.tasks.some((t) => t.id === reviewB.taskId), false)
    assert.equal(payloadB.team.tasks.some((t) => t.id === reviewA.taskId), false)
  })
})

describe('T2：旧团队台账迁移', () => {
  beforeEach(() => { resetHome() })

  test('成员沿 parentSessionId 回填；任务只在唯一同名成员时回填，否则 legacy-unscoped', () => {
    const parsed = {
      members: [
        { name: 'reviewer', role: 'reviewer', childId: 'child-a', parentSessionId: 'lead-a' },
        { name: 'reviewer', role: 'reviewer', childId: 'child-b', parentSessionId: 'lead-b' },
        { name: 'ghost', role: 'writer', childId: 'child-c' },
      ],
      tasks: [
        { id: 'task-1', assignee: 'reviewer', isReview: true },
        { id: 'task-2', subject: '无归属', resultId: 'res-1' },
      ],
      taskSeq: 2,
    }
    const ambiguous = sanitizeTeamState(parsed, { store })
    assert.equal(ambiguous.members.find((m) => m.childId === 'child-a').rootSessionId, 'lead-a', '父会话链接应回填 root')
    assert.equal(ambiguous.members.find((m) => m.childId === 'child-c').legacyUnscoped, true, '无链接成员标 legacy-unscoped')
    assert.equal(ambiguous.tasks.find((t) => t.id === 'task-1').legacyUnscoped, true, '两个项目都有 reviewer，无法唯一回填')
    assert.equal(ambiguous.tasks.find((t) => t.id === 'task-2').legacyUnscoped, true, 'res-N 不得用于推断归属')

    const unique = sanitizeTeamState({ ...parsed, members: parsed.members.slice(0, 1) }, { store })
    const migrated = unique.tasks.find((t) => t.id === 'task-1')
    assert.equal(migrated.rootSessionId, 'lead-a', '唯一同名成员可回填 root')
    assert.equal(migrated.legacyUnscoped, undefined)

    const explicit = sanitizeTeamState({ members: [], tasks: [{ id: 'task-9', rootSessionId: 'lead-x', projectId: 'proj-x' }] }, { store })
    assert.equal(explicit.tasks[0].rootSessionId, 'lead-x')
    assert.equal(explicit.tasks[0].projectId, 'proj-x')
  })
})
