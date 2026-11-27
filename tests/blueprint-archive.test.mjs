import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

test('同一工作区的课题和修订独立存档，重试保留手改稿与旧版报告', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-science-export-'))
  const cwd = join(root, 'workspace')
  const research = join(cwd, 'research')
  mkdirSync(research, { recursive: true })
  process.env.DSH_HOME = root
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const { ProjectStore } = await import('../lib/project-store.js')
  const { executePaperCommands } = await import('../lib/project-domain.js')
  const { registerBlueprintTools } = await import('../lib/blueprint.js')
  const store = ProjectStore.open(root)
  t.after(() => store.close())
  const tools = {}
  registerBlueprintTools({
    tools: { register: (tool) => { tools[tool.name] = tool } },
    workingDirectory: { get: () => cwd },
  }, { store })
  const session = (sid) => ({ agent: { session: { id: sid } } })
  const report = (sid) => tools.sci_blueprint_export.execute({}, session(sid))
  const update = (sid, projectId, claim) => {
    const ref = { projectId, currentSessionId: sid, rootSessionId: sid, relationship: 'root', capabilities: { writePaper: true } }
    const result = executePaperCommands(store, ref, {
      mutationId: claim, operations: [{ command: 'paper.propose-core', payload: { claim } }],
    })
    assert.equal(result.kind, 'applied')
  }
  const legacy = join(research, 'blueprint-report.md')
  writeFileSync(legacy, '升级前人工补注')
  const a = store.createProject({ rootSessionId: 'session-a' })
  const b = store.createProject({ rootSessionId: 'session-b' })
  update('session-a', a, '问题 A 的第一版')
  update('session-b', b, '问题 B 的第一版')
  const first = await report('session-a')
  const other = await report('session-b')
  assert.notEqual(first.path, other.path)
  assert.equal(first.revision, other.revision)
  assert.match(readFileSync(first.path, 'utf8'), /问题 A 的第一版/)
  assert.match(readFileSync(other.path, 'utf8'), /问题 B 的第一版/)
  const retry = await report('session-a')
  assert.equal(retry.reused, true)
  assert.equal(retry.path, first.path)

  writeFileSync(first.path, '用户在导出后补写的内容')
  const regenerated = await report('session-a')
  assert.notEqual(regenerated.path, first.path)
  assert.equal(regenerated.revision, first.revision)
  assert.equal((await report('session-a')).path, regenerated.path)
  assert.equal(readFileSync(first.path, 'utf8'), '用户在导出后补写的内容')
  update('session-a', a, '问题 A 的第二版')
  const second = await report('session-a')
  assert.notEqual(second.path, regenerated.path)
  assert.ok(second.revision > first.revision)
  assert.match(readFileSync(second.path, 'utf8'), /问题 A 的第二版/)
  assert.match(readFileSync(regenerated.path, 'utf8'), /问题 A 的第一版/)
  assert.equal(readFileSync(legacy, 'utf8'), '升级前人工补注')
})

test('禁止硬链接的工作卷仍能导出，重试及人工修改均保留', async (t) => {
  const fs = (await import('node:fs')).default
  const { syncBuiltinESMExports } = await import('node:module')
  const root = mkdtempSync(join(tmpdir(), 'dsh-science-copy-'))
  const unavailable = t.mock.method(fs, 'linkSync', () => {
    throw Object.assign(new Error('unsupported'), { code: 'EOPNOTSUPP' })
  })
  syncBuiltinESMExports()
  t.after(() => { unavailable.mock.restore(); syncBuiltinESMExports(); rmSync(root, { recursive: true, force: true }) })
  const { saveBlueprintReport } = await import('../lib/blueprint-archive.js')
  const write = () => saveBlueprintReport(root, 'project-A', 3, 'archived')
  const original = write()
  assert.equal(write().reused, true)
  writeFileSync(original.path, 'user edit')
  assert.notEqual(write().path, original.path)
  assert.equal(readFileSync(original.path, 'utf8'), 'user edit')
})
