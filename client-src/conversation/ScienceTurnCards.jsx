// dsh-science — 会话轮次卡（T3.3）：从官方 durable tool 事件折叠"本轮状态变更"卡。
//
// 设计真源 §10.2/§12.2：项目工具成功结果携带标准 ok/receipt 字段；ConversationNodeDefinition
// 只折叠官方 tool/call + tool/result 事件（业务身份 = callId），不读取项目存储，不使用
// 自定义 durable event。卡片显示本轮哪些对象被同步、从哪个工具来；语义确认走官方
// Action Cards（sci-paper-confirm kind，durable proposal/decision 由官方投影渲染）。

const SCI_TOOLS = new Set([
  'sci_blueprint_set', 'sci_result_add', 'sci_result_update', 'sci_blueprint_confirm',
  'sci_claim_add', 'sci_evidence_add', 'sci_blueprint_stage', 'sci_submission_check',
  'sci_result_reference_add', 'sci_result_reference_verify', 'sci_result_reference_remove',
  'sci_result_screening', 'sci_blueprint_align', 'sci_blueprint_link_figure',
  'sci_blueprint_import_legacy', 'sci_team_dispatch', 'sci_team_update_task', 'sci_claim_retire',
  'sci_figure_register', 'sci_figure_audit', 'sci_figure_plan',
])

function summarizeResult(_toolName, value) {
  if (!value || typeof value !== 'object') return null
  const parts = []
  if (value.resultId) parts.push(value.resultId)
  if (value.objectId) parts.push(value.objectId)
  if (value.taskId) parts.push(value.taskId)
  if (value.figureId) parts.push(value.figureId)
  if (value.claimId) parts.push(value.claimId)
  if (value.evidenceId) parts.push(value.evidenceId)
  if (value.stage) parts.push(`阶段 → ${value.stage}`)
  if (value.revision) parts.push(`rev ${value.revision}`)
  if (Array.isArray(value.changed) && value.changed.length > 0) parts.push(value.changed.join('、'))
  const wrote = value.saved === true || (value.receipt && typeof value.receipt === 'object')
  if (parts.length === 0 && wrote) parts.push('已保存')
  if (value.requireConfirm) parts.push('待用户确认')
  if (value.stale) parts.push('引用已过期')
  return parts.join(' · ') || null
}

/** 折叠官方 sci_* 工具事件；身份 = callId。 */
export const scienceStateChangeDefinition = {
  kind: 'dsh-science/state-change',
  target: 'chat',
  match: (event) => {
    if (event.type === 'tool/call' && SCI_TOOLS.has(String(event.data && event.data.name))) {
      return { id: String(event.data.callId), role: 'start' }
    }
    if (event.type === 'tool/result' && event.data && event.data.message && event.data.message.source) {
      const source = event.data.message.source
      // 真实 tool 结果消息的 source 只有 {kind:'tool', callId}，没有 toolName；
      // 工具名来自 start 事件。这里只按 callId 匹配，工具名在 update 里核对。
      if (source.kind === 'tool' && source.callId) {
        return { id: String(source.callId), role: 'update' }
      }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'tool/call') throw new Error('science state-change start requires tool/call')
    return { toolName: String(match.event.data.name), done: false, summary: null, error: false }
  },
  update: (context, match) => {
    if (match.event.type !== 'tool/result') return context.state
    // 只更新本卡对应的 callId；工具名以 start 记录的为准（result 消息不带 toolName）。
    const callId = String((match.event.data.message && match.event.data.message.source && match.event.data.message.source.callId) || '')
    if (callId && context.state && context.id && callId !== String(context.id)) return context.state
    const failed = match.event.data.error !== undefined || (match.event.data.message && match.event.data.message.isError === true)
    let value = null
    try {
      const blocks = match.event.data.message && match.event.data.message.content
      const text = Array.isArray(blocks) ? blocks.filter((b) => b && b.type === 'text').map((b) => b.text).join('') : ''
      value = text ? JSON.parse(text) : null
    } catch { /* 非 JSON 结果（如错误文本）按失败呈现 */ }
    const summary = !failed && value ? summarizeResult(context.state.toolName, value) : null
    return { ...context.state, done: true, error: !!failed, summary }
  },
  buildViewNode: (context) => {
    if (context.start === undefined) return null
    const state = context.state
    if (!state.done) return null
    if (!state.summary && !state.error) return null
    return {
      key: context.key,
      kind: 'dsh-science/state-change',
      id: context.id,
      target: 'chat',
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: 'visible',
      data: { toolName: state.toolName, summary: state.summary, error: state.error },
    }
  },
}

let stylesInjected = false
function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return
  stylesInjected = true
  const style = document.createElement('style')
  style.id = 'dsh-science-turn-card-styles'
  style.textContent = `
.sci-turncard{display:flex;align-items:flex-start;gap:8px;font-size:12px;padding:4px 10px;margin:2px 0;border:1px solid var(--dsh-border,rgba(127,127,127,.25));border-radius:8px;background:var(--dsh-fill-secondary,rgba(127,127,127,.06));color:inherit}
.sci-turncard[data-error=true]{border-color:var(--dsh-danger,#d64545)}
.sci-turncard .sci-turncard-icon{flex:0 0 auto;opacity:.8}
.sci-turncard .sci-turncard-body{min-width:0}
.sci-turncard .sci-turncard-title{font-weight:600}
.sci-turncard .sci-turncard-summary{opacity:.85;overflow-wrap:anywhere}
`
  document.head.appendChild(style)
}

const TOOL_LABELS = {
  sci_blueprint_set: '更新核心',
  sci_result_add: '新增 Result',
  sci_result_update: '更新 Result',
  sci_blueprint_confirm: '确认修订',
  sci_claim_add: '新增 Claim',
  sci_evidence_add: '登记证据',
  sci_blueprint_stage: '切换阶段',
  sci_submission_check: '投稿检查',
  sci_result_reference_add: '登记文献',
  sci_result_reference_verify: '核对文献',
  sci_result_reference_remove: '移除文献',
  sci_result_screening: '文献快筛',
  sci_blueprint_align: '对齐任务',
  sci_blueprint_link_figure: '挂接图件',
  sci_blueprint_import_legacy: '导入旧数据',
  sci_team_dispatch: '派发任务',
  sci_team_update_task: '更新任务',
  sci_figure_register: '登记图件',
  sci_figure_audit: '图件前检',
  sci_figure_plan: '图件计划',
}

export function StateChangeCard({ node }) {
  ensureStyles()
  // conversation.chat.node 是 keyed slot：宿主传 {node}，节点数据在 node.data。
  const data = (node && node.data) || {}
  const label = TOOL_LABELS[data.toolName] || data.toolName || '项目状态'
  return (
    <div className="sci-turncard" data-error={data.error ? 'true' : 'false'}>
      <span className="sci-turncard-icon" aria-hidden="true">{data.error ? '⚠' : '🧬'}</span>
      <span className="sci-turncard-body">
        <span className="sci-turncard-title">{data.error ? `${label} 未完成` : `已同步：${label}`}</span>
        {data.summary && <div className="sci-turncard-summary">{data.summary}</div>}
        {data.error && <div className="sci-turncard-summary">该工具调用未成功，项目状态未变更；可在对话中重试。</div>}
      </span>
    </div>
  )
}
