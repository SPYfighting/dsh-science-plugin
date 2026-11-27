// dsh-science — 蓝图主张级审查覆盖
// 把 reviews.json 里 check="blueprint-claim" 的 findings 对回蓝图 core/results，
// 让 sci_blueprint_overview / /state 能回答"哪些已确认主张被审过、最近结论是什么"。
// 匹配策略：先按归一化文本（NFKC + 空白折叠）精确匹配，再退化为 ≥12 字符的唯一包含匹配
// （审查器可能截断长 claim）；文本无解或歧义时才用 core/res-N 前缀兜底；都不命中则不匹配。
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDirOf } from './store.js'
import { createRecordScopeResolver } from './project-context.js'

const CLAIM_CHECK = 'blueprint-claim'
const MIN_CONTAIN_LEN = 12
const SEV_RANK = { pass: 0, warn: 1, fail: 2 }
const SEV_ALIASES = {
  pass: 'pass', ok: 'pass', success: 'pass', passed: 'pass',
  warn: 'warn', warning: 'warn', medium: 'warn',
  fail: 'fail', error: 'fail', fatal: 'fail', critical: 'fail', high: 'fail',
}

export function normSeverity(raw) {
  const key = String(raw ?? '').trim().toLowerCase()
  return SEV_ALIASES[key] || 'warn'
}

