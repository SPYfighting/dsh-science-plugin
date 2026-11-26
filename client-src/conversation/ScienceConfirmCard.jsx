import React, { useEffect, useState } from 'react'

export const SCIENCE_CONFIRM_ACTION = 'sci-paper-confirm'
export const SCIENCE_CONFIRM_LOCALE = 'dsh-science-confirm'

const COPY = Object.freeze({
  zh: {
    confirm: '确认此修订',
    reject: '退回并回对话',
    confirmed: '已确认',
    rejected: '已退回',
    dismissed: '已忽略',
    replaced: '已被新卡片替代',
    unavailable: '这次操作没有完成，请重试。',
    rejectHint: '退回不会改动论文内容，只记录决定；请在对话中说明修改意见。',
    settled: '这张卡片已处理完成。',
    revision: '修订',
    stale: '这张卡片对应 r{shown}，当前已是 r{current}，请让队长基于最新修订重新发起。',
  },
  en: {
    confirm: 'Confirm this revision',
    reject: 'Return to conversation',
    confirmed: 'Confirmed',
    rejected: 'Returned',
    dismissed: 'Dismissed',
    replaced: 'Replaced by a newer card',
    unavailable: 'This action did not finish. Try again.',
    rejectHint: 'Returning does not change the paper content; it only records the decision. Explain your edits in the conversation.',
    settled: 'This card has been handled.',
    revision: 'Revision',
    stale: 'This card targets r{shown} but the object is now r{current}. Ask the lead to propose a new card from the latest revision.',
  },
})

function textOf(t, key) {
  if (typeof t === 'function') {
    try {
      const value = t(key)
      if (value && value !== key) return value
    } catch { /* 未注册词典时使用内置文案 */ }
  }
  const language = typeof navigator === 'object' && String(navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'zh'
  return (COPY[language] && COPY[language][key]) || (COPY.zh[key] ?? key)
}

// 宿主派生阶段 replaced 与 dismissed 一样是终态；漏掉它会让被替代的卡片仍显示按钮，
// 点击后宿主静默 settled，形成死操作。
const FINAL_PHASES = ['confirmed', 'rejected', 'dismissed', 'replaced']

let stylesInjected = false
function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  stylesInjected = true
  const style = document.createElement('style')
  style.id = 'dsh-science-confirm-card-styles'
  style.textContent = `
.sci-confirm-card{display:flex;flex-direction:column;gap:8px;margin-top:8px;padding:12px 14px;border:1px solid var(--dsh-border,rgba(127,127,127,.28));border-radius:10px;background:var(--dsh-fill-secondary,rgba(127,127,127,.06))}
.sci-confirm-meta{display:flex;align-items:center;gap:8px;font-size:12px;opacity:.72;overflow-wrap:anywhere}
.sci-confirm-chip{padding:1px 6px;border-radius:999px;border:1px solid var(--dsh-border,rgba(127,127,127,.3));font-variant-numeric:tabular-nums}
.sci-confirm-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}
.sci-confirm-actions button{font:inherit;font-size:13px;line-height:1.6;padding:5px 14px;border-radius:8px;cursor:pointer;border:1px solid var(--dsh-border,rgba(127,127,127,.4));background:transparent;color:inherit;transition:background .12s ease}
.sci-confirm-actions button:first-child{background:var(--dsh-accent,#3b6df6);border-color:transparent;color:#fff;font-weight:600}
.sci-confirm-actions button:first-child:hover:not(:disabled){filter:brightness(1.06)}
.sci-confirm-actions button:last-child:hover:not(:disabled){background:var(--dsh-fill-tertiary,rgba(127,127,127,.12))}
.sci-confirm-actions button:disabled{opacity:.5;cursor:not-allowed}
.sci-confirm-hint{font-size:12px;opacity:.7}
.sci-confirm-status{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600}
.sci-confirm-status[data-tone=good]{color:var(--dsh-success,#2f9e5f)}
.sci-confirm-status[data-tone=warn]{color:var(--dsh-warning,#b07a12)}
.sci-confirm-notice{font-size:12px;line-height:1.6;color:var(--dsh-warning,#b07a12)}
.sci-confirm-error{font-size:12px;line-height:1.6;color:var(--dsh-danger,#d64545)}
`
  document.head.appendChild(style)
}

