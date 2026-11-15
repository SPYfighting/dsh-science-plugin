// dsh-science 综合复核 A 修复回归测试：
// 高-1 project-binding.act 默认 fetch / 高-2 审查覆盖按会话作用域 /
// 中-1 技能引用存在性护栏 / 中-2 任务板跨 root 隔离
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-compA-fix-'))
process.env.DSH_HOME = home

const { createProjectBinding } = await import('../client-src/project/project-binding.js')
const { reviewCoverageOf } = await import('../lib/reviewcov.js')
const { registerTeamTools } = await import('../lib/team.js')
const { ProjectStore } = await import('../lib/project-store.js')
const { executePaperCommands, contentHashOf } = await import('../lib/project-domain.js')

let store = null

function resetHome() {
  if (store) { try { store.close() } catch { /* ignore */ } store = null }
  rmSync(join(home, 'dsh-science'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  mkdirSync(join(home, 'dsh-science'), { recursive: true })
  store = ProjectStore.open(home)
}

// ---- 高-1：act 默认 fetch 路径（不传 fetchImpl）-------------------------------
describe('高-1 回归：project-binding.act 走默认 fetch', () => {
  test('act 不传 fetchImpl 也能完成请求（生产 dock 路径）', async () => {
    const calls = []
    const origFetch = globalThis.fetch
    globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, json: async () => ({ kind: 'applied', receipt: { projectId: 'p1' } }) } }
    try {
      const binding = createProjectBinding({ getSessionId: () => 's1' })
      const r = await binding.act({ actionId: 'project.ensure-binding', commandId: 'c1', payload: {} })
      assert.equal(r.status, 200)
      assert.equal(r.body.kind, 'applied')
      assert.equal(calls.length, 1)
      assert.ok(String(calls[0].url).includes('/plugins/dsh-science/project/act'))
      binding.dispose()
    } finally { globalThis.fetch = origFetch }
  })
})

// ---- 高-2：审查覆盖按会话作用域 ------------------------------------------------
describe('高-2 回归：reviewCoverageOf 不跨项目串号', () => {
  beforeEach(() => { resetHome() })

  const bp = { core: { claim: '本项目的核心主张', revision: 1, confirmed: true }, results: [{ id: 'res-1', claim: '本项目 res-1 主张', revision: 1, confirmed: true }] }

  test('其他项目的 run（不同 sessionId）不覆盖本项目结论', () => {
    const reviews = {
      'run-foreign': { id: 'run-foreign', sessionId: 'session-other-root', findings: [{ check: 'blueprint-claim', claim: 'res-1-claim-1@r1', severity: 'fail', message: '别的项目的失败结论' }] },
    }
    const cov = reviewCoverageOf(bp, reviews, 'session-my-root')
    assert.equal(cov.results[0].severity, null, '外来 run 不参与匹配')
    assert.equal(cov.counts.reviewed, 0)
  })

  test('本会话与本项目成员会话的 run 正常参与匹配', () => {
    mkdirSync(join(home, 'dsh-science'), { recursive: true })
    writeFileSync(join(home, 'dsh-science', 'team.json'), JSON.stringify({ members: [{ name: 'analyst', role: 'analyst', childId: 'child-a', parentSessionId: 'session-my-root' }], tasks: [] }), 'utf8')
    const reviews = {
      'run-member': { id: 'run-member', sessionId: 'child-a', findings: [{ check: 'blueprint-claim', claim: 'res-1-claim-1@r1', severity: 'pass', message: '成员会话审查通过' }] },
    }
    const cov = reviewCoverageOf(bp, reviews, 'session-my-root')
    assert.equal(cov.results[0].severity, 'pass')
  })

  test('无 sessionId 的旧 run 保留（兼容）', () => {
    const reviews = { 'run-legacy': { id: 'run-legacy', findings: [{ check: 'blueprint-claim', claim: 'res-1-claim-1@r1', severity: 'warn', message: '旧全局审查' }] } }
    const cov = reviewCoverageOf(bp, reviews, 'session-my-root')
    assert.equal(cov.results[0].severity, 'warn')
  })
})

// ---- 中-1：技能引用存在性护栏 ---------------------------------------------------
describe('中-1 回归：SCIENCE_SKILLS 引用的 skill 必须存在于 skills/ 清单', () => {
  test('静态护栏', async () => {
    const { SCIENCE_SKILLS } = await import('../client-src/conversation/skill-actions.js')
    const { fileURLToPath } = await import('node:url')
    const skillsDir = fileURLToPath(new URL('../skills/', import.meta.url))
    const available = new Set(readdirSync(skillsDir).filter((d) => existsSync(join(skillsDir, d, 'SKILL.md'))))
    const dangling = SCIENCE_SKILLS.filter((s) => s.skill && !available.has(s.skill)).map((s) => `${s.id}→${s.skill}`)
    assert.deepEqual(dangling, [], '技能引用不得悬空（T2.4 删命令后未同步）')
    const { SCIENCE_SKILL_TEXT } = await import('../client-src/conversation/composer-handoff.js')
    const dangling2 = Object.entries(SCIENCE_SKILL_TEXT).filter(([, v]) => v.skill && !available.has(v.skill)).map(([k, v]) => `${k}→${v.skill}`)
    assert.deepEqual(dangling2, [])
  })
})

