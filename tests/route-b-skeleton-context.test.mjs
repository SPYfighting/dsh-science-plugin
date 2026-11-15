import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const home = mkdtempSync(join(tmpdir(), 'dsh-routeb-skeleton-'))
process.env.DSH_HOME = home

const { ProjectStore } = await import('../lib/project-store.js')
const { executePaperCommands, contentHashOf } = await import('../lib/project-domain.js')
const { buildContextPack, citeObject, stateChangeSummary, parseObjectRef } = await import('../lib/skeleton-context.js')
const { handoffToComposer, handoffTextFor } = await import('../client-src/conversation/composer-handoff.js')

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

describe('skeleton context', () => {
  beforeEach(() => resetHome())

  test('conversation proposal, later evidence, stale result edit, and old confirmation are kept apart', () => {
    const pid = store.createProject({ rootSessionId: 'root-a', title: '课题甲' })
    const ref = refOf(pid, 'root-a')
    run(pid, 'root-a', 'build-skeleton', [
      { command: 'paper.set-question', payload: { question: '甲的研究问题' } },
      { command: 'paper.propose-core', payload: { claim: '甲的核心主张' } },
      { command: 'paper.propose-result', payload: { claim: '甲的第一个结果', title: '结果一' } },
      { command: 'paper.record-proposal', payload: { source: 'conversation:turn-1', objectIds: ['res-1'] } },
    ])
    const first = store.snapshotOf(pid).snapshot
    const result = first.paper.results[0]
    run(pid, 'root-a', 'add-evidence', [{
      command: 'paper.record-evidence',
      payload: { resultId: 'res-1', claimIds: ['res-1-claim-1'], direction: 'supports', state: 'observed', note: '第二次对话补充的证据' },
    }])
    const confirmed = store.snapshotOf(pid).snapshot
    const confirmedResult = confirmed.paper.results[0]
    const hash = contentHashOf(confirmedResult)
    run(pid, 'root-a', 'confirm-r1', [{
      command: 'paper.confirm-revision',
      payload: { objectId: 'res-1', expectedObjectRevision: confirmedResult.revision, expectedHash: hash },
    }])
    run(pid, 'root-a', 'revise-result', [{ command: 'paper.update-result', payload: { resultId: 'res-1', claim: '甲的修订后结果' } }])
    const revised = store.snapshotOf(pid).snapshot.paper.results[0]
    assert.equal(revised.revision, confirmedResult.revision + 1)
    assert.equal(revised.confirmed, false)
    assert.equal(revised.history[0].claim, '甲的第一个结果')
    assert.deepEqual(revised.history[0].evidenceIds, ['res-1-ev-1'])
    const rejected = executePaperCommands(store, ref, {
      mutationId: 'old-card',
      operations: [{ command: 'paper.confirm-revision', payload: { objectId: 'res-1', expectedObjectRevision: confirmedResult.revision, expectedHash: hash } }],
    })
    assert.notEqual(rejected.kind, 'applied')
    const stale = citeObject(store.snapshotOf(pid).snapshot, { objectId: 'res-1', expectedRevision: confirmedResult.revision })
    assert.equal(stale.status, 'stale')
    assert.equal(stale.cited.claim, '甲的第一个结果')
    assert.equal(stale.current.claim, '甲的修订后结果')
    assert.equal(stale.objectId, 'res-1')
    assert.equal(result.id, 'res-1')
  })

  test('switching projects does not mix the previous context, and missing source cannot overwrite state', () => {
    const a = store.createProject({ rootSessionId: 'root-a', title: '甲' })
    const b = store.createProject({ rootSessionId: 'root-b', title: '乙' })
    run(a, 'root-a', 'a', [
      { command: 'paper.set-question', payload: { question: '只属于甲的问题' } },
      { command: 'paper.propose-result', payload: { claim: '甲的结果', title: '甲' } },
    ])
    run(b, 'root-b', 'b', [
      { command: 'paper.set-question', payload: { question: '只属于乙的问题' } },
      { command: 'paper.propose-result', payload: { claim: '乙的结果', title: '乙' } },
    ])
    const pack = buildContextPack(store.snapshotOf(b).snapshot, { objectRef: { objectId: 'res-1', expectedRevision: 1 } })
    assert.equal(JSON.stringify(pack).includes('只属于甲的问题'), false)
    assert.equal(JSON.stringify(pack).includes('甲的结果'), false)
    assert.equal(pack.project.question, '只属于乙的问题')
    const rejected = run(b, 'root-b', 'no-source', [{ command: 'paper.record-proposal', payload: { note: '# 任意 Markdown' } }])
    assert.equal(rejected.kind, 'invalid')
    assert.match(rejected.reason, /来源/)
  })

  test('result handoff appends a stable revision ref and does not replace the draft', async () => {
    const text = handoffTextFor('structure', { objectId: 'res-1', revision: 2 })
    assert.equal(parseObjectRef(text).expectedRevision, 2)
    let options = null
    const result = await handoffToComposer({
      ctx: { get: () => ({ binding: () => ({ id: 's' }), input: { requestDraftInitialization: (_binding, value) => { options = value; return 'applied' } } }) },
      sessionId: 's',
      kind: 'structure',
      target: { objectId: 'res-1', revision: 2 },
      openConversation() {},
    })
    assert.equal(result.ok, true)
    assert.equal(options.whenDraftExists, 'append')
    assert.equal(options.prompt.includes('[[dsh-science-ref objectId=res-1 revision=2]]'), true)
  })

  test('a model reply without a write receipt is not labeled saved', () => {
    assert.equal(stateChangeSummary({ ok: true, note: '只是讨论' }), null)
    assert.equal(stateChangeSummary({ ok: true, saved: false, context: { kind: 'project-context' } }), null)
    assert.equal(stateChangeSummary({ ok: true, saved: true, receipt: { revision: 2 } }).includes('已保存'), true)
  })

  test('archiving keeps the old task and evidence relation queryable', () => {
    const pid = store.createProject({ rootSessionId: 'root-a', title: '甲' })
    run(pid, 'root-a', 'seed', [{ command: 'paper.propose-result', payload: { claim: '可归档结果', title: '结果' } }])
    run(pid, 'root-a', 'evidence', [{ command: 'paper.record-evidence', payload: { resultId: 'res-1', claimIds: ['res-1-claim-1'], direction: 'supports', state: 'observed', note: '证据' } }])
    run(pid, 'root-a', 'archive', [{ command: 'paper.archive-object', payload: { objectId: 'res-1' } }])
    const archived = store.snapshotOf(pid).snapshot.paper.results[0]
    assert.equal(archived.archived, true)
    assert.equal(archived.history.at(-1).reason, 'archive')
    assert.deepEqual(archived.history.at(-1).evidenceIds, ['res-1-ev-1'])
    assert.deepEqual(archived.evidence.map((item) => item.id), ['res-1-ev-1'])
  })
})
