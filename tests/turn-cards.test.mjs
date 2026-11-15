// dsh-science T3.3 轮次状态卡折叠测试：官方 tool/call + tool/result 事件 → 节点视图
// （真实模型回合的 E2E 在阶段 4 审图轮执行；此处验证 fold 管线与身份语义）
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

// JSX 文件在 node 下不可直接 import——经 esbuild 转译后加载（react/jsx-runtime 外部化需注入）
async function loadTurnCards() {
  const { transform } = await import('esbuild')
  const { readFileSync, writeFileSync, mkdtempSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { pathToFileURL } = await import('node:url')
  const src = readFileSync(new URL('../client-src/conversation/ScienceTurnCards.jsx', import.meta.url), 'utf8')
  const out = await transform(src, { loader: 'jsx', format: 'esm', jsx: 'automatic' })
  // react/jsx-runtime 在 node 下无映射：以最小桩替换（fold 逻辑不渲染）
  const stubbed = out.code
    .replace(/import\s*{[^}]*}\s*from\s*"react\/jsx-runtime";?/g, '')
    .replace(/from\s*"react\/jsx-runtime"/g, '')
  const dir = mkdtempSync(join(tmpdir(), 'sci-turncards-'))
  const file = join(dir, 'ScienceTurnCards.mjs')
  writeFileSync(file, stubbed, 'utf8')
  return import(pathToFileURL(file).href)
}
const { scienceStateChangeDefinition } = await loadTurnCards()

function toolCall(callId, name, argsText = '{}') {
  return { type: 'tool/call', seq: 1, data: { callId, name, arguments: argsText } }
}
function toolResult(callId, toolName, payload, { error = false } = {}) {
  // 贴近真实事件：tool 结果消息的 source 只有 {kind:'tool', callId}，不带 toolName；
  // 工具名只存在于 tool/call 事件（早前夹具多带 toolName，掩盖了匹配缺陷）。
  return {
    type: 'tool/result',
    seq: 2,
    data: {
      error: error ? { message: 'boom' } : undefined,
      message: {
        isError: error,
        toolCallId: callId,
        source: { kind: 'tool', callId },
        content: error ? [{ type: 'text', text: 'failed' }] : [{ type: 'text', text: JSON.stringify(payload) }],
      },
    },
  }
}

describe('T3.3 轮次状态卡：官方 tool 事件折叠', () => {
  const sciCall = toolCall('call-1', 'sci_result_add', '{"claim":"x"}')
  const nonSciCall = toolCall('call-2', 'sci_ping')

  test('sci_* 工具 call 开启节点（身份 = callId）；非科研工具不匹配', () => {
    assert.deepEqual(scienceStateChangeDefinition.match(sciCall), { id: 'call-1', role: 'start' })
    assert.equal(scienceStateChangeDefinition.match(nonSciCall), null)
    assert.equal(scienceStateChangeDefinition.match({ type: 'user/message', data: {} }), null)
  })

  test('成功 tool/result → 已同步节点（摘要含对象 id 与 requireConfirm）', () => {
    const match = scienceStateChangeDefinition.match(sciCall)
    let state = scienceStateChangeDefinition.start({}, { ...match, event: sciCall, location: {} })
    const resultEvent = toolResult('call-1', 'sci_result_add', { ok: true, resultId: 'res-1', revision: 1, requireConfirm: true })
    state = scienceStateChangeDefinition.update({ state }, { ...scienceStateChangeDefinition.match(resultEvent), event: resultEvent })
    const node = scienceStateChangeDefinition.buildViewNode({ key: 'k1', id: 'call-1', start: { ...match, event: sciCall, location: {} }, state })
    assert.ok(node, '成功调用必须产出视图节点')
    assert.equal(node.data.toolName, 'sci_result_add')
    assert.match(node.data.summary, /res-1/)
    assert.match(node.data.summary, /待用户确认/)
    assert.equal(node.data.error, false)
  })

  test('失败 tool/result → 未完成节点（不吞错）', () => {
    const match = scienceStateChangeDefinition.match(sciCall)
    let state = scienceStateChangeDefinition.start({}, { ...match, event: sciCall, location: {} })
    const failEvent = toolResult('call-1', 'sci_result_add', null, { error: true })
    state = scienceStateChangeDefinition.update({ state }, { ...scienceStateChangeDefinition.match(failEvent), event: failEvent })
    const node = scienceStateChangeDefinition.buildViewNode({ key: 'k2', id: 'call-1', start: { ...match, event: sciCall, location: {} }, state })
    assert.ok(node)
    assert.equal(node.data.error, true)
  })

  test('tool/result 未到达时不产出节点（调用进行中）', () => {
    const match = scienceStateChangeDefinition.match(sciCall)
    const state = scienceStateChangeDefinition.start({}, { ...match, event: sciCall, location: {} })
    assert.equal(scienceStateChangeDefinition.buildViewNode({ key: 'k3', id: 'call-1', start: { ...match, event: sciCall, location: {} }, state }), null)
  })

  test('身份跨工具不串台：update 只认同 callId（由 conversation 管线保证，定义按 id 收）', () => {
    const m1 = scienceStateChangeDefinition.match(toolCall('call-A', 'sci_result_add'))
    const m2 = scienceStateChangeDefinition.match(toolResult('call-B', 'sci_result_add', { ok: true }))
    assert.notEqual(m1.id, m2.id)
  })
})
