import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDirOf } from './store.js'
import { ROLES } from './roles.js'
import { resolveProjectContext } from './project-context.js'

export const EXPERT_PRESETS = {
  literature: { label: '文献调研', roles: ['literature-scout', 'topic-designer'] },
  data: { label: '数据分析', roles: ['analyst', 'figure-expert'] },
  writing: { label: '论文写作', roles: ['writer', 'reviewer'] },
}

export function expertDirectory(projectId) {
  if (typeof projectId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(projectId)) throw new Error('项目标识无效')
  return join(dataDirOf(), 'project-experts', projectId)
}

export function expertConfig(projectId) {
  if (projectId) {
    try { return JSON.parse(readFileSync(join(expertDirectory(projectId), 'experts.json'), 'utf8')) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  let roles = []
  if (projectId) {
    try {
      const team = JSON.parse(readFileSync(join(dataDirOf(), 'team.json'), 'utf8'))
      roles = [...new Set((team.members || []).filter(m => m.projectId === projectId && Object.hasOwn(ROLES, m.role)).map(m => m.role))]
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return { roles, links: {}, configured: false }
}

export function expertScope(ctx, store, sessionId, write = false) {
  if (!store) throw new Error('科研项目服务不可用')
  const scope = resolveProjectContext(ctx, sessionId, { store })
  if (!scope.ok || !scope.ref.projectId) throw new Error('请在已绑定的科研项目中配置专家')
  if (!(write ? scope.ref.capabilities.dispatch : scope.ref.capabilities.read)) throw new Error('当前会话没有此项目的操作权限')
  return scope.ref
}

export async function globalExpertSkills(ctx) {
  const service = ctx.skills || ctx.get?.('skills')
  if (!service?.list) return []
  const entries = await service.list()
  return entries.filter(s => s.invocation?.modelInvocable !== false && !String(s.source).startsWith('project-'))
    .map(({ name, source, provider, path }) => ({ name, source, provider, ...(path ? { path } : {}) }))
    .sort((a,b) => a.name.localeCompare(b.name))
}

function pluginSource(value) {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (((url.hostname === 'github.com' || url.hostname === 'gitlab.com') && /^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname)) ||
       (['npmjs.com','www.npmjs.com'].includes(url.hostname) && /^\/package\/(?:@[\w.-]+\/)?[\w.-]+\/?$/.test(url.pathname)))) return url.origin + url.pathname.replace(/\/$/, '')
  } catch {}
  throw new Error('请输入 GitHub、GitLab 仓库首页或 npm 包链接')
}

// Apply one user action to the latest file. All read/modify/rename operations
// are synchronous within the host process, including concurrent browser tabs.
export function changeExpertConfig(projectId, { action, role, value, kind }, choices = []) {
  const config = expertConfig(projectId)
  if (action === 'preset') {
    if (!Object.hasOwn(EXPERT_PRESETS, value)) throw new Error('未知方案')
    config.roles = [...new Set([...config.roles, ...EXPERT_PRESETS[value].roles])]
  } else {
    if (!Object.hasOwn(ROLES, role)) throw new Error('未知专家')
    if (action === 'add') config.roles = [...new Set([...config.roles, role])]
    else if (action === 'hide') config.roles = config.roles.filter(r => r !== role)
    else {
      if (!config.roles.includes(role)) throw new Error('请先选择该专家')
      const links = config.links[role] || []
      if (action === 'unlink') config.links[role] = links.filter(l => l.kind !== kind || l.value !== value)
      else if (action === 'link') {
        let item
        if (kind === 'plugin') item = { kind, value: pluginSource(value) }
        else if (kind === 'global' || kind === 'legacy') {
          const skill = choices.find(s => s.name === value)
          if (!skill) throw new Error('此技能已经不可用')
          item = { kind, value, ...(kind === 'global' ? { provider: skill.provider, source: skill.source } : {}) }
        } else throw new Error('未知扩展类型')
        config.links[role] = [...links.filter(l => l.kind !== kind || l.value !== item.value), item]
      } else throw new Error('未知配置操作')
    }
  }
  config.configured = true
  const dir = expertDirectory(projectId)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'experts.json')
  writeFileSync(file + '.tmp', JSON.stringify(config), 'utf8')
  renameSync(file + '.tmp', file)
  return config
}
