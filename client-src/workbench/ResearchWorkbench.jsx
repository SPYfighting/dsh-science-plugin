import React, { useEffect, useState } from 'react'
import { semanticHandoffOf, confirmObjectViaAct } from './workbench-actions.js'
import { WorkbenchStyles } from './styles.js'
import { Button, Panel, StatusMessage } from './components/ui.jsx'
import { WorkspaceOverview } from './WorkspaceOverview.jsx'
import { RESEARCH_DESK_CSS } from './research-desk-styles.js'
import { PaperSpinePage } from './PaperSpinePage.jsx'
import { TeamProgressPage } from './TeamProgressPage.jsx'
import { ArtifactsPage } from './ArtifactsPage.jsx'
import { ExpertSetupPage } from './ExpertSetupPage.jsx'
import { useProjectBinding } from '../project/use-project-binding.js'
import { ProjectCatalog } from './ProjectCatalog.jsx'

const NAV = [
  { id: 'overview', label: '概览' },
  { id: 'experts', label: '项目专家' },
  { id: 'catalog', label: '项目总览' },
  { id: 'paper', label: '论文主线' },
  { id: 'team', label: '团队进展' },
  { id: 'artifacts', label: '图表与成果' },
]

function WorkbenchMark() {
  return <span className="sci-wb-mark" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M10 3v6.2l-5.3 9.1A2.5 2.5 0 0 0 6.9 22h10.2a2.5 2.5 0 0 0 2.2-3.7L14 9.2V3"/><path d="M8 15h8M9.4 12.5h5.2"/></svg></span>
}

export function ResearchWorkbench({ services }) {
  const state = useProjectBinding(services)
  const [page, setPage] = useState('overview')
  useEffect(() => {
    try {
      if (window.__DSH_SCIENCE_OPEN_PAGE__ === 'catalog') {
        setPage('catalog')
        window.__DSH_SCIENCE_OPEN_PAGE__ = ''
      }
    } catch { /* 非浏览器宿主没有这个交接标记 */ }
  }, [])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  // 语义动作：composer handoff（不发送、不建表单）；失败提示回到对话
  const openAction = async (action, targetId = null) => {
    const handoff = semanticHandoffOf(action, targetId)
    if (!handoff) { setNotice({ tone: 'error', text: '无法识别这个动作。' }); return }
    setBusy(true); setNotice(null)
    try {
      const r = await services?.prepareHandoff?.(handoff.kind, handoff.target)
      if (r && r.ok) {
        setNotice({ tone: 'success', text: '已在对话输入框准备请求；请补充说明后发送。' })
      } else {
        const reason = (r && (r.reason || r.code)) || '当前会话不支持预填。'
        setNotice({ tone: 'error', text: `未能准备到输入框（${reason}）。请打开对话手动描述。` })
        try { services?.openConversation?.() } catch { /* ignore */ }
      }
    } finally { setBusy(false) }
  }

  // 确定性动作：直接 revision 绑定确认（不经过模型）
  const confirmResult = async (objectId, expectedObjectRevision, expectedHash) => {
    setBusy(true); setNotice(null)
    try {
      const r = await confirmObjectViaAct({
        sessionId: state.sessionId,
        objectId,
        expectedObjectRevision,
        expectedHash,
        expectedRevision: state.revision,
      })
      if (r.ok) {
        setNotice({ tone: 'success', text: '已确认当前修订；确认后才能据此派发执行任务。' })
        await state.refresh()
      } else {
        setNotice({ tone: 'error', text: r.reason || '确认未执行。' })
      }
    } finally { setBusy(false) }
  }

  const openConversation = () => services?.openConversation?.()
  const currentView = state.view
  return <div className="sci-workbench sci-desk" lang="zh-CN">
    <WorkbenchStyles /><style>{RESEARCH_DESK_CSS}</style>
    <div className="sci-wb-shell">
      <header className="sci-wb-header">
        <div className="sci-wb-brand"><WorkbenchMark /><span>科研工作台</span></div>
        <nav className="sci-wb-nav" aria-label="科研工作台页面">{NAV.map((item) => <button key={item.id} type="button" aria-current={page === item.id ? 'page' : undefined} onClick={() => setPage(item.id)}>{item.label}</button>)}</nav>
        <div className="sci-wb-head-actions"><Button onClick={openConversation}>回到对话 <span aria-hidden="true">↗</span></Button></div>
      </header>
      <main className="sci-wb-content">
        {page === 'catalog' ? <div className="sci-desk-scene"><ProjectCatalog services={services} /></div> : state.loading && !currentView ? <Panel><div className="sci-empty"><div><h2>正在读取研究状态</h2><p>工作台从当前 DSH 项目读取论文主线、团队任务和已登记成果。</p></div></div></Panel> : state.error && !currentView ? <Panel title="暂时无法读取工作台状态"><StatusMessage tone="error">{state.error}<div className="sci-result-actions"><Button onClick={state.refresh}>重新读取</Button><Button onClick={openConversation}>打开对话</Button></div></StatusMessage></Panel> : currentView && <div className="sci-desk-scene" key={page}>
          {page === 'overview' && <WorkspaceOverview view={currentView} raw={state.raw} busy={busy} onAction={openAction} onNavigate={setPage} onOpenConversation={openConversation} onOpenCatalog={() => setPage('catalog')} />}
          {page === 'paper' && <PaperSpinePage view={currentView} raw={state.raw} onAction={openAction} onConfirm={confirmResult} busy={busy} onOpenConversation={openConversation} onNavigate={setPage} />}
          {page === 'team' && <TeamProgressPage view={currentView} openMemberSession={services?.openMemberSession} memberOpenAvailable={services?.memberOpenAvailable?.(currentView)} />}
          {page === 'artifacts' && <ArtifactsPage view={currentView} onAction={openAction} />}
          {page === 'experts' && <ExpertSetupPage key={JSON.stringify([state.sessionId, state.projectId])} binding={state} services={services} />}
          {state.error && <div className="sci-small" style={{ marginTop: 14 }} role="status">状态刷新失败，正在显示上一次成功读取的数据：{state.error}</div>}
        </div>}
      </main>
    </div>
    {notice && <div className={`sci-toast`} role="status" data-tone={notice.tone}>{notice.text}<div className="sci-result-actions"><Button small onClick={openConversation}>打开对话</Button><Button small onClick={() => setNotice(null)}>关闭</Button></div></div>}
  </div>
}
