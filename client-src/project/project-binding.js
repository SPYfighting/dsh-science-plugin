// dsh-science — Project binding 与客户端状态机（T3.1，阶段 3）
//
// 设计真源 §10.3：唯一 authoritative 项目绑定；客户端只以当前 sessionId 建立观察流并读取
// 一致 baseline；revision 变化才读取；断线保留 last-known-good 并标 stale；重连建立新
// generation；revision gap 立即补读 baseline。客户端不保存第二份业务真源——这里只持有
// 指针（projectId/revision/ref）与最后一份快照缓存（供卡片渲染，随流更新）。
//
// 状态：loading | empty（未绑定项目） | ready | offline（断线，保留 last-known-good）
//       | unauthorized（会话无效） | corrupt（快照损坏，只读恢复提示）

export function createProjectBinding({ getSessionId, fetchImpl, eventSourceImpl, onLog } = {}) {
  // 统一 fetch 形状：返回 { ok, status, body }（body 已解析）
  const fetchJson = fetchImpl || ((url, opts) => fetch(url, { credentials: 'same-origin', ...opts }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) })))
  const fetchImplFallback = fetchJson
  const _fetch = fetchJson
  const ES = eventSourceImpl || (typeof EventSource !== 'undefined' ? EventSource : null)

  let generation = 0
  let disposed = false
  let observe = null // { es, sid, gen }
  let state = { status: 'loading', project: null, ref: null, revision: null, error: null, stale: false, updatedAt: 0 }
  const listeners = new Set()

  function emit(patch) {
    state = { ...state, ...patch }
    for (const listener of listeners) {
      try { listener(state) } catch { /* 单个订阅者失败不影响其余 */ }
    }
  }

  function closeObserve() {
    if (observe) {
      try { observe.es.close() } catch { /* ignore */ }
      observe = null
    }
  }

  function startObserve(sid, gen) {
    if (disposed || !ES) return
    if (observe && observe.sid === sid && observe.gen === gen) return
    closeObserve()
    let es
    try {
      es = new ES(`/plugins/dsh-science/project/observe?sessionId=${encodeURIComponent(sid)}`)
    } catch (err) {
      emit({ stale: true, error: `observe 建立失败：${err && err.message}` })
      return
    }
    observe = { es, sid, gen }
    const guarded = (fn) => (...args) => {
      if (disposed || gen !== generation || !observe || observe.es !== es) return
      fn(...args)
    }
    es.addEventListener('baseline', guarded((ev) => {
      // baseline 到达但 generation 已推进时忽略（guarded 已挡）；这里只处理与当前一致的
      const data = safeParse(ev.data)
      if (!data) return
      if (data.revision != null && (data.revision !== state.revision || (data.projectionVersion != null && data.projectionVersion !== state.project?.projectionVersion))) {
        void refetch(sid, gen)
      } else if (data.revision == null && state.status === 'ready') {
        emit({ status: 'empty', project: null, revision: null, stale: false })
      }
    }))
    es.addEventListener('change', guarded((ev) => {
      const frame = safeParse(ev.data)
      if (!frame) return
      const rev = frame.projectRevision
      if (rev == null) return
      if (state.revision != null && rev <= state.revision) return // 只接受更高 revision
      if (rev > (state.revision ?? -1) + 1) {
        // gap：立即补读 baseline（服务端响应当前 revision；outbox 继续补发遗漏通知）
        void refetch(sid, gen)
        return
      }
      // 正常增量：revision +1，拉取新快照（投影只传指针，快照按需读）
      void refetch(sid, gen)
    }))
    es.addEventListener('reset', guarded((ev) => {
      const data = safeParse(ev.data)
      if (!data) return
      emit({ stale: false })
      void refetch(sid, gen)
    }))
    es.addEventListener('streamFailure', guarded((ev) => {
      const data = safeParse(ev.data) || {}
      emit({ stale: true, error: `流失败：${data.reason || 'unknown'}` })
      closeObserve()
      scheduleReconnect(sid, gen)
    }))
    es.onerror = guarded(() => {
      // 断线：保留 last-known-good 并标 stale；EventSource 自动重连，成功后按 revision 补读
      emit({ stale: true, error: '连接中断，状态可能过期' })
    })
  }

  let reconnectTimer = null
  function scheduleReconnect(sid, gen) {
    if (disposed || reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (disposed || gen !== generation) return
      void refresh()
    }, 2000)
  }

  async function refetch(sid, gen) {
    try {
      const res = await _fetch(`/plugins/dsh-science/project/get?sessionId=${encodeURIComponent(sid)}`)
      if (disposed || gen !== generation) return // 旧 generation 的响应不能覆盖新结果
      if (!res.ok || !res.body) {
        emit({ stale: true, error: `读取失败（HTTP ${res.status}）` })
        return
      }
      const body = res.body
      if (!body.project) {
        emit({ status: 'empty', project: null, ref: body.ref || state.ref, revision: null, stale: false, error: null, updatedAt: Date.now() })
        return
      }
      emit({
        status: 'ready',
        project: body.project,
        team: body.team || { members: [], tasks: [] },
        ref: body.ref || state.ref,
        revision: body.project.revision,
        stale: false,
        error: null,
        updatedAt: Date.now(),
      })
    } catch (err) {
      if (disposed || gen !== generation) return
      emit({ stale: true, error: `读取失败：${(err && err.message) || 'network'}` })
    }
  }

  async function refresh() {
    if (disposed) return state
    const gen = ++generation // 切换 session/显式刷新：立即解绑旧流（旧 generation 全部作废）
    closeObserve()
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    const sid = getSessionId()
    if (!sid) {
      emit({ status: 'loading', project: null, ref: null, revision: null, stale: false, error: null })
      return state
    }
    try {
      const res = await _fetch(`/plugins/dsh-science/project/get?sessionId=${encodeURIComponent(sid)}`)
      if (disposed || gen !== generation) return state
      if (res.status === 404) {
        emit({ status: 'unauthorized', project: null, ref: null, revision: null, stale: false, error: 'unknown-session' })
        return state
      }
      if (!res.ok || !res.body) {
        emit({ status: 'offline', stale: true, error: `HTTP ${res.status}` })
        scheduleReconnect(sid, gen)
        return state
      }
      const body = res.body
      if (!body.project) {
        emit({ status: 'empty', project: null, ref: body.ref || null, revision: null, stale: false, error: null, updatedAt: Date.now() })
        startObserve(sid, gen)
        return state
      }
      emit({ status: 'ready', project: body.project, team: body.team || { members: [], tasks: [] }, ref: body.ref || null, revision: body.project.revision, stale: false, error: null, updatedAt: Date.now() })
      startObserve(sid, gen)
      return state
    } catch (err) {
      if (disposed || gen !== generation) return state
      emit({ status: 'offline', stale: true, error: (err && err.message) || 'network' })
      scheduleReconnect(sid, gen)
      return state
    }
  }

  // 确定性动作（act 白名单）——带 expectedRevision；结果交由调用方呈现
  async function act({ actionId, commandId, payload, expectedRevision }) {
    const sid = getSessionId()
    if (!sid) return { status: 400, body: { kind: 'invalid', reason: '无当前会话' } }
    try {
      const raw = await fetchImplFallback(`/plugins/dsh-science/project/act`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, actionId, commandId, payload, expectedRevision }),
      })
      // 兼容两种 fetch 形状：原生 Response（.json()）与内部形状（{ok,status,body}）
      let status = 0
      let body = null
      if (typeof raw.json === 'function') {
        status = raw.status
        body = await raw.json().catch(() => null)
      } else {
        status = raw.status
        body = raw.body
      }
      return { status, body }
    } catch (err) {
      return { status: 0, body: { kind: 'invalid', reason: (err && err.message) || 'network' } }
    }
  }

  function subscribe(listener) {
    listeners.add(listener)
    listener(state)
    return () => listeners.delete(listener)
  }

  function getState() { return state }

  function dispose() {
    disposed = true
    closeObserve()
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    listeners.clear()
  }

  return { refresh, act, subscribe, getState, dispose }
}

function safeParse(text) {
  try { return JSON.parse(text) } catch { return null }
}

// ---- React 绑定 ---------------------------------------------------------------
export function bindToReact(binding, useState, useEffect) {
  const [snap, setSnap] = useState(binding.getState())
  useEffect(() => binding.subscribe(setSnap), [])
  return snap
}
