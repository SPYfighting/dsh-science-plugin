// 路线 B T0 红灯：两个项目都含 res-1 时，A 会话的读模型与审查详情不得串入 B 项目。
// 依据：验收 R1 B1 / 任务书 T1；设计真源 §7（服务端 session→ProjectRef 唯一授权）、
// §10.1（客户端只提交当前 sessionId，不能按 res-N 或 runId 跨项目寻址）。
//
// 期望行为（修复后）：/state 的 team.tasks / figures / figurePlans / reviews 全部按稳定
// 项目归属过滤；legacy-unscoped 条目不进入任何项目卡；/review 必须带当前 sessionId 并
// 校验 run 的项目归属，跨项目请求与“不存在”不可区分且不返回 B 的元数据。
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-routeb-project-isolation-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { executePaperCommands } = await import('../lib/project-domain.js')
const { registerStateRoute } = await import('../lib/httpdata.js')

const dataDir = join(home, 'dsh-science')
let store = null

function resetHome() {
  if (store) { try { store.close() } catch { /* ignore */ } store = null }
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  mkdirSync(dataDir, { recursive: true })
  store = ProjectStore.open(home)
}

const refOf = (pid, root) => ({
  projectId: pid,
  rootSessionId: root,
  currentSessionId: root,
  relationship: 'root',
  capabilities: { read: true, propose: true, writePaper: true, dispatch: true },
})

// 每个项目各自的第一条 Result 都是 res-1 —— 跨项目同名显示标识的对抗样本。
function seedProject(root, { coreTitle, resultClaim }) {
  const pid = store.createProject({ rootSessionId: root, title: coreTitle })
  executePaperCommands(store, refOf(pid, root), {
    mutationId: `seed-${root}`,
    operations: [
      { command: 'paper.propose-core', payload: { title: coreTitle, claim: '核心主张' } },
      { command: 'paper.propose-result', payload: { title: `${coreTitle} 结果`, claim: resultClaim } },
    ],
  })
  const snapshot = store.snapshotOf(pid).snapshot
  return { pid, resultId: snapshot.paper.results[0].id }
}

function seedGlobalLedgers({ pidA, pidB }) {
  // 两个项目同名 res-1：任务/审查/图件/图件计划都挂在这个显示标识上。
  // 新写入形态：任务/图件/图件计划/rev-a 带显式项目归属；rev-b 只有 sessionId（历史条目，
  // 由 T1 的稳定链接回填判定）；*‑legacy 无任何归属依据（legacy-unscoped）。
  writeFileSync(join(dataDir, 'team.json'), JSON.stringify({
    members: [
      { name: 'analyst', role: 'analyst', childId: 'child-a', parentSessionId: 'lead-a' },
      { name: 'analyst', role: 'analyst', childId: 'child-b', parentSessionId: 'lead-b' },
    ],
    tasks: [
      { id: 'task-a', subject: 'A 项目专属任务', status: 'pending', assignee: 'analyst', resultId: 'res-1', resultIds: ['res-1', 'res-1'], projectId: pidA, rootSessionId: 'lead-a', createdAt: 10 },
      { id: 'task-b', subject: 'B 项目专属任务', status: 'pending', assignee: 'analyst', resultId: 'res-1', projectId: pidB, rootSessionId: 'lead-b', createdAt: 20 },
      { id: 'task-legacy', subject: '无法归属的历史任务', status: 'pending', resultId: 'res-1', createdAt: 30 },
    ],
    taskSeq: 3,
  }), 'utf8')
  writeFileSync(join(dataDir, 'figures.json'), JSON.stringify({
    'fig-a': { id: 'fig-a', title: 'A 项目图件', resultId: 'res-1', projectId: pidA, rootSessionId: 'lead-a', registeredAt: 10 },
    'fig-b': { id: 'fig-b', title: 'B 项目图件', resultId: 'res-1', projectId: pidB, rootSessionId: 'lead-b', registeredAt: 20 },
    'fig-legacy': { id: 'fig-legacy', title: '无法归属的历史图件', resultId: 'res-1', registeredAt: 30 },
  }), 'utf8')
  writeFileSync(join(dataDir, 'figure-plans.json'), JSON.stringify({
    'plan-a': { id: 'plan-a', title: 'A 项目图件计划', resultId: 'res-1', projectId: pidA, rootSessionId: 'lead-a', status: 'planned', updatedAt: 10 },
    'plan-b': { id: 'plan-b', title: 'B 项目图件计划', resultId: 'res-1', projectId: pidB, rootSessionId: 'lead-b', status: 'planned', updatedAt: 20 },
    'plan-legacy': { id: 'plan-legacy', title: '无法归属的历史计划', resultId: 'res-1', status: 'planned', updatedAt: 30 },
  }), 'utf8')
  writeFileSync(join(dataDir, 'reviews.json'), JSON.stringify({
    'rev-a': {
      id: 'rev-a', status: 'done', trigger: 'manual', turn: 1, sessionId: 'lead-a', resultId: 'res-1',
      projectId: pidA, rootSessionId: 'lead-a',
      startedAt: 10, finishedAt: 20,
      findings: [{ severity: 'pass', check: 'blueprint-claim', message: 'A 项目审查通过' }],
    },
    'rev-b': {
      id: 'rev-b', status: 'done', trigger: 'manual', turn: 1, sessionId: 'lead-b', resultId: 'res-1',
      startedAt: 30, finishedAt: 40,
      findings: [{ severity: 'fail', check: 'blueprint-claim', message: 'B 项目机密发现' }],
    },
    'rev-legacy': {
      id: 'rev-legacy', status: 'done', trigger: 'manual', turn: 1, resultId: 'res-1',
      startedAt: 50, finishedAt: 60,
      findings: [{ severity: 'warn', check: 'blueprint-claim', message: '无法归属的历史审查' }],
    },
  }), 'utf8')
}

