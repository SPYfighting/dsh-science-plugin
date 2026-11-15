// 路线 B T4：Action Cards 确认 CAS（hash 必填 / 无关对象变化允许 / 目标变化结构化 conflict /
// 幂等重放不重复审计）。Host+Client 组合由 tests/route-b-action-cards-composition.test.mjs 覆盖。
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const home = mkdtempSync(join(tmpdir(), 'dsh-routeb-cas-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { executePaperCommands, contentHashOf } = await import('../lib/project-domain.js')
const { registerProjectRemote } = await import('../lib/project-remote.js')
const { registerStateRoute } = await import('../lib/httpdata.js')
const { registerBlueprintTools } = await import('../lib/blueprint.js')

let store = null

function resetHome() {
  if (store) { try { store.close() } catch { /* ignore */ } store = null }
  rmSync(join(home, 'dsh-science'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  mkdirSync(join(home, 'dsh-science'), { recursive: true })
  store = ProjectStore.open(home)
}

const sessions = { s1: { id: 's1', header: { version: 1, id: 's1', createdAt: 1, parentSession: null, isSeeded: false } } }
const sessionsSvc = { get: (id) => sessions[id] }

function fakeCtx() {
  const registered = []
  return {
    get(name) {
      if (name === 'sessions') return sessionsSvc
      if (name === 'webServer' || name === 'httpServer') {
        return { register(route) { registered.push(route); return () => {} } }
      }
      if (name === 'connection') return { requestRejection: () => undefined }
      throw new Error(`cannot get property without inject: ${name}`)
    },
    effect(fn) { fn() },
    on() { return () => {} },
    __registered: registered,
  }
}

function fakeReq(url, method = 'GET') {
  const req = new EventEmitter()
  req.url = url
  req.method = method
  req.headers = {}
  return req
}

function fakeRes() {
  return {
    statusCode: null,
    headers: null,
    chunks: [],
    body: '',
    writeHead(code, headers) { this.statusCode = code; this.headers = headers },
    end(text) { if (text) this.chunks.push(String(text)); this.body = this.chunks.join('') },
    write(text) { this.chunks.push(String(text)); this.body = this.chunks.join('') },
    on() { return this },
  }
}

async function callRoute(ctx, path, { url = '', method = 'GET', body = null } = {}) {
  const route = ctx.__registered.find((r) => r.path === path)
  if (!route) throw new Error(`route not registered: ${path}`)
  const req = fakeReq(url || path, method)
  const res = fakeRes()
  const done = route.handler(req, res)
  if (body != null) {
    await new Promise((r) => setTimeout(r, 0))
    req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  } else if (method === 'GET') {
    await new Promise((r) => setTimeout(r, 10))
    req.emit('end')
  }
  if (done && typeof done.then === 'function') await done
  await new Promise((r) => setTimeout(r, 10))
  return { res, body: res.body ? JSON.parse(res.body) : null }
}

const refOf = (pid, root = 's1') => ({
  projectId: pid,
  rootSessionId: root,
  currentSessionId: root,
  relationship: 'root',
  capabilities: { read: true, propose: true, writePaper: true, dispatch: true },
})

function seedProject() {
  const pid = store.createProject({ rootSessionId: 's1' })
  executePaperCommands(store, refOf(pid), {
    mutationId: 'seed',
    operations: [
      { command: 'paper.propose-core', payload: { title: 'T', claim: '核心主张' } },
      { command: 'paper.propose-result', payload: { title: 'R1', claim: '原始主张' } },
    ],
  })
  return pid
}

const initDraft = (pid) => {
  const snap = store.snapshotOf(pid).snapshot
  const obj = snap.paper.results[0]
  return {
    projectRevision: snap.revision,
    objectId: obj.id,
    objectRevision: obj.revision,
    expectedHash: contentHashOf(obj),
  }
}

async function act(ctx, body) {
  return callRoute(ctx, '/plugins/dsh-science/project/act', {
    url: '/plugins/dsh-science/project/act',
    method: 'POST',
    body: { sessionId: 's1', actionId: 'paper.confirm-revision', ...body },
  })
}

describe('T4：Action Cards 组合与版本声明', () => {
  function patchRows(text) {
    const rows = []
    let current = null
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const id = /^-\s+id:\s*(.+)$/.exec(line)
      const name = /^name:\s*(.+)$/.exec(line)
      if (id) { current = { id: id[1].replace(/^['"]|['"]$/g, '') }; rows.push(current) }
      else if (name && current) current.name = name[1].replace(/^['"]|['"]$/g, '')
    }
    return rows
  }

  test('Host 与 Client 两个 Action Cards 插件同时声明并加载，版本与当前 DSH 精确一致', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const rows = patchRows(readFileSync(join(root, 'cordis.patch.yml'), 'utf8'))
    const names = rows.map((row) => row.name)
    assert.ok(names.includes('@deepseek-ai/dsh-action-cards'), '缺少 Action Cards Host 行')
    assert.ok(names.includes('@deepseek-ai/dsh-client-ui-action-cards'), '缺少 Action Cards Client 行')
    assert.equal(pkg.dependencies['@deepseek-ai/dsh-action-cards'], '0.2.2-rc.3')
    assert.equal(pkg.dependencies['@deepseek-ai/dsh-client-ui-action-cards'], '0.2.2-rc.3')
    // 已安装副本与声明一致（避免 rc.1/rc.3 混装）
    const hostInstalled = JSON.parse(readFileSync(join(root, 'node_modules/@deepseek-ai/dsh-action-cards/package.json'), 'utf8'))
    const clientInstalled = JSON.parse(readFileSync(join(root, 'node_modules/@deepseek-ai/dsh-client-ui-action-cards/package.json'), 'utf8'))
    assert.equal(hostInstalled.version, '0.2.2-rc.3')
    assert.equal(clientInstalled.version, '0.2.2-rc.3')
    assert.equal(clientInstalled.exports['./client'].default, './lib/client.js')
  })
})

describe('T4：Action Cards 确认 CAS', () => {
  beforeEach(() => { resetHome() })

  test('/state 暴露 core/result 的 contentHash（卡片与右栏按钮可用）', async () => {
    const pid = seedProject()
    const ctx = fakeCtx()
    registerStateRoute(ctx, { store })
    const { res, body } = await callRoute(ctx, '/plugins/dsh-science/state', { url: '/plugins/dsh-science/state?sessionId=s1' })
    assert.equal(res.statusCode, 200)
    const snap = store.snapshotOf(pid).snapshot
    assert.equal(body.blueprint.core.contentHash, contentHashOf(snap.paper.core), 'core contentHash 必须与领域层同口径')
    assert.equal(body.blueprint.results[0].contentHash, contentHashOf(snap.paper.results[0]), 'result contentHash 必须与领域层同口径')

    // 模型提案用的 sci_blueprint_overview 必须暴露同一份 hash（否则卡片确认会被对象 CAS 拒绝）
    const tools = {}
    registerBlueprintTools({ tools: { register: (d) => { tools[d.name] = d } } }, { store })
    const overview = await tools.sci_blueprint_overview.execute({}, { agent: { id: 's1' } })
    assert.equal(overview.core.contentHash, contentHashOf(snap.paper.core))
    assert.equal(overview.results[0].contentHash, contentHashOf(snap.paper.results[0]))
  })

  test('缺 expectedHash 400；无关对象变化允许确认；目标变化返回结构化 conflict；重放幂等', async () => {
    const pid = seedProject()
    const ctx = fakeCtx()
    registerProjectRemote(ctx, { store })
    const draft = initDraft(pid)

    // 缺 hash：服务端直接拒绝
    const noHash = await act(ctx, {
      commandId: 'c0',
      expectedRevision: draft.projectRevision,
      payload: { objectId: draft.objectId, expectedObjectRevision: draft.objectRevision },
    })
    assert.equal(noHash.res.statusCode, 400)
    assert.equal(noHash.body.kind, 'invalid')
    assert.match(noHash.body.reason, /expectedHash/)

    // 无关对象变化：新增 res-2 推进项目 revision，但目标 res-1 rev/hash 未变。
    executePaperCommands(store, refOf(pid), { mutationId: 'add-2', operations: [{ command: 'paper.propose-result', payload: { title: 'R2', claim: '无关结果' } }] })
    const afterUnrelated = store.snapshotOf(pid).snapshot
    assert.notEqual(afterUnrelated.revision, draft.projectRevision, '项目 revision 已因无关对象前进')
    const confirmed = await act(ctx, {
      commandId: 'c1',
      expectedRevision: draft.projectRevision, // 老项目 revision
      payload: { objectId: draft.objectId, expectedObjectRevision: draft.objectRevision, expectedHash: draft.expectedHash },
    })
    assert.equal(confirmed.res.statusCode, 200, JSON.stringify(confirmed.body))
    assert.equal(confirmed.body.kind, 'applied', '无关对象变化不应使目标卡失效')
    assert.equal(store.snapshotOf(pid).snapshot.paper.results[0].confirmed, true)

    // 同一 commandId 重放 → already-applied，且不重复审计
    const replay = await act(ctx, {
      commandId: 'c1',
      expectedRevision: store.snapshotOf(pid).revision,
      payload: { objectId: draft.objectId, expectedObjectRevision: draft.objectRevision, expectedHash: draft.expectedHash },
    })
    assert.equal(replay.body.kind, 'already-applied')
    const audits = store.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE mutation_id = 'c1'").get().n
    assert.equal(audits, 1, '幂等重放不重复追加审计回执')

    // 目标对象语义修改：旧卡（旧对象 revision/hash）必须结构化 conflict
    executePaperCommands(store, refOf(pid), { mutationId: 'mod', operations: [{ command: 'paper.update-result', payload: { resultId: draft.objectId, claim: '新主张' } }] })
    const current = store.snapshotOf(pid)
    const changed = current.snapshot.paper.results[0]
    const stale = await act(ctx, {
      commandId: 'c2',
      expectedRevision: current.revision,
      payload: { objectId: draft.objectId, expectedObjectRevision: draft.objectRevision, expectedHash: draft.expectedHash },
    })
    assert.equal(stale.res.statusCode, 409, JSON.stringify(stale.body))
    assert.equal(stale.body.kind, 'conflict')
    assert.equal(stale.body.code, 'object-conflict')
    assert.equal(stale.body.objectRevision, changed.revision)
    assert.notEqual(stale.body.currentHash, draft.expectedHash)
    assert.equal(store.snapshotOf(pid).snapshot.paper.results[0].confirmed, false, '旧卡不得确认新内容')
  })
})
