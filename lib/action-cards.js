// dsh-science — Action Card 种类（T0.5 spike → 阶段 3 正式确认卡）
//
// 设计真源 §10.2：长期待确认操作使用 Action Cards 的 proposal/decision（官方 durable
// 能力）；决策回执经 ctx.actionCards.record 写入会话日志，随 fork/resume 携带。
// Handler 在服务端重新解析 scope（不信卡片 details 里的 projectId）并做对象级 CAS。
//
// kind：sci-paper-confirm —— 确认/退回论文对象（core 或 Result 当前修订）。
// proposal 由模型在加载 sci-hypothesis（或后续更多科研 skill）后经 propose_action 发起；
// 用户操作前不执行任何事。

import { z } from 'zod'
import { resolveProjectContext, assertPaperWriteAllowed } from './project-context.js'
import { confirmObjectRevision } from './project-domain.js'

function log(msg) {
  console.log(`[dsh-science action-cards] ${msg}`)
}

export const SCIENCE_CONFIRM_ACTION = 'sci-paper-confirm'

export function scienceConfirmKind({ store, actionCards }) {
  const record = (agent, decision) => {
    actionCards.record(agent, decision)
  }
  return {
    action: SCIENCE_CONFIRM_ACTION,
    skill: 'sci-hypothesis',
    invitation:
      '请在回答末尾用一两句话邀请用户在下方卡片上确认或退回该研究主张；确认后该修订才能作为派发执行任务的依据。卡片 details 必须取自 sci_blueprint_overview 的当前对象：projectRevision 用项目 revision、objectRevision 用对象 revision、expectedHash 用对象 contentHash。',
    details: z.object({
      // M10：projectId 进 schema（宿主按 schema 规整 details 后仍可用；
      // handler 仍以服务端 scope 为准做一致性比对，不信任 details 自身）
      projectId: z.string().min(1),
      objectId: z.string().min(1),
      objectRevision: z.number().int().positive(),
      // T4：卡片同时携带项目 revision、对象 revision 与内容哈希；三者都是提案时用户实际看到的版本。
      projectRevision: z.number().int().nonnegative().describe('项目 revision（取 sci_blueprint_overview 的 revision）'),
      expectedHash: z.string().min(8).describe('对象 contentHash（取 sci_blueprint_overview 的 contentHash）'),
      title: z.string().min(1).max(300),
      summary: z.string().max(2000).default(''),
    }),
    // confirm 会落库确认修订；声明 writes 让宿主在只读会话里拒绝该动作（reject 不写语义）。
    verbs: { confirm: { writes: true }, reject: {} },
    openPhases: ['pending'],
    statusGuidance:
      '以下是用户对论文主张确认卡片的最新决定：确认只对卡片所示的对象修订与内容哈希生效；' +
      '退回不会修改论文语义，请回到对话说明修改意见，由研究员调整后再发起新的确认卡片。',
    statusFields: ['objectId', 'objectRevision', 'projectRevision'],

    async act(agent, proposal, verb, payload) {
      const sessionId = agent && agent.session && agent.session.id
      const scope = resolveProjectContext(ctxOf(agent), sessionId, { store })
      if (!scope.ok) {
        return { status: 'refused', reason: `无法解析卡片所属会话（${scope.code}）` }
      }
      const ref = scope.ref
      if (!ref.projectId) {
        return { status: 'refused', reason: '该会话尚未绑定科研项目；先在对话中建立研究问题' }
      }
      if (ref.projectId !== String(proposal.details.projectId || '')) {
        return { status: 'refused', reason: '卡片与当前项目不一致（scope 已变化），请让队长重新发起确认' }
      }
      const gate = assertPaperWriteAllowed(ref)
      if (!gate.ok) {
        return { status: 'refused', reason: '当前会话没有论文写权限（成员只能提交提案）' }
      }
      const details = proposal.details
      if (!details.expectedHash) {
        return { status: 'refused', reason: '卡片缺少对象内容哈希（expectedHash），请让队长基于最新状态重新发起确认' }
      }
      if (verb === 'reject') {
        // T4：退回不写入论文语义，只记录一条可追溯 decision；用户入口回到对话说明修改意见。
        const decision = {
          callId: proposal.callId,
          action: SCIENCE_CONFIRM_ACTION,
          phase: 'rejected',
          data: {
            objectId: details.objectId,
            objectRevision: details.objectRevision,
            projectRevision: details.projectRevision,
            expectedHash: details.expectedHash,
            nextAction: 'discuss-in-conversation',
          },
        }
        record(agent, decision)
        return { status: 'settled', decision }
      }
      if (verb !== 'confirm') {
        return { status: 'refused', reason: `未知操作 ${verb}` }
      }
      // 卡片携带用户实际看到的项目 revision：先按它做一次项目级 CAS；若仅无关对象变化导致
      // 项目 revision 前进，则重读目标对象后允许（对象 revision+hash 未变）；目标变化仍拒绝。
      const cardOptions = { mutationId: `card-${proposal.callId}`, source: 'action-card' }
      let result = confirmObjectRevision(store, ref, {
        objectId: details.objectId,
        expectedObjectRevision: details.objectRevision,
        expectedHash: details.expectedHash,
      }, { ...cardOptions, expectedRevision: details.projectRevision })
      if (result.kind === 'conflict' && result.code === 'conflict') {
        result = confirmObjectRevision(store, ref, {
          objectId: details.objectId,
          expectedObjectRevision: details.objectRevision,
          expectedHash: details.expectedHash,
        }, { ...cardOptions, expectedRevision: null })
      }
      if (result.kind === 'applied') {
        // L6：仅在真正应用时记录 decision——already-applied 重放不追加重复回执
        const decision = {
          callId: proposal.callId,
          action: SCIENCE_CONFIRM_ACTION,
          phase: 'confirmed',
          data: {
            objectId: details.objectId,
            objectRevision: details.objectRevision,
            projectRevision: details.projectRevision,
            expectedHash: details.expectedHash,
            revision: result.receipt.revision,
          },
        }
        record(agent, decision)
        return { status: 'settled', decision }
      }
      if (result.kind === 'already-applied') {
        return {
          status: 'settled',
          decision: {
            callId: proposal.callId,
            action: SCIENCE_CONFIRM_ACTION,
            phase: 'confirmed',
            data: {
              objectId: details.objectId,
              objectRevision: details.objectRevision,
              projectRevision: details.projectRevision,
              expectedHash: details.expectedHash,
              revision: result.receipt.revision,
            },
          },
        }
      }
      if (result.kind === 'conflict') {
        const current = result.objectRevision != null ? `当前对象 r${result.objectRevision}` : '当前状态'
        const hash = result.currentHash ? `，hash ${String(result.currentHash).slice(0, 8)}…` : ''
        return {
          status: 'refused',
          reason: `目标对象已变化（${current}${hash}）；旧卡片失效，请基于新修订重新发起确认。`,
        }
      }
      return { status: 'refused', reason: result.reason || '确认未执行' }
    },
  }
}

