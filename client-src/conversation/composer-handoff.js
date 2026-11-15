// dsh-science — composer handoff（T3.2/T3.4：从工作台把语义请求准备到原生输入框）
//
// 设计真源 §11：语义按钮不直接发送默认提示——把"稳定对象引用 + 一行可编辑引导"加入
// 原生草稿，由用户审阅补充后手动发送。工作台（main 插槽）拿不到 slot 注入的 inputActions，
// 走官方公开 seam：ctx.get('conversation').input.requestDraftInitialization(binding, options)
// （workspace 新建会话预填同款）。whenDraftExists:'append' 保留用户已有草稿。
// 失败 → 打开对话面板让用户手动输入（不提交假 skill 请求）。

import { objectRefToken } from '../../lib/skeleton-context.js'

export const SCIENCE_SKILL_TEXT = Object.freeze({
  explore: { skill: 'sci-hypothesis', guide: '我想研究的方向是：' },
  results: { skill: null, prompt: '请检查并整理我已有的科研结果：先列出可追溯的结果、来源和不确定项，不要补造缺失数据。' },
  literature: { skill: 'sci-autoresearch', guide: '请围绕我的研究问题做文献探索：' },
  draw: { skill: 'sci-figures', guide: '请为以下研究结果建立图件方案：' },
  write: { skill: 'sci-writing', guide: '请基于当前论文主线起草：' },
  slides: { skill: 'sci-slides', guide: '请基于当前研究进展制作汇报：' },
  structure: { skill: null, prompt: '请基于当前会话证据与项目状态建立/调整文章结构草案：提出核心结论候选并拆分为 3–5 个可独立核验的 Result；只生成待确认草案，不要自动确认或派发任务。' },
})

/** 构造一条语义请求文本（对象引用 + 引导语）。 */
export function handoffTextFor(kind, target = null) {
  const entry = SCIENCE_SKILL_TEXT[kind]
  if (!entry) return null
  const head = entry.skill ? `/${entry.skill}` : ''
  const body = entry.skill ? entry.guide : entry.prompt
  const ref = target ? `\n（对象：${typeof target === 'string' ? target : target.objectId || target.id || ''}）\n${objectRefToken(target)}` : ''
  return `${head ? head + '\n' : ''}${body}${ref}`
}

/**
 * 把语义请求准备到当前会话的原生草稿（append 保留草稿），并切回对话视图。
 * @returns {ok:true} | {ok:false, code}
 */
export async function handoffToComposer({ ctx, sessionId, kind, target = null, openConversation }) {
  const text = handoffTextFor(kind, target)
  if (!text) return { ok: false, code: 'unknown-kind' }
  if (!sessionId) return { ok: false, code: 'no-session' }
  let conversation = null
  let sessions = null
  try {
    conversation = ctx.get('conversation')
    sessions = ctx.get('sessions')
  } catch {
    try { conversation = ctx.conversation; sessions = ctx.sessions } catch { /* ignore */ }
  }
  const binding = sessions && typeof sessions.binding === 'function' ? sessions.binding(sessionId) : undefined
  if (conversation && conversation.input && binding && typeof conversation.input.requestDraftInitialization === 'function') {
    try {
      const result = conversation.input.requestDraftInitialization(binding, { prompt: text, whenDraftExists: 'append' })
      if (result === 'applied' || result === 'preserved') {
        if (typeof openConversation === 'function') openConversation()
        return { ok: true }
      }
      // 'blocked'：提交占用中——不提交假请求，引导用户手动
      return { ok: false, code: 'blocked' }
    } catch {
      return { ok: false, code: 'handoff-failed' }
    }
  }
  return { ok: false, code: 'no-input-face' }
}
