// dsh-science — Composer context dock（T3.2：项目上下文 + 技能入口；T5：共享 project-binding）
// 注册在 conversation.input.dock（list slot，session scope）：输入框上方的轻量上下文条。
// 无项目 → 轻量起始卡（开始探索/整理已有结果/新建科研项目）；
// 有项目 → 当前阶段、待确认、运行/阻塞、最近持久化时间 + 全部技能按钮；
// 断线 → "连接中断，状态可能过期"（last-known-good 保留）。
// 焦点纪律：onMouseDown preventDefault——按钮从不抢焦点，选区/IME/Undo 全程保持。
// 状态来源：与右栏、完整工作台共享同一个 Project Binding（按 session 复用，无 /state 轮询）。
import React, { useCallback, useState } from 'react'
import { SCIENCE_SKILLS, insertSkillEntry } from './skill-actions.js'
import { useProjectBinding } from '../project/use-project-binding.js'

let stylesInjected = false
function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  stylesInjected = true
  const style = document.createElement('style')
  style.id = 'dsh-science-dock-styles'
  style.textContent = `
.sci-dock{padding:2px 12px 6px;font-size:12px;color:var(--dsh-text-secondary,inherit)}
.sci-dock-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sci-dock-note{opacity:.72;margin-right:2px;white-space:nowrap}
.sci-dock-ctx{display:inline-flex;flex-wrap:wrap;gap:8px;align-items:center;white-space:nowrap;opacity:.9}
.sci-dock-ctx b{color:inherit;font-weight:600}
.sci-dock-chip{border:1px solid var(--dsh-border,rgba(127,127,127,.3));border-radius:999px;padding:0 8px;font-size:11px;line-height:1.7}
.sci-dock-chip[data-tone=warn]{color:var(--dsh-warning,#b7791f)}
.sci-dock-chip[data-tone=bad]{color:var(--dsh-danger,#d64545)}
.sci-dock-chip[data-tone=good]{color:var(--dsh-success,#2f855a)}
.sci-dock-btn{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--dsh-border,rgba(127,127,127,.35));background:transparent;color:inherit;border-radius:999px;padding:2px 10px;font-size:12px;line-height:1.6;cursor:pointer}
.sci-dock-btn:hover{background:var(--dsh-fill-secondary,rgba(127,127,127,.12))}
.sci-dock-btn:focus-visible{outline:2px solid var(--dsh-brand,#4b7bec);outline-offset:1px}
.sci-dock-msg{width:100%;font-size:12px;opacity:.85}
.sci-dock-msg[data-tone=error]{color:var(--dsh-danger,#d64545)}
`
  document.head.appendChild(style)
}

export function ScienceDock({ inputActions, useInput, services }) {
  ensureStyles()
  const input = useInput ? useInput((s) => s) : null
  const [notice, setNotice] = useState(null)
  const state = useProjectBinding(services)

  const runSkill = useCallback((entry) => {
    const result = insertSkillEntry(inputActions, input, entry)
    if (!result.ok) {
      setNotice({ tone: 'error', text: result.message })
      return
    }
    setNotice(result.inserted ? { tone: 'info', text: '已在输入框准备技能，请继续补充后发送。' } : { tone: 'info', text: result.message })
  }, [inputActions, input])

  const createProject = useCallback(async () => {
    if (!state.sessionId) { setNotice({ tone: 'error', text: '当前没有会话。' }); return }
    const r = await state.act({
      actionId: 'project.ensure-binding',
      commandId: `dock-bind-${Date.now().toString(36)}`,
      payload: {},
    })
    if (r.status === 200 && (r.body.kind === 'applied' || r.body.kind === 'already-applied')) {
      setNotice({ tone: 'info', text: '当前会话已绑定科研项目。' })
      void state.refresh()
      return
    }
    setNotice({ tone: 'error', text: (r.body && r.body.reason) || '创建科研项目失败：' + String(r.status) })
  }, [state])

  const keepFocus = useCallback((event) => event.preventDefault(), [])
  const busy = input ? input.phase !== 'plain' : false
  const status = state.status
  const stale = state.stale
  const paper = state.view?.paper || null
  const nextDecision = state.raw?.focus?.nextDecisions?.find?.((decision) => decision.status === 'pending') || null
  const running = state.view?.team?.counts?.running || 0

  return (
    <div className="sci-dock" role="toolbar" aria-label="科研技能">
      {status === 'ready' && paper && (
        <div className="sci-dock-row" style={{ marginBottom: 3 }}>
          <span className="sci-dock-ctx">
            <b>{paper.title}</b>
            <span className="sci-dock-chip">{paper.stageLabel}</span>
            {paper.question && paper.question !== paper.title && <span className="sci-dock-chip" title={paper.question}>研究问题：{paper.question.length > 32 ? `${paper.question.slice(0, 32)}…` : paper.question}</span>}
            {paper.pendingConfirmationCount > 0 && <span className="sci-dock-chip" data-tone="warn" title="待确认 = 尚未确认的核心与 Result 数；右栏「待你处理」另含受阻任务">待确认 {paper.pendingConfirmationCount}</span>}
            {running > 0 && <span className="sci-dock-chip">任务 {running}</span>}
            {nextDecision && nextDecision.text && <span className="sci-dock-chip" data-tone="warn">下一决策：{String(nextDecision.text).slice(0, 24)}{String(nextDecision.text).length > 24 ? '…' : ''}</span>}
            {stale && <span className="sci-dock-chip" data-tone="bad">连接中断，状态可能过期</span>}
          </span>
        </div>
      )}
      {status === 'empty' && (
        <div className="sci-dock-row" style={{ marginBottom: 3 }}>
          <span className="sci-dock-ctx">当前会话尚无科研项目。继续已有课题，可在研究状态中选择“查看全部项目”。</span>
          <button type="button" className="sci-dock-btn" onMouseDown={keepFocus} disabled={busy} onClick={createProject}>新建科研项目</button>
        </div>
      )}
      {status === 'offline' && (
        <div className="sci-dock-row" style={{ marginBottom: 3 }}>
          <span className="sci-dock-chip" data-tone="bad">研究状态连接中断</span>
          <button type="button" className="sci-dock-btn" onMouseDown={keepFocus} onClick={() => state.refresh()}>重连</button>
        </div>
      )}
      {status === 'unauthorized' && (
        <div className="sci-dock-row" style={{ marginBottom: 3 }}>
          <span className="sci-dock-chip" data-tone="bad">当前会话不可用</span>
        </div>
      )}
      <div className="sci-dock-row">
        <span className="sci-dock-note">科研：</span>
        {SCIENCE_SKILLS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="sci-dock-btn"
            title={`${entry.hint}（填入对话，不自动发送）`}
            disabled={busy}
            onMouseDown={keepFocus}
            onClick={() => runSkill(entry)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {notice && (
        <div className="sci-dock-msg" data-tone={notice.tone} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.text}
          <button type="button" className="sci-dock-btn" style={{ marginLeft: 6 }} onMouseDown={keepFocus} onClick={() => setNotice(null)}>关闭</button>
        </div>
      )}
    </div>
  )
}
