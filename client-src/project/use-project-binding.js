// dsh-science — 共享 Project Binding React adapter（路线 B T5）
//
// 设计真源 §10.3：客户端只有一个 authoritative 项目绑定。dock、右栏、完整工作台
// 都通过本 hook 消费同一个 createProjectBinding 实例（按 session 复用 + 引用计数），
// 因此三处的 projectId / revision / 待确认数天然一致。
//
// 约束：
// - 不轮询 /state；身份与 revision 只来自 /project/get + SSE observe。
// - sessionId 变化立即进入新 generation：旧绑定退订/释放，视图先清空为骨架，
//   新 session 的响应只写入新绑定；旧 session 的迟到响应无法进入新视图。
// - 同一项目断线时保留 last-known-good 并标 stale；新 session 未加载不显示旧项目。
// - 只读绑定，不触碰 composer、选区、IME、Undo 或附件。
import { useCallback, useEffect, useState } from 'react'
import { createProjectBinding } from './project-binding.js'
import { objectContentHashesOf } from './object-hash.js'
import { projectRawOf, stateViewOf } from '../workbench/state-view.js'

// 本地 session 探测只读宿主内存状态，不发网络请求；优先使用 subscribeSession。
const SESSION_POLL_MS = 1000

const registry = new Map()

function sessionOf(services) {
  try { return services?.getSessionId?.() || null } catch { return null }
}

function acquire(sessionId) {
  const existing = registry.get(sessionId)
  if (existing) {
    existing.refs += 1
    return { entry: existing, created: false }
  }
  const entry = { binding: createProjectBinding({ getSessionId: () => sessionId }), refs: 1 }
  registry.set(sessionId, entry)
  return { entry, created: true }
}

function release(sessionId) {
  const entry = registry.get(sessionId)
  if (!entry) return
  entry.refs -= 1
  if (entry.refs > 0) return
  try { entry.binding.dispose() } catch { /* ignore */ }
  registry.delete(sessionId)
}

const LOADING = Object.freeze({ status: 'loading', project: null, ref: null, revision: null, stale: false, error: null, updatedAt: 0 })

/** 共享项目绑定：返回 binding 快照 + 由 project snapshot 派生的 view（无 /state 参与）。 */
export function useProjectBinding(services) {
  const readSession = useCallback(() => sessionOf(services), [services])
  const [sessionId, setSessionId] = useState(readSession)
  const [snap, setSnap] = useState(LOADING)
  const [derived, setDerived] = useState({ projectId: null, revision: null, raw: null, view: null, hashes: null, hashesReady: false })

  // 宿主重渲染即可发现 session 漂移；effect 在下一拍切换 generation。
  useEffect(() => {
    const current = readSession()
    if (current !== sessionId) setSessionId(current)
  })

  // session 监听：subscribeSession 优先；1s 本地兜底检查只读 sessionId，不请求 /state。
  useEffect(() => {
    let disposed = false
    const check = () => {
      if (disposed) return
      if (readSession() !== sessionId) setSessionId(readSession())
    }
    const timer = setInterval(check, SESSION_POLL_MS)
    let unsubscribe = null
    try {
      const maybe = services?.subscribeSession?.(check)
      if (typeof maybe === 'function') unsubscribe = maybe
    } catch { /* 宿主无 session 订阅面时退回本地检查 */ }
    return () => {
      disposed = true
      clearInterval(timer)
      if (unsubscribe) { try { unsubscribe() } catch { /* ignore */ } }
    }
  }, [readSession, services, sessionId])

  // session 变化：先清空旧项目（骨架态），再为当前 session 建立/复用绑定。
  useEffect(() => {
    let active = true
    setSnap(LOADING)
    setDerived({ projectId: null, revision: null, raw: null, view: null, hashes: null, hashesReady: false })
    if (!sessionId) {
      setSnap({ ...LOADING, status: 'empty' })
      return undefined
    }
    const { entry, created } = acquire(sessionId)
    const { binding } = entry
    setSnap(binding.getState())
    const unsubscribe = binding.subscribe((next) => { if (active) setSnap(next) })
    // 首个消费者负责建立 baseline/SSE；同一 session 的后续消费者直接共享，不重复 refresh。
    if (created) void binding.refresh()
    return () => {
      active = false
      try { unsubscribe() } catch { /* ignore */ }
      release(sessionId)
    }
  }, [sessionId])

  // 由绑定快照派生 view：先同步渲染（无 hash），再补齐本地 contentHash。
  // cleanup 后的迟到 hash 结果被丢弃，不会写入新 session 的视图。
  useEffect(() => {
    let active = true
    const status = snap.status
    if (status === 'ready' && snap.project) {
      const project = snap.project
      const base = projectRawOf(project, { hashes: null, ref: snap.ref, team: snap.team })
      setDerived({ projectId: project.projectId || null, revision: project.revision ?? null, raw: base, view: stateViewOf(base), hashes: null, hashesReady: false })
      objectContentHashesOf(project).then((hashes) => {
        if (!active) return
        const raw = projectRawOf(project, { hashes, ref: snap.ref, team: snap.team })
        setDerived({ projectId: project.projectId || null, revision: project.revision ?? null, raw, view: stateViewOf(raw), hashes, hashesReady: true })
      }).catch(() => {
        if (active) setDerived((current) => ({ ...current, hashesReady: true }))
      })
      return () => { active = false }
    }
    if (status === 'empty') {
      const raw = projectRawOf(null, { ref: snap.ref })
      setDerived({ projectId: null, revision: null, raw, view: stateViewOf(raw), hashes: null, hashesReady: true })
    }
    // offline / unauthorized / loading：保留已有 last-known-good（同一项目断线）；
    // 新 session 的旧视图已在 session 切换 effect 中清空。
    return () => { active = false }
  }, [snap.status, snap.project, snap.revision, snap.ref, snap.team])

  const refresh = useCallback(async () => {
    const sid = readSession()
    const entry = sid ? registry.get(sid) : null
    if (!entry) return null
    return entry.binding.refresh()
  }, [readSession])

  const act = useCallback(async (action) => {
    const sid = readSession()
    const entry = sid ? registry.get(sid) : null
    if (!entry) return { status: 0, body: { kind: 'invalid', reason: '当前没有会话' } }
    return entry.binding.act(action)
  }, [readSession])

  return {
    sessionId,
    status: snap.status,
    stale: snap.stale === true,
    error: snap.error,
    project: snap.project,
    ref: snap.ref,
    revision: snap.revision,
    projectId: derived.projectId || snap.project?.projectId || null,
    raw: derived.raw,
    view: derived.view,
    hashes: derived.hashes,
    hashesReady: derived.hashesReady,
    loading: snap.status === 'loading' || (snap.status === 'ready' && !derived.view),
    refresh,
    act,
  }
}
