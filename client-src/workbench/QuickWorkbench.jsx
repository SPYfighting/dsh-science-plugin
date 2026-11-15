// Host adapter for the research sidebar. State and action wiring live here; the
// presentational ResearchRail is reused by the full workbench.
// T5：状态只来自共享 project-binding（不再轮询 /state）。
import React, { useState } from 'react'
import { semanticHandoffOf, confirmObjectViaAct } from './workbench-actions.js'
import { useProjectBinding } from '../project/use-project-binding.js'
import { ResearchRail } from './ResearchRail.jsx'
import { ProjectCatalog } from './ProjectCatalog.jsx'

export function QuickWorkbench({ services }) {
  const state = useProjectBinding(services)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [catalogOpen, setCatalogOpen] = useState(false)

  const doConfirm = async (objectId, revision, contentHash) => {
    setBusy(true); setNotice(null)
    try {
      const r = await confirmObjectViaAct({
        sessionId: state.sessionId,
        objectId,
        expectedObjectRevision: revision,
        expectedHash: contentHash,
        expectedRevision: state.revision,
      })
      if (r.ok) {
        setNotice({ tone: 'success', text: '已确认当前修订。' })
        await state.refresh()
      } else {
        setNotice({ tone: 'error', text: r.reason || '确认未执行。' })
      }
    } finally { setBusy(false) }
  }

  const doHandoff = async (kind, target = null) => {
    setBusy(true); setNotice(null)
    try {
      const handoff = semanticHandoffOf(kind, target) || { kind }
      const r = await services?.prepareHandoff?.(handoff.kind, handoff.target)
      if (r?.ok) {
        setNotice({ tone: 'success', text: '已填入对话草稿，请补充后发送。' })
      } else {
        setNotice({ tone: 'error', text: '未能填入草稿。请回到当前对话后重试，或直接描述你想做的事。' })
      }
    } catch {
      setNotice({ tone: 'error', text: '未能填入草稿。请回到当前对话后重试。' })
    } finally { setBusy(false) }
  }

  const openMember = async (member) => {
    try {
      await services.openMemberSession(member)
      setNotice(null)
    } catch (error) {
      setNotice({ tone: 'error', text: error?.message || '无法打开该成员会话，请从完整工作台重试。' })
    }
  }
  return <ResearchRail key={state.projectId || 'unbound'} view={state.view} raw={state.raw} error={state.error} notice={notice} busy={busy}
    onRefresh={state.refresh} onWorkbench={() => services?.openWorkbench?.()} onHandoff={doHandoff} onConfirm={doConfirm}
    onOpenCatalog={() => setCatalogOpen(true)} catalog={<ProjectCatalog services={services} />}
    onOpenMember={services?.memberOpenAvailable?.(state.view) ? openMember : undefined} onDismiss={() => setNotice(null)} />
}
