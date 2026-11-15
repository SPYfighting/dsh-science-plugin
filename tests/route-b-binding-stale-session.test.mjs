// 路线 B T0/T5：工作台/右栏快速切换会话时，旧会话的 project binding 响应不得覆盖或滞留
// 在新会话视图里；路线 B UI 不得再以固定间隔全量轮询 /state。
//
// T5 已用共享 project-binding React adapter（client-src/project/use-project-binding.js）
// 替换旧的 use-workbench-state 轮询 hook；本文件保留同一组行为断言，迁移到新 hook。
// 依据：验收 R1 B3 / 任务书 T5；设计真源 §10.3（session 变化立即新 generation；旧
// generation 的响应不能覆盖新结果；新 session 未加载时显示空态而不是旧项目 last-known-good）。
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const REACT_STUB = `
const runtimeOf = () => {
  const runtime = globalThis.__DSH_SCIENCE_T0_REACT__
  if (!runtime) throw new Error('T0 react stub runtime missing')
  return runtime
}
export function useState(initial) { return runtimeOf().useState(initial) }
export function useCallback(fn, deps) { return runtimeOf().useCallback(fn, deps) }
export function useEffect(fn, deps) { return runtimeOf().useEffect(fn, deps) }
export default { useState, useCallback, useEffect }
`

function sameDeps(prev, next) {
  if (!prev || !next) return false
  if (prev.length !== next.length) return false
  return prev.every((value, index) => Object.is(value, next[index]))
}

// 最小 React：只实现 useProjectBinding 用到的三个 hook 语义（挂载/重渲染/卸载 + 依赖比较）。
function createMiniReact() {
  let hooks = []
  let cursor = 0
  let mounted = false
  let component = null
  let scheduled = false
  let pendingEffects = []
  const cleanups = new Map()

  function scheduleRender() {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (mounted) render()
    })
  }

  function render() {
    if (!mounted) return
    cursor = 0
    component()
    const effects = pendingEffects
    pendingEffects = []
    for (const effect of effects) {
      const cleanup = cleanups.get(effect.index)
      if (typeof cleanup === 'function') {
        try { cleanup() } catch { /* ignore */ }
      }
      const nextCleanup = effect.fn()
      cleanups.set(effect.index, typeof nextCleanup === 'function' ? nextCleanup : null)
    }
  }

  const hooksApi = {
    useState(initial) {
      const index = cursor++
      if (!(index in hooks)) hooks[index] = { value: typeof initial === 'function' ? initial() : initial }
      const slot = hooks[index]
      return [slot.value, (next) => {
        const value = typeof next === 'function' ? next(slot.value) : next
        if (Object.is(value, slot.value)) return
        slot.value = value
        scheduleRender()
      }]
    },
    useCallback(fn, deps) {
      const index = cursor++
      const prev = hooks[index]
      if (prev && sameDeps(prev.deps, deps)) return prev.fn
      hooks[index] = { fn, deps }
      return fn
    },
    useEffect(fn, deps) {
      const index = cursor++
      const prev = hooks[index]
      if (prev && sameDeps(prev.deps, deps)) return
      hooks[index] = { deps }
      pendingEffects.push({ index, fn })
    },
  }

  return {
    hooksApi,
    mount(fn) {
      component = fn
      mounted = true
      hooks = []
      cleanups.clear()
      pendingEffects = []
      render()
    },
    rerender() { render() },
    unmount() {
      mounted = false
      for (const cleanup of cleanups.values()) {
        if (typeof cleanup === 'function') {
          try { cleanup() } catch { /* ignore */ }
        }
      }
      cleanups.clear()
    },
  }
}

async function loadHookUnderTest() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-routeb-hook-'))
  mkdirSync(join(dir, 'project'), { recursive: true })
  mkdirSync(join(dir, 'workbench'), { recursive: true })
  writeFileSync(join(dir, 'react-stub.mjs'), REACT_STUB, 'utf8')
  writeFileSync(join(dir, 'workbench', 'state-view.js'), readFileSync(new URL('../client-src/workbench/state-view.js', import.meta.url), 'utf8'), 'utf8')
  writeFileSync(join(dir, 'project', 'project-binding.js'), readFileSync(new URL('../client-src/project/project-binding.js', import.meta.url), 'utf8'), 'utf8')
  writeFileSync(join(dir, 'project', 'object-hash.js'), readFileSync(new URL('../client-src/project/object-hash.js', import.meta.url), 'utf8'), 'utf8')
  const source = readFileSync(new URL('../client-src/project/use-project-binding.js', import.meta.url), 'utf8')
  const rewritten = source.replace(/from\s+(['"])react\1/g, "from '../react-stub.mjs'")
  assert.ok(rewritten.includes('../react-stub.mjs'), 'use-project-binding.js 仍应通过 react 的 hooks 读取状态（测试桩替换点）')
  writeFileSync(join(dir, 'project', 'use-project-binding.mjs'), rewritten, 'utf8')
  return import(pathToFileURL(join(dir, 'project', 'use-project-binding.mjs')).href)
}

function installFetch() {
  const original = globalThis.fetch
  const requests = []
  globalThis.fetch = (url) => {
    const sid = new URL(String(url), 'http://localhost').searchParams.get('sessionId')
    let resolveRequest = null
    let rejectRequest = null
    const promise = new Promise((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject })
    const request = {
      url: String(url),
      sid,
      settled: false,
      settle(response) {
        if (request.settled) return
        request.settled = true
        resolveRequest(response)
      },
      fail(error) {
        if (request.settled) return
        request.settled = true
        rejectRequest(error || new Error('network down'))
      },
    }
    requests.push(request)
    return promise
  }
  return {
    requests,
    restore() { globalThis.fetch = original },
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
async function flushUntil(predicate, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return true
    await flush()
  }
  return predicate()
}

function projectOf(projectId, title, revision = 1, { results = [], core = {} } = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      project: {
        projectId,
        revision,
        snapshot: {
          projectId,
          revision,
          paper: {
            stage: 'explore',
            core: { title, claim: `${title} 主张`, revision: 1, confirmed: false, ...core },
            results,
          },
          focus: { nextDecisions: [] },
        },
      },
      ref: { relationship: 'root', capabilities: { read: true, writePaper: true } },
    }),
  }
}

