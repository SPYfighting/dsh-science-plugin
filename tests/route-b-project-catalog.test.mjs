// 路线 B T7：工作区 Project Catalog。
// 不同工作区不可见；同工作区各自打开已绑定 root；篡改 handle / workspaceKey / projectId 不能提权；
// legacy-unassigned 不进入当前目录；打开不改变当前会话的项目绑定。
import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-routeb-catalog-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { executePaperCommands } = await import('../lib/project-domain.js')
const { registerProjectRemote } = await import('../lib/project-remote.js')
const { workspaceKeyOf } = await import('../lib/workspace-key.js')
const { summaryLeaks } = await import('../lib/project-catalog.js')

const dataDir = join(home, 'dsh-science')
let store = null
const sessions = {}

function resetHome() {
  if (store) { try { store.close() } catch { /* ignore */ } store = null }
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  mkdirSync(dataDir, { recursive: true })
  store = ProjectStore.open(home)
  for (const key of Object.keys(sessions)) delete sessions[key]
}

function sessionOf(id, cwd, parentSession = null) {
  return { id, header: { version: 1, id, createdAt: 1, parentSession, isSeeded: false, cwd } }
}

function fakeCtx() {
  return {
    get(name) {
      if (name === 'sessions') return { get: (id) => sessions[id] }
      if (name === 'connection') return { requestRejection: () => undefined }
      return undefined
    },
    effect(fn) { return fn() },
    on() { return () => {} },
  }
}

const refOf = (pid, root) => ({
  projectId: pid,
  rootSessionId: root,
  currentSessionId: root,
  relationship: 'root',
  capabilities: { read: true, propose: true, writePaper: true, dispatch: true },
})

function seed(root, cwd, { title, question, stage = 'explore' } = {}) {
  sessions[root] = sessionOf(root, cwd)
  const key = workspaceKeyOf(cwd)
  const pid = store.createProject({ rootSessionId: root, title, workspaceKey: key })
  executePaperCommands(store, refOf(pid, root), {
    mutationId: `seed-${root}`,
    operations: [
      { command: 'paper.propose-core', payload: { title, claim: `${title} 的核心主张` } },
      { command: 'paper.set-question', payload: { question } },
      { command: 'paper.set-stage', payload: { stage } },
    ],
  })
  return { pid, key }
}

function harness({ workingDirectory } = {}) {
  const handlers = {}
  const server = { register: (def) => { handlers[def.path] = def.handler; return () => {} } }
  const ctx = fakeCtx()
  if (workingDirectory) ctx.workingDirectory = workingDirectory
  const baseGet = ctx.get.bind(ctx)
  ctx.get = (name) => {
    if (name === 'webServer') return server
    return baseGet(name)
  }
  registerProjectRemote(ctx, { store })
  return {
    catalog: async (sessionId, extra = '') => call(handlers['/plugins/dsh-science/project/catalog'], `/plugins/dsh-science/project/catalog?sessionId=${encodeURIComponent(sessionId)}${extra}`),
    open: async (body) => call(handlers['/plugins/dsh-science/project/open'], '/plugins/dsh-science/project/open', { method: 'POST', body }),
  }
}

async function call(handler, path, { method = 'GET', body = null } = {}) {
  let status = 0
  let raw = ''
  const res = { writeHead: (code) => { status = code }, end: (value) => { raw = String(value || '') } }
  const req = {
    method,
    url: path,
    headers: body ? { 'content-type': 'application/json' } : {},
    on(event, fn) {
      if (event === 'data' && body) queueMicrotask(() => fn(Buffer.from(JSON.stringify(body))))
      if (event === 'end') queueMicrotask(fn)
      return req
    },
  }
  await handler(req, res, new URL(path, 'http://localhost'))
  return { status, body: raw ? JSON.parse(raw) : null }
}

