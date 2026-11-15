// dsh-science — web 路由注册公共底座（鉴权 + webServer 懒注册）
// 与 lib/httpdata.js 的 tryRegister 同款模式抽出共用：webServer 服务可能在本插件挂载
// 之后才绑定（并发激活），按服务绑定事件重试；浏览器会话认证经 connection.requestRejection。

const WEB_SERVER_KEYS = ['webServer', 'httpServer']

function requestRejectionOf(ctx, req) {
  try {
    const conn = ctx.get('connection')
    if (conn && typeof conn.requestRejection === 'function') return conn.requestRejection(req)
  } catch {
    /* ignore：回环地址本就仅本机可达 */
  }
  return undefined
}

// L3：fail-closed 变体——connection 服务缺失时返回 401（写端点用），读端点保持旧行为。
function requestRejectionStrictOf(ctx, req) {
  let conn = null
  try {
    conn = ctx.get('connection')
  } catch {
    conn = null
  }
  if (!conn || typeof conn.requestRejection !== 'function') return 401
  const r = conn.requestRejection(req)
  return r === undefined ? undefined : r
}

/**
 * 注册一组插件路由（全部带浏览器会话栅栏）。
 * @param routes [{ path, method?, handler(req, res, url) }]
 */
export function registerStateRouteShared(ctx, routes) {
  let registered = false
  const tryRegister = () => {
    if (registered) return
    let server
    try {
      server = ctx.get(WEB_SERVER_KEYS[0]) || ctx.get(WEB_SERVER_KEYS[1])
    } catch {
      return
    }
    if (!server || typeof server.register !== 'function') return
    for (const route of routes) {
      const method = (route.method || 'GET').toUpperCase()
      const fenceOf = route.failClosed ? requestRejectionStrictOf : requestRejectionOf
      const wrapped = async (req, res) => {
        const rejection = fenceOf(ctx, req)
        if (rejection !== undefined) {
          res.writeHead(rejection, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
          res.end(JSON.stringify({ error: rejection === 401 ? 'unauthorized' : 'forbidden' }))
          return
        }
        if (method === 'POST' && (req.method || '').toUpperCase() !== 'POST') {
          res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: 'POST only' }))
          return
        }
        let url
        try {
          url = new URL(req.url ?? '/', 'http://localhost')
        } catch {
          url = new URL('/', 'http://localhost')
        }
        try {
          await route.handler(req, res, url)
        } catch (err) {
          console.error(`[dsh-science route] ${route.path} handler failed: ${err && err.message}`)
          if (!res.headersSent) {
            res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'internal error' }))
          } else {
            try { res.end() } catch { /* ignore */ }
          }
        }
      }
      ctx.effect(() => server.register({ kind: 'exact', path: route.path, handler: wrapped }), `dsh-science: ${route.path}`)
    }
    registered = true
  }
  tryRegister()
  try {
    ctx.on('internal/service', (name) => {
      if (WEB_SERVER_KEYS.includes(name)) tryRegister()
    })
  } catch {
    /* ignore */
  }
  return () => { registered = false }
}
