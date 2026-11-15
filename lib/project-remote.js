// dsh-science — 项目 Remote 流（Project Remote，T0.3 spike → 阶段 3/4 正式消费）
//
// 设计真源 §10：项目状态使用独立的、按 session 鉴权的 Remote get/observe/act 流；
// DSH 原生 session projection 只折叠官方 durable events。typert Remote 需要官方
// 生成器产物（第三方插件无受支持注册面），因此公开 seam 是 webServer 路由 +
// connection.requestRejection 浏览器会话栅栏（与 /state、agent-teams 同款鉴权）：
//   GET  /plugins/dsh-science/project/get?sessionId=…&knownRevision=…   快照/未变更
//   GET  /plugins/dsh-science/project/observe?sessionId=…               SSE 基线+变更帧
//   POST /plugins/dsh-science/project/act                               白名单确定性动作
//   GET  /plugins/dsh-science/project/catalog?sessionId=…               工作区课题摘要
//   POST /plugins/dsh-science/project/open                              打开已绑定 root，不改绑
// scope 只由服务端解析（lib/project-context.js）；客户端不能提交 projectId。

import { createHash } from 'node:crypto'
import { registerStateRouteShared } from './httpdata-auth.js'
import { resolveProjectContext, assertPaperWriteAllowed, ensureProject } from './project-context.js'
import { catalogForSession, openCatalogProject } from './project-catalog.js'
import { authorizeArtifactRead, locateProjectPath } from './artifact-index.js'
import { railTeamOf } from './rail-team.js'
import { StoreError } from './project-store.js'
import { confirmObjectRevision } from './project-domain.js'

function log(msg) {
  console.log(`[dsh-science project-remote] ${msg}`)
}

const HEARTBEAT_MS = 15000

// ---- 客户端白名单动作（act）---------------------------------------------------
// 设计 §10.1：act 只接受确认/拒绝/暂停/停止/重试等确定性动作并在内部转 ProjectCommand；
// 语义变化没有通用 mutate 入口。冻结动作集：
//   project.ensure-binding — 首次绑定/新建项目（走 ensureProject 统一规则：teammate→needs-binding）
//   paper.confirm-revision — 对象级确认（经领域层 CAS：expectedRevision + expectedObjectRevision + expectedHash 必填）
const ACTIONS = new Set(['project.ensure-binding', 'paper.confirm-revision'])

function sendJson(res, code, payload) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(payload))
}

