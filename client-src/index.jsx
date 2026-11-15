// DSH host adapter: the main workbench owns the full page; the right rail keeps a compact companion view.
// 路线 B（2026-11-13）：对话优先 —— 输入框科研技能条（T3.2）+ 轮次状态卡（T3.3）。
import React from 'react'
import { ResearchWorkbench } from './workbench/ResearchWorkbench.jsx'
import { QuickWorkbench } from './workbench/QuickWorkbench.jsx'
import { ScienceDock } from './conversation/ScienceDock.jsx'
import { scienceStateChangeDefinition, StateChangeCard } from './conversation/ScienceTurnCards.jsx'
import { SCIENCE_CONFIRM_ACTION, SCIENCE_CONFIRM_LOCALE, ScienceConfirmBody, scienceConfirmLocale } from './conversation/ScienceConfirmCard.jsx'
import { handoffToComposer } from './conversation/composer-handoff.js'
import { registerGuardedPart, WORKBENCH_REQUIRED_SERVICES } from './workbench/host-adapter.js'

export const inject = [...WORKBENCH_REQUIRED_SERVICES, 'uiConversation', 'conversation', 'actionCards', 'locale']

const PANEL_ID = 'dsh-science/workbench'

function service(ctx, name) {
  try { return ctx.get(name) } catch { return undefined }
}

function currentSessionId(sessions) {
  try {
    const snapshot = sessions?.list?.getSnapshot?.()
    const main = Object.values(snapshot?.byId || {}).find((row) => row?.retainedBy && (row.retainedBy.mainView || 0) > 0)
    if (main?.id) return main.id
    return typeof snapshot?.current === 'string' ? snapshot.current : undefined
  } catch { return undefined }
}

function makeServices(ctx) {
  const sessionsOf = () => service(ctx, 'sessions') || ctx.sessions
  const getSessionId = () => currentSessionId(sessionsOf())
  // T5：session 切换订阅（宿主提供时立即生效；否则 adapter 用本地轻量检查兜底）。
  const subscribeSession = (listener) => {
    const sessions = sessionsOf()
    for (const target of [sessions?.list, sessions]) {
      if (!target || typeof target.subscribe !== 'function') continue
      try {
        const dispose = target.subscribe(() => { try { listener() } catch { /* 订阅者失败不影响其他 */ } })
        if (typeof dispose === 'function') return dispose
      } catch { /* 尝试下一个订阅面 */ }
    }
    return () => {}
  }
  const getCurrentSession = () => {
    const sessions = sessionsOf()
    const id = getSessionId()
    if (!id || typeof sessions?.binding !== 'function') return undefined
    try { return sessions.binding(id)?.session } catch { return undefined }
  }
  const openConversation = () => {
    const layout = service(ctx, 'layout') || ctx.layout
    if (typeof layout?.selectPanel !== 'function') throw new Error('当前 DSH 不支持切换到对话面板。')
    layout.selectPanel(null)
  }
  const openWorkbench = (page) => {
    const layout = service(ctx, 'layout') || ctx.layout
    if (page) {
      try { window.__DSH_SCIENCE_OPEN_PAGE__ = page } catch { /* 浏览器以外的宿主没有 window */ }
    }
    layout?.selectPanel?.(PANEL_ID)
  }
  const openRootSession = (sessionId) => {
    const workspace = service(ctx, 'uiWorkspace')
    if (typeof workspace?.openSession !== 'function') throw new Error('当前 DSH 不支持打开课题会话。')
    if (!sessionId || typeof sessionId !== 'string') throw new Error('该课题没有可打开的原会话。')
    workspace.openSession(sessionId)
  }
  const openMemberSession = (member) => {
    const workspace = service(ctx, 'uiWorkspace')
    if (typeof workspace?.openSession !== 'function') throw new Error('当前 DSH 不支持打开成员会话。')
    if (!member?.childId) throw new Error('该成员没有记录可打开的会话。')
    const sessions = sessionsOf()
    const parentSessionId = member.parentSessionId || currentSessionId(sessions)
    if (!parentSessionId) throw new Error('无法确定成员会话所属的项目会话。')
    workspace.openSession({ parentSessionId, childSessionId: member.childId, mode: 'continuable' })
  }
  const memberOpenAvailable = (view) => {
    const workspace = service(ctx, 'uiWorkspace')
    const sessions = sessionsOf()
    return typeof workspace?.openSession === 'function' && Boolean(getSessionId() || view?.team?.members?.some((member) => member.parentSessionId && member.childId))
  }
  // T3.4：语义修改 = 把对象引用+引导语准备到原生草稿（append 保留草稿），并切回对话。
  const prepareHandoff = async (kind, target = null) => {
    return handoffToComposer({ ctx, sessionId: getSessionId(), kind, target, openConversation })
  }
  return { getSessionId, subscribeSession, getCurrentSession, openConversation, openWorkbench, openRootSession, openMemberSession, memberOpenAvailable, prepareHandoff }
}

