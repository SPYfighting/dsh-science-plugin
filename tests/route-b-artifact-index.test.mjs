import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const home = mkdtempSync(join(tmpdir(), 'dsh-routeb-artifacts-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { executePaperCommands } = await import('../lib/project-domain.js')
const { authorizeArtifactRead, locateProjectPath } = await import('../lib/artifact-index.js')
const { handoffTextFor } = await import('../client-src/conversation/composer-handoff.js')
const { projectRawOf, stateViewOf } = await import('../client-src/workbench/state-view.js')

const dataDir = join(home, 'dsh-science')
let store = null

function resetHome() {
  if (store) { try { store.close() } catch { /* ignore */ } store = null }
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  mkdirSync(dataDir, { recursive: true })
  store = ProjectStore.open(home)
}

function refOf(pid, root) {
  return { projectId: pid, rootSessionId: root, currentSessionId: root, relationship: 'root', capabilities: { read: true, propose: true, writePaper: true, dispatch: true } }
}

function run(pid, root, mutationId, operations) {
  return executePaperCommands(store, refOf(pid, root), { mutationId, operations })
}

describe('project artifact index', () => {
  beforeEach(() => resetHome())

  test('same names stay in their projects, registration is idempotent, and old versions remain citable', () => {
    const a = store.createProject({ rootSessionId: 'root-a', title: '甲' })
    const b = store.createProject({ rootSessionId: 'root-b', title: '乙' })
    run(a, 'root-a', 'a-result', [{ command: 'paper.propose-result', payload: { claim: '甲的结果', title: '结果一' } }])
    run(b, 'root-b', 'b-result', [{ command: 'paper.propose-result', payload: { claim: '乙的结果', title: '结果一' } }])
    const payload = { kind: 'data', source: 'user-file', versionToken: 'v1', pathRef: { path: 'data/result.csv' }, summary: '原始表', resultIds: ['res-1'] }
    run(a, 'root-a', 'a-register', [{ command: 'paper.register-artifact', payload }])
    const replay = run(a, 'root-a', 'a-register-again', [{ command: 'paper.register-artifact', payload }])
    run(b, 'root-b', 'b-register', [{ command: 'paper.register-artifact', payload: { ...payload, summary: '乙的原始表' } }])
    const snapA = store.snapshotOf(a).snapshot
    const snapB = store.snapshotOf(b).snapshot
    assert.equal(snapA.artifactIndex.items.length, 1)
    assert.equal(replay.kind, 'applied')
    assert.equal(snapA.artifactIndex.items[0].summary, '原始表')
    assert.equal(snapB.artifactIndex.items[0].summary, '乙的原始表')
    assert.notEqual(snapA.artifactIndex.items[0].id, snapB.artifactIndex.items[0].id)
    const oldId = snapA.artifactIndex.items[0].id
    const conflict = run(a, 'root-a', 'replace-version', [{ command: 'paper.relink-artifact', payload: { artifactId: oldId, versionToken: 'v2', pathRef: { path: 'data/result.csv' } } }])
    assert.equal(conflict.kind, 'conflict')
    assert.equal(store.snapshotOf(a).snapshot.artifactIndex.items[0].versionToken, 'v1')
    const text = handoffTextFor('structure', { objectId: 'res-1', revision: 1 })
    assert.match(text, /objectId=res-1 revision=1/)
  })

  test('a result can trace data, code, and figure, while missing and foreign files are refused', () => {
    const pid = store.createProject({ rootSessionId: 'root-a', title: '甲' })
    run(pid, 'root-a', 'result', [{ command: 'paper.propose-result', payload: { claim: '可追溯结果', title: '结果一' } }])
    for (const [kind, token, summary] of [['data', 'data-v1', '原数据'], ['code', 'code-v1', '生成代码'], ['figure', 'figure-v1', '图件']]) {
      run(pid, 'root-a', token, [{ command: 'paper.register-artifact', payload: { kind, source: kind === 'data' ? 'user-file' : 'work-product', versionToken: token, summary, resultIds: ['res-1'], pathRef: { path: `${kind}/file` } } }])
    }
    const snap = store.snapshotOf(pid).snapshot
    const view = stateViewOf(projectRawOf({ projectId: pid, revision: 1, snapshot: snap }))
    const materials = view.paper.results[0].materials.map((item) => item.kind).sort()
    assert.deepEqual(materials, ['code', 'data', 'figure'])
    const railFigures = view.artifacts.figures
    assert.equal(railFigures.length, 1, '右栏成果必须显示当前项目已登记图件摘要')
    assert.equal(railFigures[0].title, '图件')
    assert.equal(railFigures[0].resultId, 'res-1')
    assert.equal(railFigures[0].url, null, '右栏不得用全局文件路径打开成果')
    assert.equal(view.artifacts.files.length, 0, '右栏不得扩展成全局文件列表')
    assert.equal(view.artifacts.reviews.length, 0, '右栏不得扩展成全局审查列表')
    const recent = view.artifacts.recent.map((item) => item.summary)
    assert.deepEqual(recent, ['图件', '生成代码', '原数据'])
    const record = snap.artifactIndex.items[0]
    const missing = authorizeArtifactRead({
      record,
      projectId: pid,
      hostAllows: true,
      locate: () => locateProjectPath(record.pathRef, { root: 'D:/project', exists: () => false }),
    })
    assert.equal(missing.reason, 'missing-file')
    const foreign = authorizeArtifactRead({ record, projectId: 'other', hostAllows: true, locate: () => ({ insideBoundary: true, exists: true, versionToken: record.versionToken }) })
    assert.equal(foreign.status, 404)
    const outside = authorizeArtifactRead({
      record: { ...record, pathRef: { path: '../secret.csv' } },
      projectId: pid,
      hostAllows: true,
      locate: (item) => locateProjectPath(item.pathRef, { root: 'D:/project', exists: () => true, versionOf: () => record.versionToken }),
    })
    assert.equal(outside.reason, 'path-boundary')
  })
})
