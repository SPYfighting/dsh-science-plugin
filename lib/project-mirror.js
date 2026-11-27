import { randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { blueprintViewOf, readScope } from './project-adapter.js'
import { createRecordScopeResolver } from './project-context.js'
import { sanitizeTeamState } from './team.js'

const ledgers = new Set(['team.json', 'reviews.json', 'figures.json', 'figure-plans.json', 'ssh-jobs.json', 'blueprint.json'])

function scopedLedger(name, text, scope, store) {
  if (name === 'blueprint.json') return blueprintViewOf(scope.snapshot)
  const ledger = JSON.parse(text)
  const resolver = createRecordScopeResolver({ store })
  const belongs = (record) => resolver.inScope(record, scope.ref)
  if (name === 'team.json') {
    const team = sanitizeTeamState(ledger, { store })
    const members = team.members.filter(belongs)
    const tasks = team.tasks.filter(belongs)
    const taskSeq = tasks.reduce((max, t) => Math.max(max, Number(/^task-(\d+)$/.exec(t.id)?.[1]) || 0), 0)
    return { members, tasks, taskSeq }
  }
  if (Array.isArray(ledger)) return ledger.filter(belongs)
  return Object.fromEntries(Object.entries(ledger).filter(([, record]) => belongs(record)))
}

// The host ledger remains authoritative. A working directory may contain several
// projects, so their portable snapshots use the trusted project ID, even on first use.
export function makeProjectMirror(ctx, store, log) {
  return (name, text, exec) => {
    if (!store || !ledgers.has(name) || !exec?.agent?.session) return
    try {
      const scope = readScope(ctx, exec, { store })
      if (!scope.ok || !scope.snapshot || !scope.ref.capabilities.read) return
      const id = scope.ref.projectId
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) return
      const cwd = ctx.workingDirectory?.get(exec.agent.session)
      if (!cwd) return
      const json = JSON.stringify(scopedLedger(name, text, scope, store), null, 2)
      let dir = cwd
      for (const component of ['.dsh-science', 'projects', id]) {
        dir = join(dir, component)
        mkdirSync(dir, { recursive: true })
        if (!lstatSync(dir).isDirectory()) throw new Error('镜像路径不是普通目录')
      }
      const temp = join(dir, `.${name}.${randomUUID()}.tmp`)
      try {
        writeFileSync(temp, json, { flag: 'wx', mode: 0o600 })
        renameSync(temp, join(dir, name))
      } finally {
        rmSync(temp, { force: true })
      }
    } catch (error) {
      log(`mirror skipped (${name}): ${error.message}`)
    }
  }
}
