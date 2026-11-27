import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectStore } from '../lib/project-store.js'
import { executePaperCommands } from '../lib/project-domain.js'
import { makeProjectMirror } from '../lib/project-mirror.js'
import { registerBlueprintTools } from '../lib/blueprint.js'
import { runReview } from '../lib/reviewer.js'

function setup(t) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-workspace-mirror-'))
  const original = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const store = ProjectStore.open(home)
  t.after(() => { store.close(); if (original) process.env.DSH_HOME = original; else delete process.env.DSH_HOME; rmSync(home,{ recursive:true, force:true }) })
  const docs = join(home, 'dsh-science')
  const sessions = new Map()
  const projects = {}
  const dirs = {}
  const ctx = {
    tools: { register() {} },
    get: (key) => key === 'sessions' ? sessions : undefined,
    workingDirectory: { get: (session) => dirs[session.id] },
  }
  const notes = []
  const mirror = makeProjectMirror(ctx, store, (msg) => notes.push(msg))
  const exec = (sid) => ({ agent: { id: sid, session: sessions.get(sid) } })
  for (const sid of ['A','B','unbound']) {
    dirs[sid] = join(home, sid)
    mkdirSync(dirs[sid])
    sessions.set(sid, { id: sid, header: { id:sid }, snapshotEvents: () => [
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'assistant/message', data: { turn: 1, content: '本轮观察' } },
      { type: 'turn/end', data: { turn: 1 } },
    ] })
    if (sid === 'unbound') continue
    const projectId = store.createProject({rootSessionId:sid})
    projects[sid] = projectId
    const result = executePaperCommands(store, {projectId, currentSessionId:sid, rootSessionId:sid, relationship:'root', capabilities:{writePaper:true}}, {
      mutationId:`seed-${sid}`, operations:[ {command:'paper.propose-result', payload:{title:`研究 ${sid}`,claim:`主张 ${sid}`}} ],
    })
    assert.equal(result.kind,'applied')
  }
  const path = (sid, name) => join(dirs[sid], '.dsh-science', 'projects', projects[sid], name)
  const read = (sid, name) => JSON.parse(readFileSync(path(sid, name), 'utf8'))
  return {ctx, exec, store, mirror, notes, projects, dirs, docs, path, read}
}

test('每个课题的镜像只从已证实的归属取数，旧镜像、宿主主账和同目录其他课题均原样保留', (t) => {
  const {ctx, exec, store, mirror, notes, projects, dirs, docs, path, read} = setup(t)
  const tool = {}
  ctx.tools.register = (spec) => {tool[spec.name]=spec}
  registerBlueprintTools(ctx,{store,mirror})
  const team = {taskSeq:9, members:[{name:'old B',childId:'child-B',parentSessionId:'B'}],tasks:[
    {id:'task-1',projectId:projects.A,subject:'A only'},
    {id:'task-8',assignee:'old B',subject:'old B only'},
    {id:'task-9',subject:'unknown'},
  ]}
  const statePath = join(docs,'team.json')
  writeFileSync(statePath,JSON.stringify(team))
  const legacy=join(dirs.B,'.dsh-science','team.json')
  mkdirSync(join(dirs.B,'.dsh-science'))
  writeFileSync(legacy,'旧版快照，含人工批注')
  for (const sid of ['A','B','unbound','B']) mirror('team.json',JSON.stringify(team),exec(sid))
  assert.deepEqual(read('B','team.json').tasks.map(x=>x.id), ['task-8'])
  assert.deepEqual(read('A','team.json').tasks.map(x=>x.id), ['task-1'])
  assert.equal(read('B','team.json').taskSeq,8)
  assert.deepEqual(JSON.parse(readFileSync(statePath,'utf8')),team)
  assert(!existsSync(join(dirs.unbound,'.dsh-science')))
  assert.equal(readFileSync(legacy,'utf8'),'旧版快照，含人工批注')
  const aCopy = readFileSync(path('A','team.json'),'utf8')
  dirs.B=dirs.A
  mirror('team.json',JSON.stringify(team),exec('B'))
  assert.equal(readFileSync(path('A','team.json'),'utf8'),aCopy)
  assert.deepEqual(read('B','team.json').tasks.map(x=>x.id),['task-8'])
  const rows={a:{projectId:projects.A},b:{rootSessionId:'B'},child:{sessionId:'child-B'},unknown:{id:'x'}}
  for (const name of ['reviews.json','figures.json','figure-plans.json','ssh-jobs.json']) {
    mirror(name,JSON.stringify(rows),exec('B'))
    assert.deepEqual(Object.keys(read('B',name)),['b','child'])
  }
  mirror('blueprint.json',JSON.stringify({core:{claim:'foreign'}}),exec('B'))
  assert.equal(read('B','blueprint.json').results[0].claim,'主张 B')
  assert.deepEqual(notes,[])
})

test('任务与图件补挂不能将其他项目或无归属的记录写入本项目；被拒操作不推进修订', async (t) => {
  const { ctx, exec, store, mirror, projects, docs } = setup(t)
  const tools = {}
  ctx.tools.register = def => { tools[def.name] = def }
  registerBlueprintTools(ctx, {store,mirror})
  writeFileSync(join(docs,'team.json'),JSON.stringify({members:[],tasks:[
    {id:'task-1',projectId:projects.A},{id:'task-2'},{id:'task-3',rootSessionId:'B'},
  ]}))
  writeFileSync(join(docs,'figures.json'),JSON.stringify({
    a:{id:'a',projectId:projects.A}, unknown:{id:'unknown'}, b:{id:'b',rootSessionId:'B'},
  }))
  const rev=store.revisionOf(projects.B)
  for(const id of ['task-1','task-2']){
    await assert.rejects(tools.sci_blueprint_align.execute({task_id:id,result_id:'res-1'},exec('B')), /当前项目/)
  }
  for(const id of ['a','unknown']){
    await assert.rejects(tools.sci_blueprint_link_figure.execute({figure_id:id,result_id:'res-1'},exec('B')), /当前项目/)
  }
  assert.equal(store.revisionOf(projects.B),rev)
  assert((await tools.sci_blueprint_align.execute({task_id:'task-3',result_id:'res-1'},exec('B'))).ok)
  assert((await tools.sci_blueprint_link_figure.execute({figure_id:'b',result_id:'res-1'},exec('B'))).ok)
})

test('旧数组审查台账保留原序，两个同时开始的审查均持久化，失败记录也仅镜像到各自课题', async (t) => {
  const {ctx,exec,store,mirror,docs,read}=setup(t)
  const log=join(docs,'reviews.json')
  writeFileSync(log,JSON.stringify([{id:'legacy',projectId:'historical',findings:[{message:'历史结论'}]}]))
  t.mock.method(Date,'now',()=>1234567890000)
  ctx.subagents={startActivation:async()=>{throw new Error('offline reviewer')}}
  const results=await Promise.all(['A','B'].map(sid=>runReview(ctx,exec(sid).agent,sid,1,{store,mirror})))
  assert(results.every(r=>!r.ok && r.reason.includes('offline reviewer')))
  const ledger=JSON.parse(readFileSync(log,'utf8'))
  assert(Array.isArray(ledger)); assert.equal(ledger.length,3)
  assert.equal(ledger[0].findings[0].message,'历史结论')
  assert.equal(new Set(ledger.map(r=>r.id)).size,3)
  for (const sid of ['A','B']) assert.deepEqual(read(sid,'reviews.json').map(r=>r.sessionId),[sid])
})
