import React, { useEffect, useState } from 'react'
import { Button } from './components/ui.jsx'

const EMPTY = Object.freeze({ status: 'loading', assignment: 'unbound', projects: [], stale: false, error: null })

async function readJson(res) {
  if (typeof res.json === 'function') return res.json().catch(() => null)
  return res.body || null
}

export function ProjectCatalog({ services }) {
  const sessionId = services?.getSessionId?.() || ''
  const [state, setState] = useState(EMPTY)
  const [notice, setNotice] = useState(null)
  const [busyHandle, setBusyHandle] = useState('')

  useEffect(() => {
    let active = true
    const generation = sessionId
    setState(EMPTY)
    setNotice(null)
    if (!sessionId) {
      setState({ ...EMPTY, status: 'empty', assignment: 'unbound' })
      return undefined
    }
    ;(async () => {
      try {
        const res = await fetch(`/plugins/dsh-science/project/catalog?sessionId=${encodeURIComponent(sessionId)}`, { credentials: 'same-origin' })
        if (!active || generation !== sessionId) return
        const body = await readJson(res)
        if (res.status === 404) {
          setState({ status: 'unauthorized', assignment: 'unbound', projects: [], stale: false, error: '当前会话无效，无法列出课题。' })
          return
        }
        if (!res.ok || !body) {
          setState((current) => ({ ...current, status: current.projects.length ? 'ready' : 'offline', stale: true, error: `读取课题目录失败（HTTP ${res.status}）` }))
          return
        }
        setState({ status: 'ready', assignment: body.assignment || 'unbound', projects: Array.isArray(body.projects) ? body.projects : [], stale: false, error: null })
      } catch (err) {
        if (!active) return
        setState((current) => ({ ...current, status: current.projects.length ? 'ready' : 'offline', stale: true, error: (err && err.message) || '读取课题目录失败' }))
      }
    })()
    return () => { active = false }
  }, [sessionId])

  const openProject = async (item) => {
    if (!item?.openHandle || !sessionId) return
    setBusyHandle(item.openHandle)
    setNotice(null)
    try {
      const res = await fetch('/plugins/dsh-science/project/open', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, openHandle: item.openHandle }),
      })
      const body = await readJson(res)
      if (body?.kind === 'unavailable') {
        setNotice(body.message)
        return
      }
      if (!res.ok || body?.kind !== 'open' || !body.sessionId) {
        setNotice('无法打开该课题。句柄无效，或它不属于当前工作区。当前会话没有被改绑。')
        return
      }
      await services.openRootSession(body.sessionId)
    } catch (err) {
      setNotice((err && err.message) || '无法打开该课题的原会话。')
    } finally {
      setBusyHandle('')
    }
  }

  const projects = state.projects || []
  return <section className="sci-catalog" aria-label="项目总览">
    <header className="sci-catalog-head">
      <div>
        <p className="sci-desk-eyebrow">同一工作区</p>
        <h2>项目总览</h2>
      </div>
      <p>这里只显示课题、阶段和待处理数量。打开后进入该课题自己的会话，不会把当前会话改绑过去。</p>
    </header>
    {state.stale && <p role="status">课题目录可能已过期。{state.error}</p>}
    {state.error && !state.stale && <p role="alert">{state.error}</p>}
    {notice && <p role="status">{notice}</p>}
    {state.assignment === 'legacy-unassigned' && <p>当前课题还不能唯一归入这个工作区，因此不会混进下面的目录。它仍留在原来的会话里。</p>}
    {state.assignment === 'workspace-unknown' && <p>当前会话没有可确认的工作区，所以不能列出其他课题。</p>}
    {state.assignment === 'ambiguous' && <p>当前会话的工作区事实不一致，目录已关闭，避免把课题归错。</p>}
    {state.status === 'loading' && <p role="status">正在读取课题目录…</p>}
    {state.status !== 'loading' && projects.length === 0 && !state.error && <p>这个工作区还没有可列出的课题。</p>}
    {projects.length > 0 && <div className="sci-catalog-grid">
      {projects.map((item) => <article key={item.openHandle} className="sci-catalog-card" data-current={item.current || undefined}>
        <header>
          <span>{item.stageLabel || '研究探索'}</span>
          {item.current && <strong>当前</strong>}
        </header>
        <h3>{item.title || '未命名课题'}</h3>
        <p>{item.questionExcerpt || '还没有研究问题摘要。'}</p>
        <dl>
          <div><dt>待处理</dt><dd>{item.attentionCount || 0}</dd></div>
          <div><dt>进行中</dt><dd>{item.runningCount || 0}</dd></div>
          <div><dt>受阻</dt><dd>{item.blockedCount || 0}</dd></div>
        </dl>
        <Button primary={item.current} disabled={!item.openable || busyHandle === item.openHandle} onClick={() => openProject(item)}>
          {item.openable ? (item.current ? '回到这个课题' : '打开课题') : '原会话不在线'}
        </Button>
      </article>)}
    </div>}
  </section>
}
