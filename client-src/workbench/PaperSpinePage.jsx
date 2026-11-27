import React, { useState } from 'react'
import { Badge, Button, EmptyState, Panel } from './components/ui.jsx'

const READINESS_LABELS = [['scientific', '科学证据'], ['manuscript', '稿件就绪'], ['submission', '投稿就绪']]

function readinessText(value) {
  if (!value || value.state === 'unknown') return '待核对'
  if (value.state === 'excluded') return '已排除'
  if (value.state === 'ready' || value.state === 'completed') return '已具备'
  if (value.state === 'in_progress') return '进行中'
  return '待完善'
}

function ResultCard({ result, onAction, onConfirm, busy = false }) {
  const [expanded, setExpanded] = useState(false)
  // 确认门槛只是提示：真正闸门在服务端（paper.dispatch-gate 在派单前重算）
  const gatesOpen = result.coreConfirmed === true && result.confirmed === true
  const unconfirmedReason = result.coreConfirmed !== true
    ? '核心研究结论尚未确认；先确认核心结论后，才能细化正式任务或启动正式绘图。'
    : `“${result.title}”尚未确认；先确认该研究结果后，才能细化正式任务或启动正式绘图。`
  const run = (action) => onAction(action, result.id)
  return <article className="sci-result-card">
    <div className="sci-result-top"><div><h3>{result.title}</h3><div className="sci-small">{result.statusLabel} · {result.confirmed ? '当前修订已确认' : '待确认'}</div></div><Badge tone={result.confirmed ? 'good' : 'warn'}>{result.confirmed ? '已确认' : '待确认'}</Badge></div>
    {result.claim && <p className="sci-result-claim">{result.claim}</p>}
    <div className="sci-readiness" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>{READINESS_LABELS.map(([key, label]) => <div className="sci-readiness-item" key={key}><b>{label}</b><span>{readinessText(result.readiness?.[key])}</span></div>)}</div>
    {result.requiredItems.length > 0 && <div><b className="sci-small">必须处理</b><ul className="sci-note-list">{result.requiredItems.map((item) => <li key={item}>{item}</li>)}</ul></div>}
    {result.recommendedItems.length > 0 && <div><b className="sci-small">建议处理</b><ul className="sci-note-list">{result.recommendedItems.map((item) => <li key={item}>{item}</li>)}</ul></div>}
    <div className="sci-result-actions">
      <Button small onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? '收起详情' : '查看详情'}</Button>
      <Button small onClick={() => run('optimize_structure')}>在对话中优化</Button>
      <Button small disabled={!gatesOpen} title={!gatesOpen ? unconfirmedReason : undefined} onClick={() => run('refine_tasks')}>细化任务</Button>
      <Button small disabled={!gatesOpen} title={!gatesOpen ? unconfirmedReason : undefined} onClick={() => run('draw')}>开始绘图</Button>
      {!result.confirmed && <Button small primary disabled={busy} onClick={() => onConfirm(result.id, result.revision, result.contentHash)}>确认当前修订</Button>}
    </div>
    {!gatesOpen && <div className="sci-small" role="note" style={{ marginTop: 8 }}>{unconfirmedReason}</div>}
    {expanded && <div className="sci-small" style={{ marginTop: 14 }}>
      <div><b>Result 编号：</b>{result.id}　<b>修订：</b>{result.revision || 1}</div>
      {result.claimAssessments?.length > 0 && <ul className="sci-note-list">{result.claimAssessments.map((c) => <li key={c.id}>
        {c.text}（第 {c.revision} 版） · {({ pass: '审查通过', warn: '审查存疑', fail: '审查未通过' })[c.review?.severity] || '尚未审查'}
        {c.review?.message && <div>{c.review.message}</div>}
        {c.conflictReviewed && <div>已复核分歧证据 · {c.conflictingEvidenceIds.join('、')}</div>}
        {c.evidenceIds.length > 0 && <div>本版证据 · {c.evidenceIds.join('、')}</div>}
        {c.historicalEvidenceIds.length > 0 && <div>旧版证据 · {c.historicalEvidenceIds.join('、')}</div>}
      </li>)}</ul>}
      {result.purpose && <div><b>目的：</b>{result.purpose}</div>}
      {result.direction && <div><b>结果方向：</b>{result.direction}</div>}
      {['data', 'code', 'figure', 'manuscript'].map((kind) => {
        const rows = (result.materials || []).filter((item) => item.kind === kind)
        if (rows.length === 0) return null
        const label = { data: '相关数据', code: '生成代码', figure: '图件', manuscript: '稿段' }[kind]
        return <div key={kind}><b>{label}：</b>{rows.map((item) => `${item.summary || item.id}（${item.status === 'missing' ? '已失联' : item.verified ? '已核验证据' : '已登记，尚未核验'}）`).join('；')}</div>
      })}
      {result.notes && <div><b>备注：</b>{result.notes}</div>}
      {result.evidence?.length > 0 && <div><b>证据记录：</b>{result.evidence.map((row, index) => {
        if (!row) return `证据 ${index + 1}`
        const flag = row.state === 'verified' ? '✓' : (row.state === 'disputed' || row.state === 'invalidated') ? '✗' : '…'
        return `${flag} ${row.sourceLocator || row.title || `证据 ${index + 1}`}`
      }).join('；')}</div>}
      {result.references?.length > 0 && <div><b>参考文献（按用途）：</b>{['method', 'concept', 'background', 'evidence'].map((usedAs) => {
        const rows = (result.references || []).filter((row) => row && row.usedAs === usedAs)
        if (rows.length === 0) return null
        const label = { method: '方法', concept: '概念', background: '背景', evidence: '证据' }[usedAs]
        return `${label}：${rows.map((row) => `${row.title || row.doi || '未命名文献'}${row.verified ? '✓' : '（未核对）'}`).join('、')}`
      }).filter(Boolean).join('；')}</div>}
    </div>}
  </article>
}