function WorkbenchIcon({ size = 22, active = false }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-active={active || undefined}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"/><path d="M8 8h8M8 12h5M8 16h3"/></svg>
}

export function apply(ctx) {
  let mount
  try {
    mount = window.__DSH_SCIENCE_CLIENT_MOUNT__ || null
    if (!mount) window.__DSH_SCIENCE_CLIENT_MOUNT__ = mount = { main: false, panelIcon: false, quick: false, tab: false, dock: false, turnCards: false }
  } catch { mount = { main: false, panelIcon: false, quick: false, tab: false, dock: false, turnCards: false } }
  const services = makeServices(ctx)
  try {
    window.__DSH_SCIENCE_DEBUG__ = { currentSessionId: () => currentSessionId(service(ctx, 'sessions') || ctx.sessions) }
  } catch { /* 调试句柄可选 */ }

  ctx.effect(() => registerGuardedPart(mount, 'main', () => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID, inject: () => ({ services }),
  }, ResearchWorkbench))), 'dsh-science main workbench')

  ctx.effect(() => registerGuardedPart(mount, 'panelIcon', () => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 40, label: () => '科研工作台',
  }, WorkbenchIcon))), 'dsh-science global panel entry')

  const tabs = service(ctx, 'sidebarRightTabs') || ctx.sidebarRightTabs
  if (tabs && typeof tabs.register === 'function') {
    ctx.effect(() => registerGuardedPart(mount, 'tab', () => tabs.register({
      id: PANEL_ID,
      kind: 'workbench',
      title: () => '科研工作台',
      guide: [{ id: 'workbench', order: 10, title: () => '科研工作台', description: () => '显示研究阶段、下一步建议和团队运行状态。打开完整工作台可查看论文主线、团队进展、图表成果与专家配置。' }],
    })), 'dsh-science right-rail tab')

    ctx.effect(() => registerGuardedPart(mount, 'quick', () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab', key: PANEL_ID, inject: () => ({ services }),
    }, QuickWorkbench))), 'dsh-science right-rail companion')
  }

  // 对话优先入口（T3.2）：原生输入框上方的项目上下文 + 科研技能条。
  ctx.effect(() => registerGuardedPart(mount, 'dock', () => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'dsh-science/context',
    order: 30,
    inject: () => ({ services }),
  }, ScienceDock))), 'dsh-science composer dock')

  const locale = service(ctx, 'locale') || ctx.locale
  if (locale && typeof locale.register === 'function') {
    ctx.effect(() => locale.register(SCIENCE_CONFIRM_LOCALE, scienceConfirmLocale()), 'dsh-science confirm locale')
  }
  const actionCards = service(ctx, 'actionCards') || ctx.actionCards
  if (actionCards && typeof actionCards.register === 'function') {
    ctx.effect(() => actionCards.register({
      action: SCIENCE_CONFIRM_ACTION,
      locale: SCIENCE_CONFIRM_LOCALE,
      Body: ScienceConfirmBody,
    }), 'dsh-science confirm card')
  }

  // 轮次状态卡（T3.3）：官方 durable tool 事件折叠为"已同步"卡。
  const uiConversation = service(ctx, 'uiConversation') || ctx.uiConversation
  if (uiConversation && uiConversation.events && typeof uiConversation.events.register === 'function') {
    ctx.effect(() => registerGuardedPart(mount, 'turnCards', () => {
      const disposeDefinition = uiConversation.events.register(scienceStateChangeDefinition)
      const disposeRenderer = ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'dsh-science/state-change',
        inject: () => ({}),
      }, StateChangeCard))
      return () => { try { disposeRenderer() } catch { /* ignore */ } try { disposeDefinition() } catch { /* ignore */ } }
    }), 'dsh-science turn cards')
  }
}