function resultOf(id, title, confirmed = false) {
  return { id, title, claim: `${title} 主张`, status: 'planned', revision: 1, confirmed, manuscriptRole: 'main', claims: [], evidence: [] }
}

describe('T5 红灯：工作台会话切换不得显示/覆盖旧项目状态', () => {
  test('快速 A→B 切换：新会话未加载时显示空态，迟到的 A 响应不得覆盖 B', async () => {
    const runtime = createMiniReact()
    globalThis.__DSH_SCIENCE_T0_REACT__ = runtime.hooksApi
    const { useProjectBinding } = await loadHookUnderTest()
    const net = installFetch()
    try {
      const sessions = { current: 'session-a' }
      const services = { getSessionId: () => sessions.current }
      let latest = null
      runtime.mount(() => {
        latest = useProjectBinding(services)
        return null
      })
      await flushUntil(() => net.requests.length >= 1)
      assert.equal(net.requests[0].sid, 'session-a', '挂载后应立即读取当前会话的 project')
      assert.equal(net.requests.some((request) => request.url.includes('/plugins/dsh-science/state')), false, '路线 B 主路径不得读取 /state')

      net.requests[0].settle(projectOf('project-a', 'A 项目标题'))
      await flushUntil(() => latest.raw?.projectId === 'project-a')
      assert.equal(latest.raw?.projectId, 'project-a', 'A 会话状态应加载成功')
      assert.equal(latest.view?.paper?.title, 'A 项目标题')

      // 切换会话前已发起的一次 A 读取（慢响应），切到 B 之后才返回。
      const staleRead = latest.refresh()
      await flushUntil(() => net.requests.some((request) => request.sid === 'session-a' && !request.settled))
      const staleRequest = net.requests.find((request) => request.sid === 'session-a' && !request.settled)
      assert.ok(staleRequest, 'A 的慢响应必须作为迟到的旧 generation 请求存在')

      sessions.current = 'session-b'
      runtime.rerender()
      await flushUntil(() => latest.raw === null || latest.raw?.projectId === 'project-b')
      const violations = []
      if (latest.raw?.projectId === 'project-a') {
        violations.push('切换会话后仍显示 A 项目的 last-known-good（右栏会短显旧项目）')
      }
      if (latest.raw !== null && latest.raw?.projectId !== 'project-b') {
        violations.push(`切换会话后出现非 B 的项目：${String(latest.raw?.projectId)}`)
      }

      const bRequest = net.requests.find((request) => request.sid === 'session-b' && !request.settled)
      if (!bRequest) violations.push('切换到 B 后没有为 B 发起 project 读取')
      if (bRequest) bRequest.settle(projectOf('project-b', 'B 项目标题'))
      await flushUntil(() => latest.raw?.projectId === 'project-b')
      if (latest.raw?.projectId !== 'project-b') {
        violations.push(`B 读取完成后未显示 B 项目（实际 ${String(latest.raw?.projectId)}）`)
      }
      if (latest.view?.paper?.title !== 'B 项目标题') {
        violations.push(`B 视图标题错误（实际 ${String(latest.view?.paper?.title)}）`)
      }

      staleRequest.settle(projectOf('project-a', 'A 迟到响应'))
      await flush()
      await staleRead
      if (latest.raw?.projectId === 'project-a') {
        violations.push('A 的迟到响应覆盖了 B：旧 generation 的响应必须被丢弃')
      }
      assert.deepEqual(violations, [], `快速切换会话时旧 project 绑定覆盖/滞留：\n${violations.join('\n')}`)
      assert.equal(net.requests.some((request) => request.url.includes('/plugins/dsh-science/state')), false)
    } finally {
      runtime.unmount()
      net.restore()
      delete globalThis.__DSH_SCIENCE_T0_REACT__
    }
  })

  test('工作台与右栏不再用 useWorkbenchState 固定轮询全局 /state', () => {
    const components = [
      ['ResearchWorkbench.jsx', 'client-src/workbench/ResearchWorkbench.jsx'],
      ['QuickWorkbench.jsx', 'client-src/workbench/QuickWorkbench.jsx'],
    ]
    for (const [name, rel] of components) {
      const source = readFileSync(join(root, rel), 'utf8')
      assert.equal(
        /useWorkbenchState/.test(source),
        false,
        `${name} 仍绕过唯一 project-binding，直接使用 useWorkbenchState 轮询 /state`,
      )
      assert.equal(
        source.includes('/plugins/dsh-science/state'),
        false,
        `${name} 仍直接请求 /state（路线 B 主路径必须走 project-binding）`,
      )
      assert.match(source, /binding/i, `${name} 应消费共享 project-binding，而不是自行请求状态`)
    }

    const hook = readFileSync(join(root, 'client-src/project/use-project-binding.js'), 'utf8')
    assert.equal(hook.includes('/plugins/dsh-science/state'), false, '共享 binding hook 不得读取 /state')
    assert.match(hook, /createProjectBinding/, '共享 hook 必须消费 createProjectBinding')
  })

  test('共享唯一 binding：dock/右栏/工作台同一 session 只 refresh 一次，projectId/revision/待确认数一致', async () => {
    const runtime = createMiniReact()
    globalThis.__DSH_SCIENCE_T0_REACT__ = runtime.hooksApi
    const { useProjectBinding } = await loadHookUnderTest()
    const net = installFetch()
    try {
      const sessions = { current: 'session-a' }
      const services = { getSessionId: () => sessions.current }
      let consumers = []
      runtime.mount(() => {
        // 同一组件内模拟 dock + 右栏 + 工作台三个消费者（共享 registry 中的同一绑定）。
        consumers = [useProjectBinding(services), useProjectBinding(services), useProjectBinding(services)]
        return null
      })
      await flushUntil(() => net.requests.length >= 1)
      assert.equal(net.requests.length, 1, '同一 session 的多个消费者不得各自建立 baseline')
      const results = [
        resultOf('res-1', '待确认结果'),
        resultOf('res-2', '已确认结果', true),
      ]
      net.requests[0].settle(projectOf('project-a', 'A 项目标题', 3, { results }))
      await flushUntil(() => consumers.every((state) => state.raw?.projectId === 'project-a'))
      const summary = consumers.map((state) => ({
        projectId: state.projectId,
        revision: state.revision,
        pending: state.view?.paper?.pendingConfirmationCount,
      }))
      assert.deepEqual(summary[0], { projectId: 'project-a', revision: 3, pending: 2 }, `实际：${JSON.stringify(summary[0])}`)
      assert.deepEqual(summary[1], summary[0], '右栏与 dock 的 projectId/revision/待确认数必须一致')
      assert.deepEqual(summary[2], summary[0], '工作台与 dock 的 projectId/revision/待确认数必须一致')
    } finally {
      runtime.unmount()
      net.restore()
      delete globalThis.__DSH_SCIENCE_T0_REACT__
    }
  })

  test('同一项目断线保留 last-known-good 并标 stale；重连后清除 stale', async () => {
    const runtime = createMiniReact()
    globalThis.__DSH_SCIENCE_T0_REACT__ = runtime.hooksApi
    const { useProjectBinding } = await loadHookUnderTest()
    const net = installFetch()
    try {
      const sessions = { current: 'session-a' }
      const services = { getSessionId: () => sessions.current }
      let latest = null
      runtime.mount(() => { latest = useProjectBinding(services); return null })
      await flushUntil(() => net.requests.length >= 1)
      net.requests[0].settle(projectOf('project-a', 'A 项目标题', 2))
      await flushUntil(() => latest.raw?.projectId === 'project-a')

      const retry = latest.refresh()
      await flushUntil(() => net.requests.some((request) => request.sid === 'session-a' && !request.settled))
      const failing = net.requests.find((request) => request.sid === 'session-a' && !request.settled)
      failing.fail(new Error('network down'))
      await retry
      await flushUntil(() => latest.status === 'offline')
      assert.equal(latest.status, 'offline')
      assert.equal(latest.stale, true, '断线必须标 stale')
      assert.equal(latest.raw?.projectId, 'project-a', '同一项目断线必须保留 last-known-good')
      assert.equal(latest.view?.paper?.title, 'A 项目标题')

      // refresh() 要等 fetch 返回才 resolve；先发起、再结算响应，避免等待死锁。
      const recovery = latest.refresh()
      await flushUntil(() => net.requests.some((request) => request.sid === 'session-a' && !request.settled))
      const retryRequest = net.requests.find((request) => request.sid === 'session-a' && !request.settled)
      retryRequest.settle(projectOf('project-a', 'A 项目标题', 2))
      await recovery
      await flushUntil(() => latest.status === 'ready')
      assert.equal(latest.status, 'ready')
      assert.equal(latest.stale, false, '重连成功后必须清除 stale')
      assert.equal(latest.raw?.projectId, 'project-a')
    } finally {
      runtime.unmount()
      net.restore()
      delete globalThis.__DSH_SCIENCE_T0_REACT__
    }
  })
})
