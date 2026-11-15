// 路线 B T1 回归：项目读模型的作用域 / 新写入归属 / 审查详情错误分级 / legacy 隔离。
// 依据：任务书 T1 必测矩阵与设计真源 §7、§10.1、§10.3。
//
// 说明：本文件与 tests/route-b-project-isolation.test.mjs 互补——后者固定“双项目同名
// res-1 不得串数据”的端到端红线，本文件覆盖：共享任务去重、新写入带 projectId/
// rootSessionId、/review 400/403/404 分级、legacy-unscoped 只出现在 legacy 视图。
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-routeb-project-scope-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { executePaperCommands } = await import('../lib/project-domain.js')
const { registerStateRoute } = await import('../lib/httpdata.js')
const { registerFigureTools } = await import('../lib/figures.js')
const { runReview } = await import('../lib/reviewer.js')

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

const refOf = (pid, root) => ({
  projectId: pid,
  rootSessionId: root,
  currentSessionId: root,
  relationship: 'root',
  capabilities: { read: true, propose: true, writePaper: true, dispatch: true },
})

function seedProject(root, { results = [{ claim: 'R1' }], title = '项目' } = {}) {
  const pid = store.createProject({ rootSessionId: root, title })
  const ops = [{ command: 'paper.propose-core', payload: { title, claim: '核心主张' } }]
  for (const r of results) ops.push({ command: 'paper.propose-result', payload: { title: r.title || r.claim, claim: r.claim } })
  executePaperCommands(store, refOf(pid, root), { mutationId: `seed-${root}`, operations: ops })
  const snapshot = store.snapshotOf(pid).snapshot
  return { pid, resultIds: snapshot.paper.results.map((r) => r.id) }
}

function stateHarness() {
  const handlers = {}
  const server = { register: (def) => { handlers[def.path] = def.handler; return () => {} } }
  registerStateRoute(fakeCtx({ server }), { store })
  return async (path) => {
    let status = 0
    let body = ''
    const res = { writeHead: (code) => { status = code }, end: (b) => { body = String(b || '') } }
    await handlers[path.split('?')[0]]({ url: path, headers: {} }, res)
    return { status, body }
  }
}

function seedSessionMap(entries) {
  for (const key of Object.keys(sessions)) delete sessions[key]
  for (const [id, value] of Object.entries(entries)) sessions[id] = value
}

function pngFixture(width = 1200, height = 600) {
  const buf = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12, 'ascii')
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  return buf
}

function figureToolsFor() {
  const tools = {}
  registerFigureTools({
    tools: { register: (d) => { tools[d.name] = d } },
    get: (k) => (k === 'sessions' ? sessionsSvc : undefined),
  }, { store })
  return tools
}

describe('T1：共享任务与项目读模型', () => {
  beforeEach(() => { resetHome() })

  test('同一共享任务关联多个 resultIds 在项目视图中只出现一次', async () => {
    seedSessionMap({ 'lead-a': sessionOf('lead-a') })
    const a = seedProject('lead-a', { results: [{ claim: 'R1' }, { claim: 'R2' }], title: 'A' })
    assert.deepEqual(a.resultIds, ['res-1', 'res-2'])
    writeFileSync(join(dataDir, 'team.json'), JSON.stringify({
      members: [{ name: 'analyst', role: 'analyst', childId: 'child-a', parentSessionId: 'lead-a' }],
      tasks: [
        {
          id: 'task-shared', subject: '共享质控任务', status: 'pending', assignee: 'analyst',
          resultId: 'res-2', resultIds: ['res-1', 'res-2', 'res-1'],
          projectId: a.pid, rootSessionId: 'lead-a', createdAt: 10,
        },
      ],
      taskSeq: 1,
    }), 'utf8')
    const call = stateHarness()
    const res = await call('/plugins/dsh-science/state?sessionId=lead-a')
    assert.equal(res.status, 200, res.body)
    const payload = JSON.parse(res.body)
    assert.deepEqual(payload.team.tasks.map((t) => t.id), ['task-shared'], '共享任务只能出现一次')
    assert.equal(payload.team.tasks.length, 1)
  })

  test('legacy-unscoped 条目只在 legacy /state 出现，不进入项目视图', async () => {
    seedSessionMap({ 'lead-a': sessionOf('lead-a') })
    seedProject('lead-a', { title: 'A' })
    writeFileSync(join(dataDir, 'team.json'), JSON.stringify({
      members: [],
      tasks: [{ id: 'task-legacy', subject: '历史任务', status: 'pending', resultId: 'res-1', createdAt: 1 }],
      taskSeq: 1,
    }), 'utf8')
    writeFileSync(join(dataDir, 'figures.json'), JSON.stringify({
      'fig-legacy': { id: 'fig-legacy', title: '历史图件', resultId: 'res-1', registeredAt: 1 },
    }), 'utf8')
    writeFileSync(join(dataDir, 'figure-plans.json'), JSON.stringify({
      'plan-legacy': { id: 'plan-legacy', title: '历史计划', resultId: 'res-1', updatedAt: 1 },
    }), 'utf8')
    writeFileSync(join(dataDir, 'reviews.json'), JSON.stringify({
      'rev-legacy': { id: 'rev-legacy', status: 'done', findings: [{ severity: 'warn', message: '历史审查' }] },
    }), 'utf8')

    const call = stateHarness()
    const scoped = await call('/plugins/dsh-science/state?sessionId=lead-a')
    assert.equal(scoped.status, 200, scoped.body)
    const payload = JSON.parse(scoped.body)
    assert.deepEqual(payload.team.tasks, [], 'legacy 任务不得混入项目视图')
    assert.deepEqual(payload.figures, [], 'legacy 图件不得混入项目视图')
    assert.deepEqual(payload.figurePlans, [], 'legacy 图件计划不得混入项目视图')
    assert.deepEqual(payload.reviews, [], 'legacy 审查不得混入项目视图')
    assert.equal(scoped.body.includes('历史图件'), false)
    assert.equal(scoped.body.includes('历史计划'), false)
    assert.equal(scoped.body.includes('历史审查'), false)

    const legacy = await call('/plugins/dsh-science/state')
    assert.equal(legacy.status, 200)
    const legacyPayload = JSON.parse(legacy.body)
    assert.equal(legacyPayload.legacy, true)
    assert.deepEqual(legacyPayload.team.tasks.map((t) => t.id), ['task-legacy'])
    assert.deepEqual(legacyPayload.figures.map((f) => f.id), ['fig-legacy'])
    assert.deepEqual(legacyPayload.figurePlans.map((p) => p.id), ['plan-legacy'])
    assert.deepEqual(legacyPayload.reviews.map((r) => r.id), ['rev-legacy'])
  })
})