export function registerProjectRemote(ctx, { store }) {
  // ---- 动作实现（内部转 ProjectCommand）---------------------------------------
  function runAction(sessionId, ref, body) {
    const actionId = String(body.actionId || '')
    if (!ACTIONS.has(actionId)) {
      return { status: 400, payload: { kind: 'invalid', reason: `未知动作 ${actionId || '（空）'}` } }
    }
    const commandId = String(body.commandId || '')
    if (!commandId) return { status: 400, payload: { kind: 'invalid', reason: 'commandId 必填（幂等键）' } }

    if (actionId === 'project.ensure-binding') {
      // M1：与 ensureProject 同一实现——teammate 在队长未绑定时返回 needs-binding，
      // fork 隔离，绝不替队长建项目。
      const ensured = ensureProject(ctx, sessionId, { store, title: String((body.payload && body.payload.title) || '') })
      if (!ensured.ok) {
        const status = ensured.code === 'fork-isolated' ? 403 : 409
        return { status, payload: { kind: ensured.code === 'fork-isolated' ? 'forbidden' : 'needs-binding', reason: ensured.message || ensured.code } }
      }
      if (ensured.created) {
        return { status: 200, payload: { kind: 'applied', receipt: { projectId: ensured.ref.projectId, bound: true, revision: 0 } } }
      }
      return { status: 200, payload: { kind: 'already-applied', receipt: { projectId: ensured.ref.projectId, bound: true } } }
    }

    // paper.confirm-revision：对象级 CAS 确认（领域层唯一实现，Action Card 同源）
    const gate = assertPaperWriteAllowed(ref)
    if (!gate.ok) {
      return { status: 403, payload: { kind: 'forbidden', reason: gate.code === 'fork-isolated' ? 'fork 与父项目隔离' : '当前会话没有论文写权限' } }
    }
    // L6/T4：项目级 expectedRevision、对象级 expectedObjectRevision 与 expectedHash 均必填（§8.5）
    if (body.expectedRevision == null) {
      return { status: 400, payload: { kind: 'invalid', reason: 'expectedRevision 必填（确认绑定当前项目 revision）' } }
    }
    const payload = body.payload || {}
    if (payload.expectedObjectRevision == null) {
      return { status: 400, payload: { kind: 'invalid', reason: 'payload.expectedObjectRevision 必填（确认绑定当前对象修订）' } }
    }
    if (payload.expectedHash == null || String(payload.expectedHash).trim() === '') {
      return { status: 400, payload: { kind: 'invalid', reason: 'payload.expectedHash 必填（确认绑定当前对象内容哈希）' } }
    }
    const options = { mutationId: commandId, expectedRevision: body.expectedRevision, source: 'ui-action' }
    let result = confirmObjectRevision(store, ref, payload, options)
    // §8.5：项目 revision 因无关对象改变、而目标对象 revision/hash 未变时，handler 重新读取目标
    // 对象后允许（不因无关更新让卡片无故失效）；目标对象变化仍由 object-conflict 拒绝。
    if (result.kind === 'conflict' && result.code === 'conflict') {
      result = confirmObjectRevision(store, ref, payload, { ...options, expectedRevision: null })
    }
    if (result.kind === 'applied') return { status: 200, payload: { kind: 'applied', receipt: result.receipt } }
    if (result.kind === 'already-applied') return { status: 200, payload: { kind: 'already-applied', receipt: result.receipt } }
    if (result.kind === 'conflict') {
      return {
        status: 409,
        payload: {
          kind: 'conflict',
          code: result.code || null,
          reason: result.reason,
          currentRevision: result.currentRevision,
          objectRevision: result.objectRevision,
          currentHash: result.currentHash,
        },
      }
    }
    return { status: 400, payload: { kind: 'invalid', reason: result.reason } }
  }

  function scopeOf(sessionId) {
    return resolveProjectContext(ctx, sessionId, { store })
  }

  const handlers = {
    async catalog(req, res, url) {
      const sessionId = url.searchParams.get('sessionId')
      const result = catalogForSession(ctx, sessionId, { store })
      return sendJson(res, result.status, result.body)
    },

    async open(req, res, url, body) {
      const sessionId = body && body.sessionId
      const before = sessionId && store.bindingOfRootSession(sessionId)
      const result = openCatalogProject(ctx, sessionId, body, { store })
      const after = sessionId && store.bindingOfRootSession(sessionId)
      if ((before && before.projectId) !== (after && after.projectId)) {
        return sendJson(res, 500, { error: 'binding-changed' })
      }
      return sendJson(res, result.status, result.body)
    },

    async artifact(req, res, url) {
      const scope = scopeOf(url.searchParams.get('sessionId'))
      if (!scope.ok || !scope.ref.projectId || !scope.ref.capabilities.read) return sendJson(res, 404, { error: 'not-found' })
      const snap = store.snapshotOf(scope.ref.projectId)
      const artifactId = url.searchParams.get('artifactId')
      const record = snap && snap.snapshot && snap.snapshot.artifactIndex
        ? (snap.snapshot.artifactIndex.items || []).find((item) => item.id === artifactId)
        : null
      const decision = authorizeArtifactRead({
        record,
        projectId: scope.ref.projectId,
        hostAllows: scope.ref.capabilities.read === true,
        locate: (item) => locateProjectPath(item.pathRef, {
          root: typeof ctx.get === 'function' && ctx.get('workspace') ? ctx.get('workspace').root : '',
          exists: () => false,
          versionOf: () => '',
        }),
      })
      if (!decision.ok) return sendJson(res, decision.status, { error: decision.reason, diagnostic: decision.diagnostic || '' })
      return sendJson(res, 200, { ok: true, artifactId: decision.artifactId, summary: decision.summary })
    },

    async get(req, res, url) {
      const sessionId = url.searchParams.get('sessionId')
      const scope = scopeOf(sessionId)
      if (!scope.ok) return sendJson(res, 404, { error: scope.code })
      const ref = scope.ref
      if (!ref.projectId) return sendJson(res, 200, { project: null, ref: publicRef(ref) })
      if (!ref.capabilities.read) return sendJson(res, 403, { error: 'forbidden' })
      const snap = store.snapshotOf(ref.projectId)
      if (snap && snap.corrupt) {
        // M8：行级损坏 → 结构化只读恢复错误，不泄漏 SQL/路径
        return sendJson(res, 500, { error: 'snapshot-corrupt', revision: snap.revision })
      }
      const known = url.searchParams.get('knownRevision')
      if (known != null && Number(known) === snap.revision) {
        return sendJson(res, 200, { notModified: true, revision: snap.revision, projectId: ref.projectId })
      }
      return sendJson(res, 200, {
        project: { projectId: ref.projectId, revision: snap.revision, snapshot: snap.snapshot },
        team: railTeamOf(ref, { store }),
        ref: publicRef(ref),
      })
    },

    async observe(req, res, url) {
      const sessionId = url.searchParams.get('sessionId')
      const scope = scopeOf(sessionId)
      if (!scope.ok) return sendJson(res, 404, { error: scope.code })
      const ref = scope.ref
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      })
      let closed = false
      const cleanupFns = []
      const cleanup = () => {
        if (closed) return
        closed = true
        for (const fn of cleanupFns) { try { fn() } catch { /* ignore */ } }
        try { res.end() } catch { /* ignore */ }
      }
      const send = (event, data) => {
        if (closed) return false
        try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); return true } catch { cleanup(); return false }
      }
      let currentProjectId = ref.projectId
      let lastRevision = null
      if (currentProjectId && ref.capabilities.read) {
        const snap = store.snapshotOf(currentProjectId)
        lastRevision = snap && !snap.corrupt ? snap.revision : null
        send('baseline', { projectId: currentProjectId, revision: lastRevision, ref: publicRef(ref), ...(snap && snap.corrupt ? { streamFailure: 'snapshot-corrupt' } : {}) })
      } else {
        send('baseline', { projectId: null, revision: null, ref: publicRef(ref) })
      }
      const unsubscribe = store.subscribe((frame) => {
        if (frame.projectId !== currentProjectId) return
        // gap 检测：客户端按 revision 判断缺口；服务端始终发送新帧，缺口由客户端补读 baseline。
        send('change', frame)
        lastRevision = frame.projectRevision
      })
      cleanupFns.push(unsubscribe)
      const heartbeat = setInterval(() => {
        if (closed) return
        try { res.write(': ping\n\n') } catch { cleanup() }
      }, HEARTBEAT_MS)
      // M5/M7：兜底轮询（1s）同时覆盖 绑定建立 与 跨实例/丢帧的 revision 前进；
      // 回调整体 try/catch——插件卸载关闭 DB 后不得让未捕获异常击穿进程。
      const rebinding = setInterval(() => {
        if (closed) { clearInterval(rebinding); return }
        try {
          const scope2 = scopeOf(sessionId)
          if (!scope2.ok || !scope2.ref) {
            // M7：会话已下线 → 明确流失败并结束，不再保留僵尸连接
            send('streamFailure', { reason: 'session-unavailable' })
            clearInterval(heartbeat)
            clearInterval(rebinding)
            cleanup()
            return
          }
          const ref2 = scope2.ref
          if (ref2.projectId && ref2.projectId !== currentProjectId) {
            currentProjectId = ref2.projectId
            const rev = store.revisionOf(currentProjectId)
            lastRevision = rev
            if (ref2.capabilities.read || ref.capabilities.read) {
              send('reset', { projectId: currentProjectId, revision: rev, ref: publicRef(ref2) })
            }
            return
          }
          // M5：同项目 revision 兜底——跨实例写入/丢帧后补发 change 帧
          if (currentProjectId && ref2.capabilities.read) {
            const rev = store.revisionOf(currentProjectId)
            if (rev != null && lastRevision != null && rev > lastRevision) {
              send('change', { projectId: currentProjectId, projectRevision: rev, changedKeys: [], operationId: 'resync', updatedAt: Date.now() })
              lastRevision = rev
            }
          }
        } catch (err) {
          // 插件卸载/DB 关闭等：结束流并清理（M7）
          log(`observe poll failed: ${err && err.message}`)
          clearInterval(heartbeat)
          clearInterval(rebinding)
          cleanup()
        }
      }, 1000)
      cleanupFns.push(() => { clearInterval(heartbeat); clearInterval(rebinding) })
      req.on('close', cleanup)
    },

    async act(req, res, url, body) {
      const sessionId = body && body.sessionId
      const scope = scopeOf(sessionId)
      if (!scope.ok) return sendJson(res, 404, { error: scope.code })
      const outcome = runAction(sessionId, scope.ref, body || {})
      return sendJson(res, outcome.status, outcome.payload)
    },
  }

  function publicRef(ref) {
    return {
      projectId: ref.projectId,
      rootSessionId: ref.rootSessionId,
      relationship: ref.relationship,
      capabilities: ref.capabilities,
    }
  }

  registerStateRouteShared(ctx, [
    { path: '/plugins/dsh-science/project/get', handler: (req, res, url) => handlers.get(req, res, url) },
    { path: '/plugins/dsh-science/project/artifact', handler: (req, res, url) => handlers.artifact(req, res, url) },
    { path: '/plugins/dsh-science/project/catalog', handler: (req, res, url) => handlers.catalog(req, res, url) },
    {
      path: '/plugins/dsh-science/project/open',
      handler: async (req, res, url) => {
        const contentType = String((req.headers && req.headers['content-type']) || '')
        if (contentType && !/application\/json/i.test(contentType)) {
          return sendJson(res, 415, { error: 'unsupported content-type' })
        }
        const body = await readJsonBody(req)
        if (!body) return sendJson(res, 400, { error: 'invalid JSON body' })
        return handlers.open(req, res, url, body)
      },
      method: 'POST',
      failClosed: true,
    },
    { path: '/plugins/dsh-science/project/observe', handler: (req, res, url) => handlers.observe(req, res, url) },
    {
      path: '/plugins/dsh-science/project/act',
      handler: async (req, res, url) => {
        // L13：防御纵深——只接受 JSON 请求体（跨站表单/sendBeacon 不是 application/json）
        const contentType = String((req.headers && req.headers['content-type']) || '')
        if (contentType && !/application\/(json|text\/plain)/i.test(contentType)) {
          return sendJson(res, 415, { error: 'unsupported content-type' })
        }
        const body = await readJsonBody(req)
        if (!body) return sendJson(res, 400, { error: 'invalid JSON body' })
        return handlers.act(req, res, url, body)
      },
      method: 'POST',
      // L3：act 是写端点——connection 栅栏缺失时 fail-closed（401），不做回环放行
      failClosed: true,
    },
  ])
  log('project remote registered: get/observe/act/catalog/open under /plugins/dsh-science/project/*')
  return handlers
}

function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolveP) => {
    const chunks = []
    let size = 0
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      if (!ok) {
        // L6：超限即断开，避免继续空读
        try { req.destroy() } catch { /* ignore */ }
        return resolveP(null)
      }
      try {
        resolveP(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolveP(null)
      }
    }
    req.on('data', (c) => {
      size += c.length
      if (size > maxBytes) {
        finish(false)
        return
      }
      chunks.push(c)
    })
    req.on('end', () => finish(true))
    req.on('error', () => finish(false))
  })
}
