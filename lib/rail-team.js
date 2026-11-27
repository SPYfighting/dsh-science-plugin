// dsh-science — 右栏团队摘要（路线 B T8）
//
// 只返回当前项目已归属的成员和任务摘要。无 projectId/rootSessionId 的旧记录
// 保持未归属，不因安装里只有一个项目而进入右栏。

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDirOf } from './store.js'
import { sanitizeTeamState } from './team.js'
import { createRecordScopeResolver } from './project-context.js'

export function railTeamOf(ref, { store = null, team = null } = {}) {
  const source = team || loadTeam(store)
  const scope = createRecordScopeResolver({ store })
  const matches = (record) => scope.inScope(record, ref)
  return {
    members: (source.members || []).filter(matches).map((member) => ({
      name: String(member.name || ''),
      role: String(member.role || ''),
      label: String(member.label || member.role || member.name || ''),
      childId: member.childId ? String(member.childId) : '',
      parentSessionId: member.parentSessionId ? String(member.parentSessionId) : '',
      projectId: member.projectId ? String(member.projectId) : '',
      rootSessionId: member.rootSessionId ? String(member.rootSessionId) : '',
    })),
    tasks: (source.tasks || []).filter(matches).map((task) => ({
      id: String(task.id || ''),
      subject: String(task.subject || ''),
      status: String(task.status || 'pending'),
      assignee: task.assignee ? String(task.assignee) : '',
      dependencyPolicy: task.dependencyPolicy || 'finished',
      blockedBy: Array.isArray(task.blockedBy) ? task.blockedBy.map(String) : [],
      resultIds: [...new Set([...(Array.isArray(task.resultIds) ? task.resultIds : []), task.resultId].filter(Boolean).map(String))],
      projectId: task.projectId ? String(task.projectId) : '',
      rootSessionId: task.rootSessionId ? String(task.rootSessionId) : '',
    })),
  }
}

function loadTeam(store) {
  try {
    const file = join(dataDirOf(), 'team.json')
    if (!existsSync(file)) return { members: [], tasks: [] }
    return sanitizeTeamState(JSON.parse(readFileSync(file, 'utf8')), { store })
  } catch {
    return { members: [], tasks: [] }
  }
}