function normText(s) {
  return String(s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

// finishedAt 可能是毫秒数，也可能是 ISO 字符串；无法解析按 0（最旧）。
function timeOf(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    if (Number.isFinite(n)) return n
    const t = Date.parse(v)
    if (Number.isFinite(t)) return t
  }
  return 0
}

function idPrefixOf(raw) {
  const m = /^\s*(core|res-\d+)\s*(?:[:：\-–—]\s*|\s+)/i.exec(String(raw ?? ''))
  if (!m) return null
  return /^core$/i.test(m[1]) ? 'core' : m[1].toLowerCase()
}

export function readReviewsSafe() {
  try {
    const file = join(dataDirOf(), 'reviews.json')
    if (!existsSync(file)) return {}
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function projectReviewsOf(ref, store) {
  const scope = createRecordScopeResolver({ store })
  const runs = Object.values(readReviewsSafe()).filter((run) => scope.inScope(run, ref))
  const version = runs.length ? createHash('sha256').update(JSON.stringify(runs.map((run) => [run.id, run.startedAt, run.finishedAt, run.findings]))).digest('hex') : ''
  return { runs, version }
}

function runsOf(reviews) {
  const vals = Array.isArray(reviews)
    ? reviews
    : reviews && typeof reviews === 'object'
      ? Object.values(reviews)
      : []
  return vals
    .filter((r) => r && typeof r === 'object' && Array.isArray(r.findings))
    .sort((a, b) => timeOf(a.finishedAt ?? a.startedAt) - timeOf(b.finishedAt ?? b.startedAt))
}

// 文本匹配优先：claim 文本以 "Core …" 开头时不能被 core 前缀劫持（H1）。
// 文本精确/包含命中不唯一时，才用 res-N/core 前缀消歧；仍无解 → 不匹配。
function matchTargetId(claimRaw, targets, runTime) {
  const token = String(claimRaw ?? '').trim().toLowerCase()
  const versioned = /@r\d+$/i.test(token)
  // Without a revision, only a dated review demonstrably after the edit can cover a revised claim.
  const eligible = (t) => versioned || t.revision <= 1 || (t.updatedAt > 0 && runTime > t.updatedAt)
  const alias = targets.find((t) => t.aliases.includes(token) && eligible(t))
  if (alias) return alias.id
  if (versioned || /^res-\d+-claim-\d+$/i.test(token)) return null
  const n = normText(claimRaw)
  if (n) {
    const exact = targets.filter((t) => (t.norms || [t.norm]).includes(n) && eligible(t))
    if (exact.length === 1) return exact[0].id
    if (exact.length === 0 && n.length >= MIN_CONTAIN_LEN) {
      const hits = targets.filter(
        (t) => (t.norms || [t.norm]).some((norm) => norm.length >= MIN_CONTAIN_LEN && (norm.includes(n) || n.includes(norm))) && eligible(t),
      )
      if (hits.length === 1) return hits[0].id
    }
  }
  const byId = idPrefixOf(claimRaw)
  if (byId) return targets.find((t) => t.aliases.includes(byId) && eligible(t))?.id || null
  return null
}

// 高-2（综合复核 A）：runs 按会话作用域预过滤——审查结论不得跨项目串号。
// 作用域 = 当前会话自身 + 它 spawn 的成员 childId（roster 中 parentSessionId===currentSessionId）；
// run 无 sessionId（旧数据/全局审查）保留。currentSessionId 为 null 时不过滤（legacy 全局视图）。
export function scopedRunsOf(reviews, currentSessionId = null) {
  if (!currentSessionId) return runsOf(reviews)
  const allowed = new Set([String(currentSessionId)])
  try {
    const file = join(dataDirOf(), 'team.json')
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      for (const m of Array.isArray(parsed && parsed.members) ? parsed.members : []) {
        if (m && m.childId && String(m.parentSessionId || '') === String(currentSessionId)) {
          allowed.add(String(m.childId))
        }
      }
    }
  } catch { /* roster 缺失/损坏 → 仅当前会话 */ }
  return runsOf(reviews).filter((run) => {
    const sid = run.sessionId ? String(run.sessionId) : ''
    return !sid || allowed.has(sid)
  })
}

// reviews 接受 reviews.json 的对象形态或数组形态；损坏/缺失一律按"无审查"处理。
export function reviewCoverageOf(bp, reviews, currentSessionId = null) {
  const runsSource = scopedRunsOf(reviews, currentSessionId)
  const coreClaim = bp && bp.core && String(bp.core.claim ?? '').trim()
  const results = bp && Array.isArray(bp.results) ? bp.results.filter(Boolean) : []
  const targets = []
  const childrenOf = new Map()
  function addTarget(id, claim, revision, updatedAt, confirmed, aliases = [], texts = [claim]) {
    targets.push({
      id, claim, revision, updatedAt: timeOf(updatedAt), confirmed, revisionId: `${id}-r${revision}`,
      norms: texts.map(normText).filter(Boolean),
      aliases: [...new Set([id, `${id}@r${revision}`, ...aliases].map((s) => s.toLowerCase()))],
    })
  }
  if (coreClaim) addTarget('core', coreClaim, Number(bp.core.revision) || 1, bp.core.updatedAt, bp.core.confirmed === true)
  for (const r of results) {
    const claim = String(r.claim ?? '').trim()
    const revision = Math.max(1, Number(r.revision) || 1)
    const children = (Array.isArray(r.claims) ? r.claims : []).filter((c) => c && c.id && c.status !== 'retired' && String(c.text || '').trim())
    childrenOf.set(r.id, children)
    // A historical result-level finding covers a lone claim. In a multi-claim result it
    // remains a separate result-level finding and cannot stand in for any child.
    const solePrimary = children.length === 1 && r.claims.length === 1 && normText(children[0].text) === normText(claim)
    const legacy = !r.claims?.length
    if (!solePrimary && claim && (children.length || legacy)) {
      const aliases = legacy && revision === 1 ? [`${r.id}-claim-1@r1`] : []
      addTarget(r.id, claim, revision, r.updatedAt, r.confirmed === true, aliases, children.length ? [] : [claim])
    }
    for (const c of children) {
      const aliases = solePrimary ? [r.id, `${r.id}@r${revision}`] : []
      addTarget(c.id, c.text, Number(c.revision) || 1, c.updatedAt, r.confirmed === true, aliases)
    }
  }

  // runs 按时间升序；同一主张后审覆盖先审。同一 run 内取最严重结论（fail > warn > pass）。
  const picked = new Map()
  for (const run of runsSource) {
    const perId = new Map()
    for (const f of run.findings) {
      if (!f || typeof f !== 'object') continue
      if (String(f.check ?? '').trim().toLowerCase() !== CLAIM_CHECK) continue
      const id = matchTargetId(f.claim, targets, timeOf(run.startedAt ?? run.finishedAt))
      if (!id) continue
      const severity = normSeverity(f.severity)
      const prev = perId.get(id)
      if (!prev || SEV_RANK[severity] > SEV_RANK[prev.severity]) {
        perId.set(id, { severity, message: String(f.message ?? ''), evidence: String(f.evidence ?? ''), token: String(f.claim ?? '') })
      }
    }
    for (const [id, v] of perId) {
      picked.set(id, {
        ...v,
        runId: String(run.id ?? ''),
        reviewedAt: timeOf(run.finishedAt ?? run.startedAt),
        startedAt: timeOf(run.startedAt),
      })
    }
  }

  const viewOf = (t) => {
    const p = picked.get(t.id)
    return {
      id: t.id,
      claim: t.claim,
      revisionId: t.revisionId || null,
      confirmed: t.confirmed,
      severity: null, message: '', evidence: '', token: '', runId: null, reviewedAt: 0, startedAt: 0,
      ...p,
    }
  }

  const resultViews = results.map((r) => {
    const children = childrenOf.get(r.id)
    const childViews = children.map((c) => viewOf(targets.find((target) => target.id === c.id)))
    const target = targets.find((t) => t.id === r.id)
    const resultReview = target ? viewOf(target) : null
    const superseded = childViews.length && childViews.every((c) => c.reviewedAt > resultReview?.reviewedAt)
    const scopeReview = children.length && resultReview?.severity && !superseded ? resultReview : null
    let aggregate = resultReview
    if (children.length) {
      const adverse = [...childViews, scopeReview].filter((v) => v && (v.severity === 'warn' || v.severity === 'fail'))
      aggregate = adverse.sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.reviewedAt - a.reviewedAt)[0]
        || (childViews.every((v) => v.severity === 'pass') ? childViews.reduce((a, b) => a.reviewedAt > b.reviewedAt ? a : b) : null)
    }
    return {
      severity: null, message: '', runId: null, reviewedAt: 0, ...aggregate,
      id: r.id, claim: String(r.claim ?? '').trim(), confirmed: r.confirmed === true,
      revisionId: `${r.id}-r${Number(r.revision) || 1}`, status: r.status || 'planned',
      claimReviews: childViews, resultReview: scopeReview,
    }
  })
  const coreTarget = targets.find((t) => t.id === 'core')
  const core = coreTarget ? viewOf(coreTarget) : null

  const all = [...(core ? [core] : []), ...resultViews.flatMap((r) => r.claimReviews.length ? r.claimReviews : r.claim ? [r] : [])]
  const counts = { total: all.length, reviewed: 0, fail: 0, warn: 0, pass: 0, unreviewed: 0 }
  for (const v of all) {
    if (!v.severity) { counts.unreviewed++; continue }
    counts.reviewed++
    counts[v.severity]++
  }

  const warnings = []
  if (counts.total > 0 && counts.reviewed === 0) {
    warnings.push(`蓝图共 ${counts.total} 条主张，尚无审查记录（check=blueprint-claim）——用 /sci-review 或 sci_review_send scope=evidence 补一次主张级审查。`)
  }
  for (const v of all) {
    if (v.confirmed && v.severity === 'fail') {
      warnings.push(`${v.id} 的已确认主张在最近审查（${v.runId || '未记录'}）中判为 fail：${v.message || '（无说明）'}——先处理审查发现，再对外声称该结论。`)
    }
  }
  const confirmedUnreviewed = all.filter((v) => v.confirmed && !v.severity).map((v) => v.id)
  if (counts.reviewed > 0 && confirmedUnreviewed.length > 0) {
    warnings.push(`已确认主张 ${confirmedUnreviewed.join('、')} 尚未审查——先补审再推进写作。`)
  }
  return { core, results: resultViews, counts, warnings }
}