describe('workspace project catalog', () => {
  beforeEach(() => resetHome())

  test('different workspaces cannot see each other, and summaries do not leak identifiers', async () => {
    const left = seed('root-a', 'D:/workspaces/alpha', { title: '阿尔法课题', question: '阿尔法的问题', stage: 'frame' })
    const right = seed('root-b', 'D:/workspaces/beta', { title: '贝塔课题', question: '贝塔的问题', stage: 'execute' })
    sessions['guest-a'] = sessionOf('guest-a', 'D:/workspaces/alpha')
    sessions['guest-b'] = sessionOf('guest-b', 'D:/workspaces/beta')
    const api = harness()

    const a = await api.catalog('guest-a', '&projectId=' + encodeURIComponent(right.pid) + '&workspaceKey=' + right.key)
    const b = await api.catalog('guest-b')
    assert.equal(a.status, 200)
    assert.equal(b.status, 200)
    assert.deepEqual(a.body.projects.map((item) => item.title), ['阿尔法课题'])
    assert.deepEqual(b.body.projects.map((item) => item.title), ['贝塔课题'])
    assert.equal(summaryLeaks(a.body).length, 0)
    assert.equal(a.body.projects[0].questionExcerpt, '阿尔法的问题')
    assert.equal(a.body.projects[0].stageLabel, '文章结构')
    assert.equal(a.body.projects[0].attentionCount >= 1, true)
    assert.equal(JSON.stringify(a.body).includes(left.pid), false)
    assert.equal(JSON.stringify(a.body).includes(right.pid), false)
    assert.equal(JSON.stringify(a.body).includes('root-a'), false)
    assert.equal(JSON.stringify(a.body).includes(left.key), false)
  })

  test('each project in one workspace opens its own root without rebinding the current session', async () => {
    seed('root-a', 'D:/workspaces/shared', { title: '课题甲', question: '甲的问题' })
    seed('root-b', 'D:/workspaces/shared', { title: '课题乙', question: '乙的问题' })
    sessions.current = sessionOf('current', 'D:/workspaces/shared')
    const currentPid = store.createProject({ rootSessionId: 'current', title: '当前', workspaceKey: workspaceKeyOf('D:/workspaces/shared') })
    const api = harness()
    const listed = await api.catalog('current')
    assert.equal(listed.body.projects.length, 3)
    const opened = []
    for (const item of listed.body.projects.filter((entry) => !entry.current)) {
      const before = store.bindingOfRootSession('current')
      const result = await api.open({
        sessionId: 'current',
        openHandle: item.openHandle,
        projectId: 'proj-forged',
        rootSessionId: 'root-forged',
        workspaceKey: 'f'.repeat(64),
      })
      const after = store.bindingOfRootSession('current')
      assert.equal(result.status, 200)
      assert.equal(result.body.kind, 'open')
      assert.equal(result.body.projectId, undefined)
      opened.push(result.body.sessionId)
      assert.equal(after.projectId, before.projectId)
      assert.equal(after.projectId, currentPid)
    }
    assert.deepEqual(opened.sort(), ['root-a', 'root-b'])
  })

  test('tampered handle, foreign workspace key, and forged project id cannot escalate', async () => {
    const left = seed('root-a', 'D:/workspaces/alpha', { title: '阿尔法', question: '问题' })
    seed('root-b', 'D:/workspaces/beta', { title: '贝塔', question: '另一个问题' })
    sessions.current = sessionOf('current', 'D:/workspaces/alpha')
    const api = harness()
    const listed = await api.catalog('current')
    const handle = listed.body.projects[0].openHandle
    const forged = await api.open({ sessionId: 'current', openHandle: handle.slice(0, -4) + 'aaaa', projectId: left.pid })
    const foreign = await api.open({ sessionId: 'current', openHandle: handle, workspaceKey: 'a'.repeat(64), projectId: 'proj-other' })
    const swapped = await api.open({ sessionId: 'root-b', openHandle: handle })
    assert.equal(forged.status, 403)
    assert.equal(foreign.status, 200)
    assert.equal(foreign.body.sessionId, 'root-a')
    assert.equal(swapped.status, 403)
    assert.equal(store.bindingOfRootSession('current'), null)
    assert.equal(store.bindingOfRootSession('root-b').projectId !== left.pid, true)
  })

  test('legacy-unassigned stays out of every workspace catalog', async () => {
    store.createProject({ rootSessionId: 'root-offline', title: '离线旧课题' })
    sessions['root-new'] = sessionOf('root-new', 'D:/workspaces/alpha')
    seed('root-new', 'D:/workspaces/alpha', { title: '新课题', question: '新问题' })
    sessions['root-ambiguous'] = sessionOf('root-ambiguous', 'D:/workspaces/alpha')
    store.createProject({ rootSessionId: 'root-ambiguous', title: '含糊课题' })
    sessions.viewer = sessionOf('viewer', 'D:/workspaces/alpha')
    const api = harness({
      workingDirectory: {
        get(session) {
          return session.id === 'root-ambiguous' ? 'D:/workspaces/other' : session.header.cwd
        },
      },
    })
    const listed = await api.catalog('viewer')
    assert.deepEqual(listed.body.projects.map((item) => item.title), ['新课题'])
    assert.equal(JSON.stringify(listed.body).includes('离线旧课题'), false)
    assert.equal(JSON.stringify(listed.body).includes('含糊课题'), false)
    assert.equal(store.projectAuthOf(store.bindingOfRootSession('root-ambiguous').projectId).workspaceStatus, 'legacy-unassigned')
  })

  test('set-metadata cannot change the authorization workspace key', () => {
    sessions['root-a'] = sessionOf('root-a', 'D:/workspaces/alpha')
    const pid = store.createProject({ rootSessionId: 'root-a', title: '课题', workspaceKey: workspaceKeyOf('D:/workspaces/alpha') })
    const before = store.projectAuthOf(pid).workspaceKey
    executePaperCommands(store, refOf(pid, 'root-a'), {
      mutationId: 'meta-attack',
      operations: [{ command: 'project.set-metadata', payload: { title: '改名', workspaceIdentity: 'client-key', workspaceKey: 'b'.repeat(64) } }],
    })
    const after = store.projectAuthOf(pid)
    assert.equal(after.workspaceKey, before)
    assert.equal(after.workspaceStatus, 'assigned')
    assert.equal(store.snapshotOf(pid).snapshot.metadata.workspaceKey, undefined)
    assert.equal(store.snapshotOf(pid).snapshot.metadata.workspaceIdentity, 'client-key')
  })

  test('opening an offline root does not attach the current session', async () => {
    seed('root-a', 'D:/workspaces/shared', { title: '离线课题', question: '问题' })
    sessions.current = sessionOf('current', 'D:/workspaces/shared')
    store.createProject({ rootSessionId: 'current', title: '当前', workspaceKey: workspaceKeyOf('D:/workspaces/shared') })
    const api = harness()
    const listed = await api.catalog('current')
    const target = listed.body.projects.find((item) => item.title === '离线课题')
    delete sessions['root-a']
    const result = await api.open({ sessionId: 'current', openHandle: target.openHandle })
    assert.equal(result.status, 409)
    assert.equal(result.body.kind, 'unavailable')
    assert.equal(store.bindingOfRootSession('current').title, '当前')
    assert.equal(store.bindingOfRootSession('root-a').title, '离线课题')
  })
})