describe('T1：新写入的 review / figure / figure plan 带稳定项目归属', () => {
  beforeEach(() => { resetHome() })

  test('sci_figure_plan / sci_figure_register 写入 projectId 与 rootSessionId', async () => {
    seedSessionMap({ 'lead-a': sessionOf('lead-a') })
    const a = seedProject('lead-a', { title: 'A' })
    const dir = mkdtempSync(join(tmpdir(), 'dsh-t1-figure-'))
    try {
      const figPath = join(dir, 'figure.png')
      writeFileSync(figPath, pngFixture())

      const tools = figureToolsFor()
      const exec = { agent: { id: 'lead-a' } }
      const plan = await tools.sci_figure_plan.execute({ figure_title: '主要图', result_id: 'res-1', target_journal: 'nature' }, exec)
      const plans = JSON.parse(readFileSync(join(dataDir, 'figure-plans.json'), 'utf8'))
      assert.equal(plans[plan.planId].projectId, a.pid, '图件计划必须写入 projectId')
      assert.equal(plans[plan.planId].rootSessionId, 'lead-a', '图件计划必须写入 rootSessionId')

      const reg = await tools.sci_figure_register.execute({ path: figPath, figure_title: '主要图', plan_id: plan.planId }, exec)
      const figures = JSON.parse(readFileSync(join(dataDir, 'figures.json'), 'utf8'))
      assert.equal(figures[reg.figureId].projectId, a.pid, '图件登记必须写入 projectId')
      assert.equal(figures[reg.figureId].rootSessionId, 'lead-a', '图件登记必须写入 rootSessionId')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('历史图件/计划可由当前项目快照的稳定链接唯一确定并回填展示', async () => {
    seedSessionMap({ 'lead-a': sessionOf('lead-a') })
    seedProject('lead-a', { title: 'A' })
    const dir = mkdtempSync(join(tmpdir(), 'dsh-t1-link-'))
    try {
      const figPath = join(dir, 'legacy-figure.png')
      writeFileSync(figPath, pngFixture())
      const tools = figureToolsFor()
      const exec = { agent: { id: 'lead-a' } }
      const plan = await tools.sci_figure_plan.execute({ figure_title: '历史计划', result_id: 'res-1' }, exec)
      const reg = await tools.sci_figure_register.execute({ path: figPath, figure_title: '历史图件', result_id: 'res-1', plan_id: plan.planId }, exec)

      // 模拟 T1 之前的全局条目：抹掉显式归属，只剩图件→Result/计划的稳定链接。
      const figures = JSON.parse(readFileSync(join(dataDir, 'figures.json'), 'utf8'))
      delete figures[reg.figureId].projectId
      delete figures[reg.figureId].rootSessionId
      writeFileSync(join(dataDir, 'figures.json'), JSON.stringify(figures), 'utf8')
      const plans = JSON.parse(readFileSync(join(dataDir, 'figure-plans.json'), 'utf8'))
      delete plans[plan.planId].projectId
      delete plans[plan.planId].rootSessionId
      writeFileSync(join(dataDir, 'figure-plans.json'), JSON.stringify(plans), 'utf8')

      const call = stateHarness()
      const res = await call('/plugins/dsh-science/state?sessionId=lead-a')
      assert.equal(res.status, 200, res.body)
      const payload = JSON.parse(res.body)
      assert.deepEqual(payload.figures.map((f) => f.id), [reg.figureId], '快照 result.figures 链接应回填历史图件')
      assert.deepEqual(payload.figurePlans.map((p) => p.id), [plan.planId], 'figure.planId 链接应回填历史图件计划')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('runReview 写入 projectId 与 rootSessionId', async () => {
    seedSessionMap({ 'lead-a': sessionOf('lead-a') })
    const a = seedProject('lead-a', { title: 'A' })
    const FINDING = { severity: 'pass', check: 'number-traceability', claim: 'c', evidence: 'e', message: 'ok' }
    const complete = JSON.stringify({ findings: [
      FINDING,
      ...['claim-execution', 'figure-consistency', 'citation-hygiene', 'fabrication', 'plan-completion'].map((check) => ({ ...FINDING, check })),
      { ...FINDING, check: 'blueprint-claim', claim: 'core@r1', message: '核心一致' },
      { ...FINDING, check: 'blueprint-claim', claim: 'core@r2', message: '核心当前修订一致' },
      { ...FINDING, check: 'blueprint-claim', claim: 'res-1-claim-1@r1', message: '结果一致' },
    ] })
    const events = [
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'text', text: '分析完成：表达量上调 2.5 倍' }] } } },
      { type: 'turn/end', data: { turn: 1 } },
    ]
    const ctx = {
      get: (k) => (k === 'sessions' ? sessionsSvc : undefined),
      subagents: {
        async startActivation(spec) {
          return { childId: 'child-review', result: Promise.resolve({ output: [{ type: 'text', text: complete }] }), dispose: async () => {} }
        },
      },
    }
    const agent = { id: 'lead-a', session: { id: 'lead-a', snapshotEvents: () => events } }
    const r = await runReview(ctx, agent, 'lead-a', 1, { store })
    assert.equal(r.ok, true, JSON.stringify(r))
    const reviews = JSON.parse(readFileSync(join(dataDir, 'reviews.json'), 'utf8'))
    const record = reviews[r.runId]
    assert.equal(record.projectId, a.pid, '审查 run 必须写入 projectId')
    assert.equal(record.rootSessionId, 'lead-a', '审查 run 必须写入 rootSessionId')
  })
})

describe('T1：/review 错误分级 400 / 403 / 404', () => {
  beforeEach(() => { resetHome() })

  test('缺 sessionId 400；未知会话 404；无读权限 403；不存在/跨项目 404', async () => {
    seedSessionMap({
      'lead-a': sessionOf('lead-a'),
      // 普通 fork：有父会话但无项目读权限（resolveProjectContext → fork, read=false）
      'fork-1': sessionOf('fork-1', 'lead-a'),
    })
    const a = seedProject('lead-a', { title: 'A' })
    writeFileSync(join(dataDir, 'reviews.json'), JSON.stringify({
      'rev-a': { id: 'rev-a', status: 'done', sessionId: 'lead-a', projectId: a.pid, rootSessionId: 'lead-a', findings: [{ severity: 'pass', message: '通过' }] },
      'rev-other': { id: 'rev-other', status: 'done', sessionId: 'lead-other', findings: [{ severity: 'fail', message: '别处结论' }] },
    }), 'utf8')
    store.createProject({ rootSessionId: 'lead-other' })

    const call = stateHarness()
    const missingSession = await call('/plugins/dsh-science/review?run=rev-a')
    assert.equal(missingSession.status, 400)
    const unknown = await call('/plugins/dsh-science/review?run=rev-a&sessionId=ghost')
    assert.equal(unknown.status, 404)
    const fork = await call('/plugins/dsh-science/review?run=rev-a&sessionId=fork-1')
    assert.equal(fork.status, 403, '无读权限的 fork 会话不得读取项目审查详情')
    const missingRun = await call('/plugins/dsh-science/review?run=nope&sessionId=lead-a')
    assert.equal(missingRun.status, 404)
    const cross = await call('/plugins/dsh-science/review?run=rev-other&sessionId=lead-a')
    assert.equal(cross.status, 404, '跨项目 run 与不存在同码，避免探测')
    assert.equal(cross.body.includes('别处结论'), false)
    const own = await call('/plugins/dsh-science/review?run=rev-a&sessionId=lead-a')
    assert.equal(own.status, 200)
  })
})
