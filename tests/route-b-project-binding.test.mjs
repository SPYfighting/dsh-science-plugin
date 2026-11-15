// 路线 B T5：Project Binding 状态机（baseline/SSE/断线/重连/无权/会话下线/generation 守卫）。
// 依据设计真源 §10.3：revision 变化才读取；gap 立即补读；断线保留 last-known-good 并标 stale；
// 会话变化/重连建立新 generation，旧 generation 响应不得覆盖新结果；/state 不参与本路径。
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-t5-hash-'))
process.env.DSH_HOME = home

const { createProjectBinding } = await import('../client-src/project/project-binding.js')
const { objectContentHashesOf } = await import('../client-src/project/object-hash.js')
const { projectRawOf, stateViewOf } = await import('../client-src/workbench/state-view.js')
const { ProjectStore } = await import('../lib/project-store.js')
const { railTeamOf } = await import('../lib/rail-team.js')
const { executePaperCommands, contentHashOf } = await import('../lib/project-domain.js')

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function projectOf(projectId, revision, title = '项目标题') {
  return {
    projectId,
    revision,
    snapshot: {
      projectId,
      revision,
      paper: { stage: 'explore', core: { title, claim: '主张', revision: 1, confirmed: false }, results: [] },
    },
  }
}

function okBody(projectId, revision, title) {
  return { ok: true, status: 200, body: { project: projectOf(projectId, revision, title), ref: { relationship: 'root', capabilities: { read: true, writePaper: true } } } }
}

function emptyBody() {
  return { ok: true, status: 200, body: { project: null, ref: { relationship: 'unbound', capabilities: { read: true, writePaper: true } } } }
}

class FakeEventSource {
  static instances = []
  constructor(url) {
    this.url = url
    this.listeners = new Map()
    this.closed = false
    FakeEventSource.instances.push(this)
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type).push(fn)
  }
  emit(type, data) {
    for (const fn of this.listeners.get(type) || []) fn({ data: JSON.stringify(data) })
  }
  close() { this.closed = true }
}

function makeFetch() {
  const requests = []
  const impl = (url) => new Promise((resolve, reject) => {
    const request = { url: String(url), sid: new URL(String(url), 'http://localhost').searchParams.get('sessionId'), settled: false }
    request.resolve = (response) => { if (!request.settled) { request.settled = true; resolve(response) } }
    request.reject = (error) => { if (!request.settled) { request.settled = true; reject(error || new Error('network')) } }
    requests.push(request)
  })
  return { requests, impl }
}