const sessions = {
  'lead-a': { id: 'lead-a', header: { version: 1, id: 'lead-a', parentSession: null } },
  'lead-b': { id: 'lead-b', header: { version: 1, id: 'lead-b', parentSession: null } },
}

function routeHarness() {
  const handlers = {}
  const server = { register: (def) => { handlers[def.path] = def.handler; return () => {} } }
  const ctx = {
    get(name) {
      if (name === 'webServer' || name === 'httpServer') return server
      if (name === 'sessions') return { get: (id) => sessions[id] }
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

describe('双项目同名 res-1 的项目读模型隔离（T0 红灯 → T1 转绿）', () => {
  beforeEach(() => {
    resetHome()
    const a = seedProject('lead-a', { coreTitle: 'A 项目标题', resultClaim: 'A 的 res-1 主张' })
    const b = seedProject('lead-b', { coreTitle: 'B 项目标题', resultClaim: 'B 的 res-1 主张' })
    assert.equal(a.resultId, 'res-1', 'A 项目第一条 Result 的显示 id 必须是 res-1')
    assert.equal(b.resultId, 'res-1', 'B 项目第一条 Result 的显示 id 也必须是 res-1')
    seedGlobalLedgers({ pidA: a.pid, pidB: b.pid })
  })

  test('/state 按 session 只返回当前项目的任务、图件、图件计划与审查', async () => {
    const call = routeHarness()

    const a = await call('/plugins/dsh-science/state?sessionId=lead-a')
    assert.equal(a.status, 200, a.body)
    const payloadA = JSON.parse(a.body)
    assert.equal(payloadA.projectId !== undefined, true, '会话视图必须带 projectId')
    const violations = []
    const expectIds = (label, actual, expected) => {
      const ids = actual.map((item) => item.id)
      if (JSON.stringify(ids) !== JSON.stringify(expected)) {
        violations.push(`${label}: 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(ids)}`)
      }
    }
    expectIds('任务（跨项目同名 res-1 不得作为归属依据）', payloadA.team.tasks, ['task-a'])
    expectIds('图件计划（必须按项目归属过滤）', payloadA.figurePlans, ['plan-a'])
    expectIds('审查摘要（必须按项目归属过滤）', payloadA.reviews, ['rev-a'])
    expectIds('图件（legacy-unscoped 不得混入项目卡片）', payloadA.figures, ['fig-a'])
    if (a.body.includes('B 项目专属任务')) violations.push('响应泄漏了 B 的任务标题')
    if (a.body.includes('B 项目机密发现')) violations.push('响应泄漏了 B 的审查内容')
    if (a.body.includes('无法归属的历史')) violations.push('legacy-unscoped 条目混入了项目卡')
    assert.deepEqual(violations, [], `A 会话串入了 B 项目的数据：\n${violations.join('\n')}`)
    // 列表与计数同口径：review 覆盖统计不得把 B 的 run 计入
    assert.equal(payloadA.reviews.length, 1, '审查摘要数量必须与过滤后的列表一致')
    assert.equal(payloadA.team.tasks.length, 1, '任务数量必须与过滤后的列表一致')

    const b = await call('/plugins/dsh-science/state?sessionId=lead-b')
    assert.equal(b.status, 200, b.body)
    const payloadB = JSON.parse(b.body)
    assert.deepEqual(payloadB.team.tasks.map((task) => task.id), ['task-b'])
    assert.deepEqual(payloadB.figurePlans.map((plan) => plan.id), ['plan-b'])
    assert.deepEqual(payloadB.reviews.map((review) => review.id), ['rev-b'], '历史 run 应按 sessionId 稳定链接回填到 B')
    assert.deepEqual(payloadB.figures.map((figure) => figure.id), ['fig-b'])
    assert.equal(b.body.includes('A 项目专属任务'), false)
  })

  test('/review 必须校验 run 的项目归属：A 请求 B 的 run 被拒且不返回 B 元数据', async () => {
    const call = routeHarness()

    const cross = await call('/plugins/dsh-science/review?run=rev-b&sessionId=lead-a')
    assert.ok(
      cross.status === 403 || cross.status === 404,
      `跨项目审查详情必须拒绝（403/404），实际 ${cross.status}：${cross.body.slice(0, 200)}`,
    )
    assert.equal(cross.body.includes('B 项目机密发现'), false, '拒绝响应泄漏了 B 的审查发现')
    assert.equal(cross.body.includes('rev-b'), false, '拒绝响应泄漏了 B 的 run id')

    const own = await call('/plugins/dsh-science/review?run=rev-a&sessionId=lead-a')
    assert.equal(own.status, 200, '同项目审查详情必须可读')
    assert.equal(JSON.parse(own.body).run.id, 'rev-a')

    const legacyRun = await call('/plugins/dsh-science/review?run=rev-legacy&sessionId=lead-a')
    assert.equal(legacyRun.status, 404, 'legacy-unscoped run 不得出现在项目详情中')

    const noSession = await call('/plugins/dsh-science/review?run=rev-a')
    assert.equal(noSession.status, 400, '审查详情必须携带当前 sessionId，不能只凭 runId 读取')
    assert.equal(noSession.body.includes('A 项目审查通过'), false, '缺少 sessionId 时不得返回审查内容')
  })
})
