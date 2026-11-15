// dsh-science — 工作区授权键（路线 B T7）
//
// workspaceKey 只从宿主工作区事实生成。客户端、project.set-metadata 和 snapshot
// metadata 都不能提供或覆盖这个键。

import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

export function canonicalWorkspacePath(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  try {
    return realpathSync(text)
  } catch {
    try { return resolve(text) } catch { return '' }
  }
}

export function workspaceKeyOf(rawPath) {
  const path = canonicalWorkspacePath(rawPath)
  if (!path) return ''
  return createHash('sha256').update('dsh-science-workspace-v1\0').update(path).digest('hex')
}

function sessionServiceOf(ctx) {
  if (!ctx) return null
  try {
    const sessions = ctx.get('sessions')
    if (sessions && typeof sessions.get === 'function') return sessions
  } catch { /* fall through */ }
  try {
    if (ctx.sessions && typeof ctx.sessions.get === 'function') return ctx.sessions
  } catch { /* ignore */ }
  return null
}

export function liveSessionOf(ctx, sessionId) {
  const sessions = sessionServiceOf(ctx)
  if (!sessions) return null
  try { return sessions.get(String(sessionId || '')) || null } catch { return null }
}

// workingDirectory.get(session) 与 header.cwd 都存在且不同 → ambiguous，不得回填。
export function workspaceFactOf(ctx, sessionId) {
  const session = liveSessionOf(ctx, sessionId)
  if (!session) return { status: 'unknown' }
  const paths = []
  if (ctx && ctx.workingDirectory && typeof ctx.workingDirectory.get === 'function') {
    try {
      const canonical = canonicalWorkspacePath(ctx.workingDirectory.get(session))
      if (canonical) paths.push(canonical)
    } catch { /* 服务失败时只看 header */ }
  }
  const headerCwd = session.header && session.header.cwd
  if (headerCwd) {
    const canonical = canonicalWorkspacePath(headerCwd)
    if (canonical) paths.push(canonical)
  }
  const unique = [...new Set(paths)]
  if (unique.length === 1) return { status: 'unique', path: unique[0] }
  if (unique.length > 1) return { status: 'ambiguous' }
  return { status: 'unknown' }
}