// agent.ctx 可能不可达（测试桩）：拿不到 ctx 时 resolve 会报 unknown-session。
function ctxOf(agent) {
  try {
    return (agent && (agent.ctx || (agent.session && agent.session.ctx))) || null
  } catch {
    return null
  }
}

export function registerScienceActionCards(ctx, { store }) {
  const tryRegister = () => {
    let actionCards = null
    try {
      actionCards = ctx.get('actionCards')
    } catch {
      try { actionCards = ctx.actionCards } catch { actionCards = null }
    }
    if (!actionCards || typeof actionCards.register !== 'function') return null
    try {
      const dispose = actionCards.register(scienceConfirmKind({ store, actionCards }))
      log(`action kind registered: ${SCIENCE_CONFIRM_ACTION} (skill: sci-hypothesis)`)
      return dispose
    } catch (err) {
      log(`action kind register failed: ${err && err.message}`)
      return null
    }
  }
  const first = tryRegister()
  if (first) {
    // 低-4：dispose 接线——插件卸载时反注册 kind
    try { ctx.effect(() => () => { try { first() } catch { /* ignore */ } }) } catch { /* ignore */ }
    return first
  }
  // L6：actionCards 晚于本插件绑定时（如组合顺序差异），按服务绑定事件重试注册
  log('actionCards service unavailable yet — retrying on service bind')
  try {
    ctx.on('internal/service', (name) => {
      if (name === 'actionCards' || name === 'action-cards') tryRegister()
    })
  } catch { /* 事件监听不可用时保持一次性尝试 */ }
  return null
}