// 过期提示：卡片携带发起时的 objectRevision，需要与当前对象修订比较。宿主 Body props
// 不提供项目快照，这里按 sessionId 做一次轻量读取；失败只静默（服务端仍会 CAS 拒绝）。
function useCurrentObjectRevision(sessionId, objectId) {
  const [current, setCurrent] = useState(null)
  useEffect(() => {
    if (!sessionId || !objectId || typeof fetch !== 'function') return undefined
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/plugins/dsh-science/project/get?sessionId=${encodeURIComponent(sessionId)}`)
        if (!alive || !res || !res.ok) return
        const body = await res.json()
        const paper = body?.project?.snapshot?.paper ?? body?.project?.paper
        if (!paper) return
        const obj = objectId === 'core' ? paper.core : (paper.results || []).find((r) => r && r.id === objectId)
        const revision = obj && Number(obj.revision)
        if (alive && Number.isFinite(revision)) setCurrent(revision)
      } catch { /* 读取失败时不显示过期提示，交给服务端 CAS */ }
    })()
    return () => { alive = false }
  }, [sessionId, objectId])
  return current
}

export function ScienceConfirmBody({ proposal, decision, sessionId, summary, act, t }) {
  ensureStyles()
  const [pending, setPending] = useState(false)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState('')
  const phase = decision?.phase
  const done = FINAL_PHASES.includes(phase) || settled
  const details = (proposal && proposal.details) || {}
  const shownRevision = details.objectRevision
  const liveRevision = useCurrentObjectRevision(sessionId, details.objectId)
  // 卡片携带的是发起时的对象修订；与当前修订不一致时提示过期（服务端仍会拒绝）。
  const stale = !done && liveRevision != null && shownRevision != null
    && Number(liveRevision) !== Number(shownRevision)
  const hashShort = typeof details.expectedHash === 'string' ? details.expectedHash.slice(0, 8) : ''
  const send = async (verb) => {
    if (done || pending || typeof act !== 'function') return
    setPending(true)
    setError('')
    try {
      const result = await act(verb)
      if (!result || result.status === 'refused' || result.status === 'unconfirmed') {
        setError(result?.reason || textOf(t, 'unavailable'))
      } else {
        setSettled(true)
      }
    } catch (err) {
      setError(err?.message || textOf(t, 'unavailable'))
    } finally {
      setPending(false)
    }
  }
  const statusKey = done ? (settled && !phase ? 'settled' : phase) : ''
  return <div className="sci-confirm-card" data-action={proposal?.action || SCIENCE_CONFIRM_ACTION}>
    {summary}
    {(shownRevision != null || hashShort) && <div className="sci-confirm-meta">
      {details.objectId && <span>{details.objectId}</span>}
      {shownRevision != null && <span className="sci-confirm-chip">{textOf(t, 'revision')} r{shownRevision}</span>}
      {hashShort && <span className="sci-confirm-chip">{hashShort}</span>}
    </div>}
    {stale && <p className="sci-confirm-notice" role="alert">
      {textOf(t, 'stale').replace('{shown}', String(shownRevision)).replace('{current}', String(liveRevision))}
    </p>}
    {done && <p className="sci-confirm-status" role="status" data-tone={phase === 'confirmed' ? 'good' : 'warn'}>
      {phase === 'confirmed' ? '✓' : '↩'} {textOf(t, statusKey || 'settled')}
    </p>}
    {error && <p className="sci-confirm-error" role="alert">{error}</p>}
    {!done && <div className="sci-confirm-actions">
      <button type="button" disabled={pending || stale} onClick={() => send('confirm')}>{textOf(t, 'confirm')}</button>
      <button type="button" disabled={pending || stale} onClick={() => send('reject')}>{textOf(t, 'reject')}</button>
    </div>}
    {!done && <p className="sci-confirm-hint">{textOf(t, 'rejectHint')}</p>}
  </div>
}

export function scienceConfirmLocale() {
  return {
    zh: { ...COPY.zh },
    en: { ...COPY.en },
  }
}
