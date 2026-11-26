import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectStore } from '../lib/project-store.js'
import { changeExpertConfig, expertConfig, expertScope, globalExpertSkills } from '../lib/project-experts.js'
import { installSkill, projectExpertInstructions, removeSkill } from '../lib/skillmenu.js'
import { registerTeamTools } from '../lib/team.js'

test('project-only selection, installs, global references and live expert dispatch', async t => {
  const home = mkdtempSync(join(tmpdir(), 'science-experts-'))
  const original = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const store = ProjectStore.open(home)
  t.after(() => {
    store.close()
    if (original === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = original
    rmSync(home, { recursive: true, force: true })
  })
  const a = store.createProject({ rootSessionId: 'root-a', title: 'A' })
  const b = store.createProject({ rootSessionId: 'root-b', title: 'B' })
  const tools = {}
  const messages = []
  const ctx = {
    get: name => name === 'sessions' ? { get: id => id === 'unknown' ? null : { header: { id, parentSession: id === 'fork' ? 'root-a' : null } } } : null,
    skills: { list: async (...args) => {
      assert.equal(args.length, 0)
      return [
        { name: 'paper-skill', path: '/global/paper/SKILL.md', provider: 'filesystem', source: 'user-dsh' },
        { name: 'manual', invocation: { modelInvocable: false } },
      ]
    } },
    tools: { register: def => { tools[def.name] = def } },
    subagents: {
      startActivation: async opts => { messages.push(opts.request.prompt[0].text); return { childId: opts.childId } },
      sendMessage: async (_agent, _id, content) => { messages.push(content[0].text) },
    },
  }
  const exec = { agent: { id: 'root-a' } }
  registerTeamTools(ctx, { store })
  assert.throws(() => expertScope(ctx, store, 'fork', true))
  assert.throws(() => expertScope(ctx, store, 'unknown', true))
  assert.equal(expertScope(ctx, store, 'root-a', true).projectId, a)
  assert.deepEqual((await tools.sci_team_spawn_all.execute({}, exec)).results, [])
  changeExpertConfig(a, { action: 'preset', value: 'writing' })
  changeExpertConfig(a, { action: 'add', role: 'writer' })
  assert.deepEqual(expertConfig(a).roles, ['writer', 'reviewer'])
  assert.deepEqual(expertConfig(b).roles, [])
  const cloneImpl = async (_url, dir) => writeFileSync(join(dir, 'SKILL.md'), '---\nname: project-only\n---\nTest')
  const options = { role: 'writer', repoUrl: 'https://github.com/example/writing', cloneImpl }
  const installed = await installSkill({ ...options, projectId: a })
  assert.equal(installed.ok, true)
  assert.equal((await projectExpertInstructions(ctx, b, 'writer')), '')
  const spawned = await tools.sci_team_spawn_all.execute({}, exec)
  assert.equal(spawned.results.length, 2)
  assert.ok(messages[0].includes(installed.indexMd))
  const global = await globalExpertSkills(ctx)
  assert.deepEqual(global.map(s => s.name), ['paper-skill'])
  changeExpertConfig(a, { action: 'link', role: 'writer', kind: 'global', value: 'paper-skill' }, global)
  changeExpertConfig(a, { action: 'link', role: 'writer', kind: 'plugin', value: 'https://www.npmjs.com/package/example' })
  await tools.sci_team_send.execute({ to: 'writer', message: '检查稿件' }, exec)
  assert.match(messages.at(-1), /global\/paper\/SKILL.md/)
  assert.match(messages.at(-1), /npmjs.com\/package\/example/)
  const second = await installSkill({ ...options, projectId: b })
  assert.notEqual(second.indexMd, installed.indexMd)
  await removeSkill({ role: 'writer', name: 'writing', projectId: a })
  assert.ok(existsSync(second.dir))
  assert.equal(existsSync(installed.dir), false)
  changeExpertConfig(a, { action: 'hide', role: 'writer' })
  const before = messages.length
  await assert.rejects(tools.sci_team_send.execute({ to: 'writer', message: '测试' }, exec), /移除/)
  assert.equal(messages.length, before)
})
