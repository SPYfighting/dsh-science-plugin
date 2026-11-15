// 工作台动作（阶段 3 / T3.4）：语义修改 → composer handoff；确定性动作 → revision 绑定 act。
// 不再存在语义表单弹窗（ActionDialog 已删除）；阶段是描述，不是流程向导。

/** 把语义动作映射为 handoff（原生 composer 预填）。返回 {kind, target} 或 null。 */
export function semanticHandoffOf(action, targetId = null) {
  switch (action) {
    case 'explore': return { kind: 'explore' }
    case 'import_results': return { kind: 'results' }
    case 'literature': return { kind: 'literature' }
    case 'generate_structure': return { kind: 'structure' }
    case 'structure': return { kind: 'structure', target: targetId }
    case 'optimize_structure': return { kind: 'structure', target: targetId && targetId !== 'core' ? targetId : null }
    case 'refine_tasks': return { kind: 'explore', target: targetId }
    case 'draw': return { kind: 'draw', target: targetId }
    case 'write': return { kind: 'write' }
    case 'slides': return { kind: 'slides' }
    default: return null
  }
}

/**
 * 确定性确认：直接提交 paper.confirm-revision（expectedObjectRevision + expectedHash 必填）。
 * 返回 {ok:true, receipt} | {ok:false, kind, reason}；调用方据 kind 生成用户可见文案。
 */
export async function confirmObjectViaAct({ sessionId, objectId, expectedObjectRevision, expectedHash, expectedRevision, fetchImpl } = {}) {
  const _fetch = fetchImpl || ((url, opts) => fetch(url, opts))
  if (!sessionId) return { ok: false, kind: 'no-session', reason: '当前没有会话。' }
  if (expectedObjectRevision == null) return { ok: false, kind: 'stale', reason: '缺少对象修订号，请刷新后重试。' }
  if (expectedHash == null || String(expectedHash).trim() === '') return { ok: false, kind: 'stale', reason: '缺少对象内容哈希，请刷新后重试。' }
  // H2（语义审查）：设计 §8.5 卡片动作同时携带 expectedProjectRevision 与 expectedObjectRevision/hash
  if (expectedRevision == null) return { ok: false, kind: 'stale', reason: '缺少项目修订号，请刷新后重试。' }
  try {
    const res = await _fetch('/plugins/dsh-science/project/act', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        actionId: 'paper.confirm-revision',
        // 稳定幂等键（同一对象修订+内容哈希+项目修订的重试返回原回执，不重复确认）
        commandId: `wb-confirm-${objectId}-r${expectedObjectRevision}-h${String(expectedHash).slice(0, 12)}-p${expectedRevision}`,
        payload: { objectId, expectedObjectRevision, expectedHash },
        expectedRevision,
      }),
    })
    const body = await res.json().catch(() => null)
    if (res.status === 200 && body && (body.kind === 'applied' || body.kind === 'already-applied')) {
      return { ok: true, receipt: body.receipt || body }
    }
    if (body && body.kind === 'conflict') {
      return { ok: false, kind: 'conflict', reason: '该对象已被修改（旧确认失效）；请刷新卡片后基于新修订重新确认。' }
    }
    if (body && body.kind === 'forbidden') {
      return { ok: false, kind: 'forbidden', reason: body.reason || '当前会话没有论文写权限。' }
    }
    return { ok: false, kind: 'invalid', reason: (body && body.reason) || `确认未执行（HTTP ${res.status}）。` }
  } catch (err) {
    return { ok: false, kind: 'network', reason: `网络错误：${(err && err.message) || 'unknown'}` }
  }
}