// ---- 中-2：任务板跨 root 隔离 ---------------------------------------------------
describe('中-2 回归：任务板/成员归属校验', () => {
  beforeEach(() => { resetHome() })

  function setupTeam(tasks, members) {
    writeFileSync(join(home, 'dsh-science', 'team.json'), JSON.stringify({ members, tasks, taskSeq: tasks.length }), 'utf8')
    const tools = {}
    registerTeamTools({
      tools: { register: (d) => { tools[d.name] = d } },
      get(name) { if (name === 'sessions') return { get: () => undefined }; throw new Error('nope') },
      subagents: { async startActivation(o) { return { childId: o.childId } }, async sendMessage() { return undefined } },
    }, { store })
    return tools
  }

  test('其他 root 的任务不能被本 root 更新/删除', async () => {
    const tools = setupTeam(
      [{ id: 'task-1', subject: 'x', status: 'pending', rootSessionId: 'root-A' }],
      [],
    )
    await assert.rejects(
      tools.sci_team_update_task.execute({ task_id: 'task-1', status: 'completed' }, { agent: { id: 'root-B' } }),
      /属于另一个会话/,
    )
    await assert.rejects(
      tools.sci_team_delete_task.execute({ task_id: 'task-1' }, { agent: { id: 'root-B' } }),
      /属于另一个会话/,
    )
  })

  test('同名成员可在不同项目各建一份（不再要求换名）', async () => {
    const tools = setupTeam(
      [],
      [{ name: 'analyst', role: 'analyst', childId: 'child-a', parentSessionId: 'root-A' }],
    )
    // T2 契约变更：成员身份是 (rootSessionId, name)，其他项目的同名成员不是冲突。
    const spawned = await tools.sci_team_spawn.execute({ role: 'analyst' }, { agent: { id: 'root-B' } })
    assert.equal(spawned.ok, true)
    assert.ok(spawned.childId)
    const board = JSON.parse(readFileSync(join(home, 'dsh-science', 'team.json'), 'utf8'))
    const analysts = board.members.filter((m) => m.name === 'analyst')
    assert.equal(analysts.length, 2, '两个项目应各有一份同名成员')
    assert.equal(new Set(analysts.map((m) => m.rootSessionId || m.parentSessionId)).size, 2)
    const reused = await tools.sci_team_spawn.execute({ role: 'analyst' }, { agent: { id: 'root-B' } })
    assert.equal(reused.reused, true, '同一项目内同名 spawn 仍复用')
    assert.equal(reused.childId, spawned.childId)
  })

  test('dispatch 给其他 root 的成员被拒', async () => {
    mkdirSync(join(home, 'dsh-science'), { recursive: true })
    const pid = store.createProject({ rootSessionId: 'root-B' })
    const ref = { projectId: pid, rootSessionId: 'root-B', currentSessionId: 'root-B', relationship: 'root', capabilities: { read: true, propose: true, writePaper: true, dispatch: true } }
    executePaperCommands(store, ref, { mutationId: 's', operations: [
      { command: 'paper.propose-core', payload: { claim: 'C' } },
      { command: 'paper.propose-result', payload: { claim: 'R' } },
    ] })
    let snap = store.snapshotOf(pid).snapshot
    const core = snap.paper.core
    const r1 = snap.paper.results[0]
    executePaperCommands(store, ref, { mutationId: 'c', operations: [
      { command: 'paper.confirm-revision', payload: { objectId: 'core', expectedObjectRevision: core.revision, expectedHash: contentHashOf(core) } },
      { command: 'paper.confirm-revision', payload: { objectId: r1.id, expectedObjectRevision: r1.revision, expectedHash: contentHashOf(r1) } },
    ] })
    const tools = setupTeam(
      [],
      [{ name: 'scout', role: 'literature-scout', childId: 'child-a', parentSessionId: 'root-A' }],
    )
    // web 组合语义：sessions 服务返回 live session（root-B 在线）——
    // setupTeam 的 ctx 无 sessions，这里直接构造带 sessions 的 ctx 变体：
    const dispatchTools = {}
    registerTeamTools({
      tools: { register: (d) => { dispatchTools[d.name] = d } },
      get(name) {
        if (name === 'sessions') return { get: (id) => (id === 'root-B' ? { id: 'root-B', header: { id: 'root-B', parentSession: null } } : undefined) }
        throw new Error('nope')
      },
      subagents: { async startActivation(o) { return { childId: o.childId } }, async sendMessage() { return undefined } },
    }, { store })
    await assert.rejects(
      dispatchTools.sci_team_dispatch.execute({ subject: 'x', task_desc: 'x', assignee: 'scout', result_id: 'res-1' }, { agent: { id: 'root-B' } }),
      /属于另一个会话|不能跨项目派单/,
    )
  })
})
