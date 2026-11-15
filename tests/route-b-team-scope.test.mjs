// 路线 B T0 红灯：团队成员与任务必须按项目（root session）作用域工作。
// 依据：验收 R1 B4 / 任务书 T2；设计真源 §7.2（一个工作区可以有多个项目、每个项目
// 独立默认编制）、§20.2（两个项目并行时状态、成员和产物不串）。
//
// 期望行为（修复后）：成员稳定身份是 (rootSessionId, name)，默认显示名可跨项目重复；
// spawn_all 在第二个项目必须生成同名成员而不是静默跳过；sci_team_status 只返回当前
// 项目的成员与任务；审查任务同样写入 rootSessionId 归属。
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-routeb-team-scope-'))
process.env.DSH_HOME = home

const { registerTeamTools } = await import('../lib/team.js')
const { DEFAULT_TEAM, ROLES } = await import('../lib/roles.js')
const { ProjectStore } = await import('../lib/project-store.js')

const dataDir = join(home, 'dsh-science')
let store = null

const teamState = () => JSON.parse(readFileSync(join(dataDir, 'team.json'), 'utf8'))

function resetHome() {
  if (store) { try { store.close() } catch { /* ignore */ } store = null }
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  mkdirSync(dataDir, { recursive: true })
  store = ProjectStore.open(home)
}

function setupTeam({ members = [], tasks = [], taskSeq = 0 } = {}) {
  if (members.length > 0 || tasks.length > 0) {
    writeFileSync(join(dataDir, 'team.json'), JSON.stringify({ members, tasks, taskSeq }), 'utf8')
  }
  const tools = {}
  const activations = []
  const messages = []
  const subagents = {
    async startActivation(opts) {
      activations.push(opts)
      return { childId: opts.childId }
    },
    async sendMessage(agent, childId, msgs) {
      messages.push({ agent, childId, text: msgs[0] && msgs[0].text })
    },
  }
  registerTeamTools({ tools: { register: (def) => { tools[def.name] = def } }, subagents }, { store })
  return { tools, activations, messages }
}

const LEAD_A = { id: 'lead-a' }
const LEAD_B = { id: 'lead-b' }

describe('T0 红灯：多项目默认团队与任务板作用域', () => {
  beforeEach(() => { resetHome() })

  test('第二个项目 spawn_all：同名默认成员必须各建一份，不得静默跳过', async () => {
    const { tools, activations } = setupTeam()

    const first = await tools.sci_team_spawn_all.execute({}, { agent: LEAD_A })
    assert.equal(first.results.filter((row) => row.ok).length, DEFAULT_TEAM.length, '项目 A 应建立完整默认编制')

    const second = await tools.sci_team_spawn_all.execute({}, { agent: LEAD_B })
    const skipped = second.results.filter((row) => row.skipped)
    assert.deepEqual(
      skipped,
      [],
      `项目 B 的默认团队被跳过（成员名被当成全局唯一）：${JSON.stringify(skipped)}`,
    )
    assert.equal(second.results.filter((row) => row.ok).length, DEFAULT_TEAM.length, '项目 B 也必须建立完整默认编制')

    const state = teamState()
    assert.equal(state.members.length, DEFAULT_TEAM.length * 2, '两个项目应各有一整套默认成员')
    assert.equal(activations.length, DEFAULT_TEAM.length * 2)
    for (const role of DEFAULT_TEAM) {
      const name = ROLES[role].member
      const sameName = state.members.filter((member) => member.name === name)
      assert.equal(sameName.length, 2, `成员 ${name} 应在项目 A/B 各有一份`)
      assert.equal(new Set(sameName.map((member) => member.childId)).size, 2, `成员 ${name} 在两个项目应有不同 childId`)
    }
  })

  test('sci_team_status 只返回当前项目的成员与任务', async () => {
    const { tools } = setupTeam({
      members: [
        { name: 'analyst', role: 'analyst', childId: 'child-a', parentSessionId: 'lead-a' },
        { name: 'writer', role: 'writer', childId: 'child-b', parentSessionId: 'lead-b' },
      ],
      tasks: [
        { id: 'task-1', subject: 'A 项目任务', status: 'pending', assignee: 'analyst', rootSessionId: 'lead-a' },
        { id: 'task-2', subject: 'B 项目任务', status: 'pending', assignee: 'writer', rootSessionId: 'lead-b' },
      ],
      taskSeq: 2,
    })

    const a = await tools.sci_team_status.execute({}, { agent: LEAD_A })
    assert.deepEqual(a.members.map((member) => member.name), ['analyst'], '项目 A 状态出现了 B 的成员')
    assert.deepEqual(a.tasks.map((task) => task.id), ['task-1'], '项目 A 状态出现了 B 的任务')

    const b = await tools.sci_team_status.execute({}, { agent: LEAD_B })
    assert.deepEqual(b.members.map((member) => member.name), ['writer'], '项目 B 状态出现了 A 的成员')
    assert.deepEqual(b.tasks.map((task) => task.id), ['task-2'], '项目 B 状态出现了 A 的任务')
  })

  test('sci_review_send 创建的审查任务写入当前项目归属', async () => {
    const { tools } = setupTeam()
    const out = await tools.sci_review_send.execute({ scope: 'turn', target: 'A 项目最新回答' }, { agent: LEAD_A })
    assert.equal(out.ok, true)
    const task = teamState().tasks.find((row) => row.id === out.taskId)
    assert.ok(task, '审查任务必须落在任务板上')
    assert.equal(
      task.rootSessionId,
      'lead-a',
      '审查任务缺少 rootSessionId：项目视图无法把它与 B 的同名成员/任务分开',
    )
  })
})
