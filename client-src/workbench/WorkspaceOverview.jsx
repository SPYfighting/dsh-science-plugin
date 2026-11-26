import React from 'react'
import { Button } from './components/ui.jsx'

function Tile({ label, count, title, note, action, children }) {
  return <article className="sci-desk-tile">
    <div className="sci-desk-tile-top"><span>{label}</span><span>{count}</span></div>
    <h2>{title}</h2>
    {note && <p>{note}</p>}
    {children}
    <Button quiet small onClick={action}>查看{label} <span aria-hidden="true">↗</span></Button>
  </article>
}

export function WorkspaceOverview({ view, raw, busy, onAction, onNavigate, onOpenConversation, onOpenCatalog }) {
  const { paper, team, artifacts } = view
  const hasProject = Boolean(raw?.projectId || paper.core.title || paper.core.claim || paper.results.length)
  const pending = paper.results.filter((r) => !r.confirmed && r.manuscriptRole !== 'excluded' && r.status !== 'dropped')
  const corePending = Boolean(paper.core.claim && !paper.core.confirmed)
  const failed = team.tasks.filter((task) => task.status === 'failed' && !task.isBlocked).length
  const total = team.tasks.length
  const completed = team.counts.completed
  const active = team.tasks.find((task) => task.isRunning && !task.isBlocked)
  const figure = artifacts.figures[0]
  return <div className="sci-desk-overview">
    <section className="sci-desk-hero" data-active={hasProject || undefined}>
      <div className="sci-desk-hero-copy">
      <div className="sci-desk-eyebrow">{hasProject ? `当前课题　/　${paper.stageLabel}` : '你的科研空间'}</div>
      <h1>{hasProject ? paper.title : '你想研究什么？'}</h1>
      <p>{paper.question || raw?.blueprint?.question || paper.core.claim || (hasProject ? '从对话补充研究问题，随时回来看论文和团队进度。' : '从一个研究问题，或一组已有结果开始。研究材料会随对话整理到这里。')}</p>
      {hasProject && <dl className="sci-desk-metrics">
        {[['研究结果', paper.totalResults], ['主张待确认', pending.length + Number(corePending)], ['任务进行中', team.counts.running], ['登记图件', artifacts.figures.length]].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
      </dl>}
      <div className="sci-desk-actions">
        <Button primary disabled={busy} onClick={hasProject ? onOpenConversation : () => onAction('explore')}>{hasProject ? '继续研究对话' : '在对话中开始探索'} <span aria-hidden="true">↗</span></Button>
        <Button disabled={busy} onClick={() => onAction(hasProject ? 'literature' : 'import_results')}>{hasProject ? '探索文献' : '整理已有结果'}</Button>
        <Button onClick={() => onNavigate('experts')}>配置项目专家</Button>
        {onOpenCatalog && <Button disabled={busy} onClick={onOpenCatalog}>查看全部项目</Button>}
      </div>
      </div>
      {hasProject && <aside className="sci-desk-brief" aria-label="现在值得关注">
        <span className="sci-desk-eyebrow">现在值得关注</span>
        <h2>{corePending ? '核对核心主张' : pending[0] ? '核对研究结果' : active ? '跟进当前任务' : '回看论文主线'}</h2>
        <p>{corePending ? paper.core.title : pending[0]?.title || active?.subject || '查看当前主张与证据的对应关系。'}</p>
        <Button quiet small onClick={() => onNavigate(!corePending && !pending.length && active ? 'team' : 'paper')}>查看详情 <span aria-hidden="true">↗</span></Button>
      </aside>}
    </section>
    {hasProject && <div className="sci-desk-grid">
      <Tile label="论文" count={`${paper.totalResults} 项结果`} title={corePending ? '核心主张待确认' : pending.length ? `${pending.length} 项结果待确认` : '论文主线'}
        note={corePending ? paper.core.claim : pending[0]?.title || paper.narrative || paper.core.claim || '整理结果和支持它们的证据。'} action={() => onNavigate('paper')}>
        {paper.results.length > 0 && <ol className="sci-desk-result-preview">{paper.results.slice(0, 3).map((r) => <li key={r.id}><span>{r.title}</span><small>{r.confirmed ? '已确认' : '待确认'}</small></li>)}</ol>}
      </Tile>
      <Tile label="团队" count={`${team.members.length} 位成员`} title={active?.subject || '团队进展'}
        note={team.counts.blocked || failed ? `${team.counts.blocked} 项受阻 · ${failed} 项失败` : active ? '任务正在进行' : '当前没有运行中的任务。'} action={() => onNavigate('team')}>
        {total > 0 && <div className="sci-desk-progress"><span>已完成 {completed} / {total} 项任务</span><progress value={completed} max={total} aria-label="已完成任务" /></div>}
      </Tile>
      <Tile label="成果" count={`${artifacts.figures.length} 张图件`} title={figure?.title || '研究成果'}
        note={figure ? (figure.resultId ? `对应 ${figure.resultId}` : '已登记图件') : '登记的图表和研究材料会在成果页汇总。'} action={() => onNavigate('artifacts')}>
        {figure?.previewable && figure.url && <OverviewFigure key={figure.url} figure={figure} />}
      </Tile>
    </div>}
  </div>
}

function OverviewFigure({ figure }) {
  const [failed, setFailed] = React.useState(false)
  return failed ? <p>图件预览不可用，可在成果页打开原图。</p> : <img className="sci-desk-preview" src={figure.url} alt={figure.title} loading="lazy" onError={() => setFailed(true)} />
}