export function PaperSpinePage({ view, raw, onAction, onConfirm, busy = false, onOpenConversation, onNavigate }) {
  const paper = view.paper
  const hasSpine = Boolean(paper.core.claim || paper.results.length || paper.core.title)
  // T6：Result 不再有硬上限；超过 5 个默认折叠（软提醒，不阻断），避免主线被长列表淹没。
  const [showAllResults, setShowAllResults] = useState(false)
  const previewLimit = 5
  const visibleResults = showAllResults ? paper.results : paper.results.slice(0, previewLimit)
  const nextStep = paper.nextStep
  const nextAction = () => nextStep.action ? onAction(nextStep.action, nextStep.targetId || null) : nextStep.page && onNavigate(nextStep.page)
  return <div className="sci-stack">
    <header className="sci-desk-page-head">
      <h1>论文主线</h1>
      <p>{paper.stageLabel}{paper.venue ? ` · 目标期刊：${paper.venue}` : ''} · {paper.totalResults} 项结果</p>
    </header>
    {!hasSpine ? <Panel className="sci-hero">
      <EmptyState title="开始一项研究">从一个研究问题开始，也可以先整理已经完成的结果。</EmptyState>
      <button type="button" className="sci-button sci-button-primary" onClick={() => onAction('explore')}>开始探索</button>
      <Button onClick={() => onAction('import_results')}>导入已有结果</Button>
    </Panel> : <div className="sci-grid">
      <div className="sci-col-8 sci-stack">
        <Panel title="核心研究结论" subtitle={paper.core.confirmed ? '当前修订已确认' : '候选结论仍待确认'} action={<Badge tone={paper.core.confirmed ? 'good' : 'warn'}>{paper.core.confirmed ? '已确认' : '待确认'}</Badge>}>
          <h2 className="sci-title">{paper.core.title || '尚未命名'}</h2>
          <p className="sci-copy">{paper.core.claim || '当前还没有核心结论候选。你可以先生成文章结构。'}</p>
          {paper.core.innovation && <p className="sci-small" style={{ marginTop: 10 }}>创新点：{paper.core.innovation}</p>}
          <div className="sci-result-actions"><Button primary onClick={() => onAction(paper.results.length ? 'optimize_structure' : 'generate_structure', 'core')}>{paper.results.length ? '在对话中优化结构' : '生成文章结构'}</Button>{!paper.core.confirmed && paper.core.claim && <Button onClick={() => onConfirm('core', paper.core.revision, paper.core.contentHash)} disabled={busy}>确认当前修订</Button>}</div>
        </Panel>
        <section className="sci-stack">
          <h2 className="sci-desk-section-title">研究结果 <small>{paper.totalResults}</small></h2>
          {paper.results.length ? <div className="sci-stack">{visibleResults.map((result) => <ResultCard key={result.id} result={{ ...result, coreConfirmed: paper.core.confirmed }} onAction={onAction} onConfirm={onConfirm} busy={busy} />)}
            {paper.results.length > previewLimit && <div className="sci-result-actions">
              <Button small onClick={() => setShowAllResults((value) => !value)}>{showAllResults ? '收起结果列表' : `显示全部 ${paper.results.length} 项`}</Button>
              <span className="sci-small">{showAllResults ? '已展开全部 Result；可用对话合并或排除弱结果。' : `默认显示前 ${previewLimit} 项（当前 ${paper.results.length} 项）；超过 5 个是软提醒，不影响继续工作。`}</span>
            </div>}
          </div> : <div className="sci-small">还没有研究结果草案。生成文章结构后，候选结果会显示在这里。</div>}
        </section>
      </div>
      <aside className="sci-col-4 sci-stack" style={{ alignSelf: 'start' }}>
        <Panel title="建议方向" subtitle="阶段是描述，不是强制流程；随时可以在对话中跳跃、回退或并行。">
          <h3 style={{ fontSize: 16, margin: '0 0 8px' }}>{nextStep.label}</h3>
          <Button primary onClick={nextAction}>{nextStep.action ? '在对话中继续' : '查看'}</Button>
        </Panel>
        <Panel title="近期活动">
          {view.team.activity.length ? <div className="sci-stack">{view.team.activity.slice(0, 4).map((row) => <div key={row.id} className="sci-small"><b>{row.summary}</b><div>{row.at ? new Date(row.at).toLocaleString() : '时间未记录'} · {row.status}</div></div>)}</div> : <div className="sci-small">暂无任务回报记录。</div>}
        </Panel>
        {view.team.blockedTasks.length > 0 && <Panel title="当前阻塞" subtitle={`${view.team.blockedTasks.length} 项任务有未完成依赖`}>
          <ul className="sci-note-list">{view.team.blockedTasks.slice(0, 5).map((task) => <li key={task.id}>{task.subject || task.id}：{task.blockers.join('；')}</li>)}</ul>
          <Button small onClick={() => onNavigate('team')}>查看团队进展</Button>
        </Panel>}
      </aside>
    </div>}
    <div className="sci-result-actions"><Button small onClick={() => onAction('literature')}>扩展文献探索</Button><Button small onClick={() => onAction('write')}>撰写论文</Button><Button small onClick={() => onNavigate('artifacts')}>查看图表与成果</Button></div>
  </div>
}