describe('T5：Project Binding 状态机', () => {
  beforeEach(() => { FakeEventSource.instances = [] })

  test('baseline → ready + observe；change 只在更高 revision 时读取，旧帧忽略', async () => {
    const net = makeFetch()
    const binding = createProjectBinding({ getSessionId: () => 's1', fetchImpl: net.impl, eventSourceImpl: FakeEventSource })
    try {
      const first = binding.refresh()
      assert.equal(net.requests.length, 1)
      assert.match(net.requests[0].url, /\/plugins\/dsh-science\/project\/get\?sessionId=s1/)
      net.requests[0].resolve(okBody('p1', 1))
      await first
      assert.equal(binding.getState().status, 'ready')
      assert.equal(binding.getState().revision, 1)
      const es = FakeEventSource.instances[0]
      assert.ok(es, 'ready 后必须建立 observe 流')
      assert.match(es.url, /sessionId=s1/)

      es.emit('change', { projectRevision: 2 })
      await tick()
      assert.equal(net.requests.length, 2, 'revision 前进必须补读')
      net.requests[1].resolve(okBody('p1', 2))
      await tick(); await tick()
      assert.equal(binding.getState().revision, 2)

      es.emit('change', { projectRevision: 2 })
      await tick()
      assert.equal(net.requests.length, 2, '相同 revision 的帧不得重复读取')
      es.emit('change', { projectRevision: 1 })
      await tick()
      assert.equal(net.requests.length, 2, '更低 revision 的旧帧必须忽略')
    } finally { binding.dispose() }
  })

  test('revision gap → 立即补读 baseline；baseline 帧 revision 不一致也补读', async () => {
    const net = makeFetch()
    const binding = createProjectBinding({ getSessionId: () => 's1', fetchImpl: net.impl, eventSourceImpl: FakeEventSource })
    try {
      const first = binding.refresh()
      net.requests[0].resolve(okBody('p1', 2))
      await first
      const es = FakeEventSource.instances[0]
      es.emit('change', { projectRevision: 7 })
      await tick()
      assert.equal(net.requests.length, 2, 'gap 必须补读')
      net.requests[1].resolve(okBody('p1', 7))
      await tick(); await tick()
      assert.equal(binding.getState().revision, 7)

      es.emit('baseline', { revision: 9 })
      await tick()
      assert.equal(net.requests.length, 3, 'baseline revision 不一致必须补读')
      net.requests[2].resolve(okBody('p1', 9))
      await tick(); await tick()
      assert.equal(binding.getState().revision, 9)
    } finally { binding.dispose() }
  })

  test('断线（streamFailure）保留 last-known-good 并标 stale；手动 refresh 恢复', async () => {
    const net = makeFetch()
    const binding = createProjectBinding({ getSessionId: () => 's1', fetchImpl: net.impl, eventSourceImpl: FakeEventSource })
    try {
      const first = binding.refresh()
      net.requests[0].resolve(okBody('p1', 3, '保留标题'))
      await first
      const es = FakeEventSource.instances[0]
      es.emit('streamFailure', { reason: 'server-restart' })
      assert.equal(binding.getState().stale, true)
      assert.match(binding.getState().error, /流失败/)
      assert.equal(binding.getState().project.projectId, 'p1', '断线必须保留 last-known-good')
      assert.equal(binding.getState().project.snapshot.paper.core.title, '保留标题')
      assert.equal(es.closed, true)

      const retry = binding.refresh()
      net.requests[1].resolve(okBody('p1', 4, '恢复标题'))
      await retry
      assert.equal(binding.getState().status, 'ready')
      assert.equal(binding.getState().stale, false)
      assert.equal(binding.getState().revision, 4)
    } finally { binding.dispose() }
  })

  test('fetch 失败 → offline + stale，保留 last-known-good；未知会话 404 → unauthorized 清空', async () => {
    const net = makeFetch()
    const binding = createProjectBinding({ getSessionId: () => 's1', fetchImpl: net.impl, eventSourceImpl: FakeEventSource })
    try {
      const first = binding.refresh()
      net.requests[0].resolve(okBody('p1', 2))
      await first

      const retry = binding.refresh()
      net.requests[1].reject(new Error('network down'))
      await retry
      assert.equal(binding.getState().status, 'offline')
      assert.equal(binding.getState().stale, true)
      assert.equal(binding.getState().project.projectId, 'p1')

      const unknown = binding.refresh()
      net.requests[2].resolve({ ok: false, status: 404, body: null })
      await unknown
      assert.equal(binding.getState().status, 'unauthorized')
      assert.equal(binding.getState().project, null, '未知会话不得显示旧项目')
      assert.equal(binding.getState().stale, false)
    } finally { binding.dispose() }
  })

  test('session 下线（reset/空 project）→ empty 且不保留旧项目', async () => {
    const net = makeFetch()
    const binding = createProjectBinding({ getSessionId: () => 's1', fetchImpl: net.impl, eventSourceImpl: FakeEventSource })
    try {
      const first = binding.refresh()
      net.requests[0].resolve(okBody('p1', 5))
      await first
      const es = FakeEventSource.instances[0]
      es.emit('reset', {})
      await tick()
      assert.equal(net.requests.length, 2, 'reset 必须补读')
      net.requests[1].resolve(emptyBody())
      await tick(); await tick()
      assert.equal(binding.getState().status, 'empty')
      assert.equal(binding.getState().project, null)
      assert.equal(binding.getState().revision, null)
    } finally { binding.dispose() }
  })

  test('generation 守卫：旧 refresh 的迟到响应不得覆盖新结果', async () => {
    const net = makeFetch()
    const binding = createProjectBinding({ getSessionId: () => 's1', fetchImpl: net.impl, eventSourceImpl: FakeEventSource })
    try {
      const slow = binding.refresh()
      const fast = binding.refresh()
      assert.equal(net.requests.length, 2)
      net.requests[1].resolve(okBody('p1', 8, '新结果'))
      await fast
      assert.equal(binding.getState().revision, 8)
      net.requests[0].resolve(okBody('p1', 1, '迟到旧结果'))
      await slow
      assert.equal(binding.getState().revision, 8, '旧 generation 响应必须丢弃')
      assert.equal(binding.getState().project.snapshot.paper.core.title, '新结果')
    } finally { binding.dispose() }
  })

  test('客户端 contentHash 与领域层同口径（确认按钮 expectedHash 不回归）', async () => {
    mkdirSync(join(home, 'dsh-science'), { recursive: true })
    const store = ProjectStore.open(home)
    try {
      const pid = store.createProject({ rootSessionId: 's1' })
      const ref = { projectId: pid, rootSessionId: 's1', currentSessionId: 's1', relationship: 'root', capabilities: { read: true, writePaper: true } }
      executePaperCommands(store, ref, {
        mutationId: 'seed',
        operations: [
          { command: 'paper.propose-core', payload: { title: 'T5 核心', claim: '核心主张' } },
          { command: 'paper.propose-result', payload: { title: 'T5 结果', claim: '结果主张' } },
        ],
      })
      const snap = store.snapshotOf(pid)
      // 模拟 project/get 的 JSON 往返：客户端拿到的对象键顺序与服务端快照一致。
      const project = { projectId: pid, revision: snap.revision, snapshot: JSON.parse(JSON.stringify(snap.snapshot)) }
      const hashes = await objectContentHashesOf(project)
      assert.equal(hashes.core, contentHashOf(snap.snapshot.paper.core), '客户端 core contentHash 必须与领域层一致')
      const resultId = snap.snapshot.paper.results[0].id
      assert.equal(hashes.results[resultId], contentHashOf(snap.snapshot.paper.results[0]), '客户端 result contentHash 必须与领域层一致')

      const view = stateViewOf(projectRawOf(project, {
        hashes,
        team: {
          members: [
            { name: '甲成员', role: 'analyst', childId: 'child-a', parentSessionId: 's1', projectId: pid, rootSessionId: 's1' },
            { name: '乙成员', role: 'writer', childId: 'child-b', projectId: 'other', rootSessionId: 'other' },
          ],
          tasks: [
            { id: 'task-a', subject: '核对本项目记录', status: 'blocked', projectId: pid, rootSessionId: 's1', blockedBy: [] },
            { id: 'task-b', subject: '其他项目任务', status: 'running', projectId: 'other', rootSessionId: 'other' },
          ],
        },
      }))
      assert.equal(view.paper.core.contentHash, hashes.core, '确认按钮拿到的 core hash 必须是领域同口径')
      assert.equal(view.team.members.length, 1, '右栏只显示当前项目成员')
      assert.equal(view.team.members[0].name, '甲成员')
      assert.equal(view.team.tasks.length, 1, '右栏不得显示其他项目任务')
      assert.equal(view.team.tasks[0].subject, '核对本项目记录')
      const summary = railTeamOf({ projectId: pid, rootSessionId: 's1' }, {
        team: {
          members: [
            { name: '甲成员', projectId: pid, rootSessionId: 's1', childId: 'child-a' },
            { name: '无归属成员', childId: 'child-legacy' },
          ],
          tasks: [
            { id: 'task-a', subject: '核对本项目记录', projectId: pid, rootSessionId: 's1' },
            { id: 'task-legacy', subject: '无归属任务' },
          ],
        },
      })
      assert.deepEqual(summary.members.map((member) => member.name), ['甲成员'])
      assert.deepEqual(summary.tasks.map((task) => task.id), ['task-a'])
      assert.equal(view.paper.results[0].contentHash, hashes.results[resultId])
      assert.equal(view.paper.results[0].revision, snap.snapshot.paper.results[0].revision)
    } finally {
      try { store.close() } catch { /* ignore */ }
      rmSync(join(home, 'dsh-science'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  })
})
