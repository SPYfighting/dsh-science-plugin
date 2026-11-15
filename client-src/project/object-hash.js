// dsh-science — 客户端对象内容哈希（与 lib/project-domain.js contentHashOf 同口径）
//
// T5：工作台/右栏不再读取 /state，确认按钮的 expectedHash 必须由 project-binding 的
// project snapshot 本地推导。算法保持与领域层一致：去掉 revision/confirmed/confirmation/
// contentHash/updatedAt 后对 JSON.stringify 做 SHA-256。快照对象来自服务端 JSON，键顺序
// 与服务端一致，因此序列化结果一致。
const EXCLUDED = new Set(['revision', 'confirmed', 'confirmation', 'contentHash', 'updatedAt', 'history'])

function contentOf(value) {
  if (!value || typeof value !== 'object') return {}
  const out = {}
  for (const [key, inner] of Object.entries(value)) {
    if (!EXCLUDED.has(key)) out[key] = inner
  }
  return out
}

async function hashOf(value) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle
  if (!subtle || typeof subtle.digest !== 'function') return ''
  const data = new TextEncoder().encode(JSON.stringify(contentOf(value)))
  const digest = await subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** 为 project snapshot 的 core 与全部 Result 计算 contentHash（失败返回空对象，不阻塞渲染）。 */
export async function objectContentHashesOf(project) {
  const paper = project && project.snapshot && project.snapshot.paper
  if (!paper || typeof paper !== 'object') return { core: '', results: {} }
  try {
    const results = {}
    for (const result of Array.isArray(paper.results) ? paper.results : []) {
      if (result && result.id) results[result.id] = await hashOf(result)
    }
    return { core: await hashOf(paper.core), results }
  } catch {
    return { core: '', results: {} }
  }
}
