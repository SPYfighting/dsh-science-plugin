import React, { useId, useState } from 'react'
import { WorkbenchStyles } from './styles.js'
import { RESEARCH_RAIL_CSS } from './research-rail-styles.js'

const icons = {
  project: 'M4 5h16v14H4z M8 9h8m-8 4h5',
  paper: 'M6 3h8l4 4v14H6z M14 3v5h4M9 12h6m-6 4h6',
  alert: 'M12 3l9 16H3z M12 9v4m0 3h.01',
  team: 'M8 16a3 3 0 0 1-3 3H2v-2a4 4 0 0 1 4-4h2m8 3a3 3 0 0 0 3 3h3v-2a4 4 0 0 0-4-4h-2M9 8a3 3 0 1 0 6 0 3 3 0 1 0-6 0m-2 13v-3a5 5 0 0 1 10 0v3',
  figure: 'M4 4h16v16H4z M7 16l4-5 3 3 2-2 4 4 M8 8h.01',
  explore: 'M11 3l2.4 6.6L20 12l-6.6 2.4L11 21l-2.4-6.6L2 12l6.6-2.4z M19 3v4m-2-2h4',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0zm-2 4 5 5',
  structure: 'M4 4h6v5H4zm10 11h6v5h-6zM7 9v8h7',
  write: 'M4 20l4-.8L20 7l-3-3L5 16z M14 7l3 3',
  slides: 'M3 4h18v12H3z M12 16v4m-4 1 4-2 4 2',
  check: 'm5 12 4 4L19 6',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  chevron: 'm9 6 6 6-6 6',
  compute: 'M4 5h16v14H4z M8 9l3 3-3 3m5 0h3',
}

function Icon({ name, size = 16 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={icons[name] || icons.team} /></svg>
}

// Module marks use distinct silhouettes; the labels still carry the meaning.
const marks = {
  project: () => <><circle cx="16" cy="16" r="10" opacity=".27"/><ellipse cx="16" cy="16" rx="12" ry="5" transform="rotate(-38 16 16)" opacity=".65"/><circle cx="16" cy="16" r="3" fill="currentColor" stroke="none"/><circle cx="24.5" cy="9" r="2" fill="currentColor" stroke="none"/></>,
  paper: () => <><path d="M10 5h12l3 3v16H10z" fill="currentColor" fillOpacity=".15"/><path d="M7 10v17h13M14 12h7m-7 4h7m-7 4h4"/></>,
  team: () => <><path d="m9 22 7-12 8 12H9z" opacity=".55"/><circle cx="16" cy="9" r="4" fill="currentColor" stroke="none"/><circle cx="8" cy="23" r="4" fill="currentColor" stroke="none"/><circle cx="24" cy="23" r="4" fill="currentColor" stroke="none"/></>,
  figure: () => <><rect x="5" y="6" width="22" height="20" rx="4" fill="currentColor" fillOpacity=".13"/><path d="M9 21l5-6 4 3 5-8"/><circle cx="23" cy="10" r="2.3" fill="currentColor" stroke="none"/></>,
  alert: () => <><path d="M16 4 28 16 16 28 4 16z" fill="currentColor" fillOpacity=".15"/><path d="M16 10v6m0 4v1"/></>,
  explore: () => <><path d="M16 5q1 10 11 11-10 1-11 11Q15 17 5 16 15 15 16 5Z" fill="currentColor" fillOpacity=".17"/><path d="M25 5v6m-3-3h6"/></>,
}

function ModuleMark({ kind, compact = false }) {
  return <span className="sci-rs-module-mark" data-kind={kind} data-compact={compact || undefined}><svg viewBox="0 0 32 32" width={compact ? 20 : 24} height={compact ? 20 : 24} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{marks[kind]?.()}</svg></span>
}

function ModuleTitle({ kind, children }) {
  return <h3 className="sci-rs-module-title"><ModuleMark kind={kind} />{children}</h3>
}

function Action({ href, icon, primary, children, ...props }) {
  const common = { className: 'sci-rs-action', 'data-primary': primary || undefined, ...props }
  const content = <>{icon && <Icon name={icon} size={14} />}<span>{children}</span></>
  return href ? <a {...common} href={href} target="_blank" rel="noreferrer">{content}</a> : <button {...common} type="button">{content}</button>
}

function Pill({ tone, children }) {
  return <span className="sci-rs-pill" data-tone={tone}>{children}</span>
}

function Card({ variant, icon, label, title, status, action, children }) {
  return <article className="sci-rs-card" data-variant={variant}>
    <div className="sci-rs-kicker"><span className="sci-rs-icon"><Icon name={icon} /></span>{label}{status}</div>
    <h3>{title}</h3>
    {children}
    {action && <div className="sci-rs-card-footer">{action}</div>}
  </article>
}

function Copy({ text, limit = 95 }) {
  if (!text) return null
  const shortened = text.length > limit
  return shortened
    ? <details className="sci-rs-details"><summary><span className="sci-rs-excerpt">{text.slice(0, limit)}… </span><span className="sci-rs-expand">展开全文</span><span className="sci-rs-collapse">收起全文</span></summary><p>{text}</p></details>
    : <p className="sci-rs-copy">{text}</p>
}

function Metrics({ items }) {
  return <dl className="sci-rs-stats">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

function Section({ title, icon, count, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()
  return <section className="sci-rs-section">
    <h3><button type="button" className="sci-rs-head" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(!open)}>
      <ModuleMark kind={icon} /><span>{title}</span>
      {count != null && <span className="sci-rs-count">{count}</span>}
      <span className="sci-rs-chevron"><Icon name="chevron" size={13} /></span>
    </button></h3>
    <div id={contentId} hidden={!open}>{open && <div className="sci-rs-stack">{children}</div>}</div>
  </section>
}

function CardList({ items, render, limit = 3, label }) {
  const [visible, setVisible] = useState(limit)
  return <>{items.slice(0, visible).map(render)}
    {visible < items.length && <button type="button" className="sci-rs-action sci-rs-more" onClick={() => setVisible(visible + limit)}>更多{label}（剩余 {items.length - visible}）</button>}
  </>
}

const skills = [
  ['explore', 'explore', '开始探索'], ['literature', 'search', '查文献'], ['structure', 'structure', '调整结构'],
  ['draw', 'figure', '绘图'], ['write', 'write', '写作'], ['slides', 'slides', '汇报'],
]
const direction = { not_assessed: '方向待评估', supports: '支持主张', contradicts: '与主张相反', inconclusive: '方向不确定', not_applicable: '方向不适用' }
const evidence = { planned: '证据待收集', observed: '已记录观察', verified: '证据已核验', disputed: '证据有争议', invalidated: '证据已失效' }
const role = { main: '主结果', validation: '验证', control: '对照', boundary: '适用边界', supplement: '补充材料', excluded: '不纳入正文' }
const audit = { approved: '人工终审通过', 'ready-for-manual-review': '等待人工终审', 'needs-attention': '图件待复核', failed: '图件需修正', rejected: '人工终审退回' }
const memberIcons = { reviewer: 'check', writer: 'write', simulator: 'compute', trainer: 'compute', analyst: 'compute', 'figure-expert': 'figure', presentation: 'slides' }

function FigurePreview({ figure }) {
  const [status, setStatus] = useState('loading')
  if (!figure.previewable || !figure.url) return null
  return <>{status !== 'error' && <img className="sci-rs-figure" src={figure.url} alt={figure.title} loading="lazy" onLoad={() => setStatus('ready')} onError={() => setStatus('error')} />}
    {status !== 'ready' && <p className="sci-rs-copy">{status === 'error' ? '预览不可用，可打开原图。' : '图件预览加载中'}</p>}
  </>
}

// Presentation boundary: only consumes the normalized view and callbacks.
export function ResearchRail({ view, raw, error, notice, busy, onRefresh, onWorkbench, onHandoff, onConfirm, onOpenMember, onDismiss, onOpenCatalog, catalog }) {
  const [page, setPage] = useState('overview')
  const paper = view?.paper
  const team = view?.team
  const figures = view?.artifacts.figures || []
  const hasCore = Boolean(paper?.core.claim || paper?.core.title)
  const hasPaper = hasCore || Boolean(paper?.results.length || raw?.projectId)
  const pending = paper ? [
    ...(hasCore && !paper.core.confirmed ? [{ ...paper.core, id: 'core' }] : []),
    ...paper.results.filter((result) => !result.confirmed && result.status !== 'dropped' && result.manuscriptRole !== 'excluded'),
  ] : []
  const issues = team?.tasks.filter((task) => task.isBlocked || task.status === 'failed') || []
  const active = team?.activeTasks.filter((task) => !task.isBlocked && task.status !== 'failed') || []
  const counts = team?.counts
  const done = counts?.completed || 0
  const question = paper?.question || raw?.blueprint?.question
  const pendingTotal = pending.length + issues.length
  const first = pending[0]
  const issue = issues[0]
  const working = active.find((task) => task.isRunning) || active[0]
  return <div className="sci-workbench sci-quick sci-rs" lang="zh-CN" aria-label="研究状态" data-page={page}>
    <WorkbenchStyles /><style>{RESEARCH_RAIL_CSS}</style>
    <header className="sci-rs-mast">
      <h2 className="sci-rs-module-title"><ModuleMark kind="project" compact />研究状态</h2>
      <Action icon="arrow" onClick={onWorkbench}>工作台</Action>
      {onOpenCatalog && <Action icon="project" onClick={() => { setPage('catalog'); onOpenCatalog() }}>查看全部项目</Action>}
    </header>
    {view && hasPaper && <nav className="sci-rs-switch" aria-label="研究状态视图">
      {[['overview', '概览', 'project'], ['paper', '论文', 'paper'], ['team', '团队', 'team'], ['figures', '成果', 'figure']].map(([id, label, kind]) =>
        <button key={id} type="button" aria-pressed={page === id} onClick={() => setPage(id)}><ModuleMark kind={kind} compact />{label}</button>)}
    </nav>}
    {page === 'catalog' && <button type="button" className="sci-rs-back" onClick={() => setPage('overview')}>
      <Icon name="chevron" size={13} /> 返回研究状态
    </button>}
    {page === 'catalog' && catalog}
    {page !== 'catalog' && error && <Card variant="problem" icon="alert" label="连接状态" title={view ? '状态可能已过期' : '暂时无法读取状态'} action={<Action onClick={onRefresh}>重新读取</Action>}>
      <p className="sci-rs-copy" role="alert">{view ? '正在显示上次读取的内容。' : ''}{error}</p>
    </Card>}
    {page !== 'catalog' && !view && !error && <div className="sci-rs-empty" role="status">正在读取研究状态…</div>}
    {notice && <div className="sci-rs-next">
      <p role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}</p>
      <Action onClick={onDismiss}>关闭提示</Action>
    </div>}
    {page !== 'catalog' && view && <>
      {(!hasPaper || page === 'overview') && <article className="sci-rs-card sci-rs-hero" data-variant="project">
        <div className="sci-rs-kicker"><Icon name="project" size={14} />{hasPaper ? '当前课题' : '从对话开始'}{hasPaper && <span className="sci-rs-stage">{paper.stageLabel}</span>}</div>
        <h3>{hasPaper ? paper.title : '你想研究什么？'}</h3>
        <p className="sci-rs-copy sci-rs-preview">{question || paper.core.claim || (hasPaper ? '在对话中补充研究问题。' : '说一个问题，或整理已有数据。论文主线、任务和图件会随对话更新。')}</p>
        {hasPaper ? <Metrics items={[[ '研究结果', paper.totalResults], ['待处理', pendingTotal], ['任务完成', done]]} /> :
          <div><Action primary icon="arrow" disabled={busy} onClick={() => onHandoff('explore')}>在对话中开始探索</Action></div>}
      </article>}
      {hasPaper && page === 'overview' && <>
        <section className="sci-rs-section sci-rs-module" data-kind="alert">
          <div className="sci-rs-heading"><ModuleTitle kind="alert">待你处理</ModuleTitle><span>{pendingTotal ? `共 ${pendingTotal} 项` : '暂无待办'}</span></div>
          {first ? <Card variant="attention" icon="paper" label={first.id === 'core' ? '核心主张' : '研究结果'} title={first.title || '未命名主张'} status={<Pill tone="warn">待确认 · r{first.revision}</Pill>}
            action={<Action primary icon="arrow" onClick={() => setPage('paper')}>核对主张</Action>}>
            <p className="sci-rs-copy sci-rs-preview">{first.claim || '先在对话中补充主张。'}</p>
          </Card> : issue ? <Card variant="attention" icon="alert" label="团队任务" title={issue.subject || issue.id} status={<Pill tone="warn">{issue.status === 'failed' ? '失败' : '受阻'}</Pill>}
            action={<Action icon="arrow" onClick={() => setPage('team')}>查看任务</Action>}>
            <p className="sci-rs-copy sci-rs-preview">{issue.blockers?.[0] || issue.resultSummary || '到团队视图查看进展。'}</p>
          </Card> : <p className="sci-rs-empty">目前没有待确认或受阻事项。</p>}
          {first && issues.length > 0 && <button type="button" className="sci-rs-text-button" onClick={() => setPage('team')}>另有 {issues.length} 项任务需要处理 <Icon name="arrow" size={13} /></button>}
        </section>
        <section className="sci-rs-section sci-rs-module" data-kind="team">
          <div className="sci-rs-heading"><ModuleTitle kind="team">团队进展</ModuleTitle><button type="button" className="sci-rs-text-button" onClick={() => setPage('team')}>查看团队 <Icon name="arrow" size={13} /></button></div>
          <article className="sci-rs-card sci-rs-activity">
            <Metrics items={[[ '运行中', counts.running], ['已完成', done], ['需处理', issues.length]]} />
            {working && <p className="sci-rs-copy sci-rs-preview">{working.label} · {working.subject || working.id}</p>}
          </article>
        </section>
      </>}
      {hasPaper && page === 'paper' && <Section title="待确认的主张" icon="alert" count={pending.length}>
        {pending.length === 0 && <p className="sci-rs-empty">没有待确认的主张。</p>}
        <CardList label="待确认主张" items={pending} render={(item) => <Card key={item.id} variant="attention" icon="paper" label={item.id === 'core' ? '核心主张' : `研究结果 · ${item.id}`} title={item.title || '未命名主张'} status={<Pill tone="warn">待确认 · r{item.revision}</Pill>}
          action={<Action primary icon="check" disabled={busy || Boolean(error) || !item.claim || !item.contentHash} onClick={() => onConfirm(item.id, item.revision, item.contentHash)}>{item.contentHash ? '确认此修订' : '正在校验内容…'}</Action>}>
          <Copy limit={64} text={item.claim || '请先在对话中补充可确认的主张。'} />
          <div className="sci-rs-meta"><span>可退回</span><span>或到对话中说明修改</span></div>
        </Card>} />
      </Section>}
      {hasPaper && page === 'team' && issues.length > 0 && <Section title="需要处理的任务" icon="alert" count={issues.length}>
        <CardList label="任务提醒" items={issues} render={(task) => <Card key={task.id} variant={task.status === 'failed' ? 'problem' : 'attention'} icon="alert" label={task.assignee ? `任务 · ${task.assignee}` : '任务'} title={task.subject || task.id} status={<Pill tone={task.status === 'failed' ? 'bad' : 'warn'}>{task.status === 'failed' ? '失败' : '受阻'}</Pill>}>
          <Copy text={task.blockers?.join('；') || task.resultSummary || task.report || '请在完整工作台查看任务详情。'} />
        </Card>} />
      </Section>}
      {hasPaper && page === 'paper' && <Section title="论文主线" icon="paper" count={paper.totalResults}>
        {hasCore && <Card icon="paper" label="核心主张" title={paper.core.title || '论文的核心主张'} status={<Pill tone={paper.core.confirmed ? 'good' : 'warn'}>{paper.core.confirmed ? '已确认' : '待确认'}</Pill>}
          action={<Action icon="write" disabled={busy} onClick={() => onHandoff('structure')}>在对话中调整主线</Action>}><Copy text={paper.core.claim} /></Card>}
        {!paper.results.length && <p className="sci-rs-empty">还没有结果草案。可在对话中梳理论文结构。</p>}
        <CardList label="研究结果" items={paper.results} render={(result) => <Card key={result.id} icon="paper" label={`研究结果 · ${result.id}`} title={result.title}
          status={<Pill tone={result.manuscriptRole === 'excluded' || result.status === 'dropped' ? undefined : result.confirmed ? 'good' : 'warn'}>{result.manuscriptRole === 'excluded' || result.status === 'dropped' ? '不纳入正文' : result.confirmed ? '已确认' : '待确认'}</Pill>}
          action={<Action icon="write" disabled={busy} onClick={() => onHandoff('structure', { objectId: result.id, revision: result.revision })}>在对话中修改</Action>}>
          <Copy text={result.claim} />
          <div className="sci-rs-meta">{[result.statusLabel, direction[result.direction], evidence[result.evidenceState], role[result.manuscriptRole]].filter(Boolean).map((label) => <span key={label}>{label}</span>)}</div>
          {result.requiredItems?.[0] && <div className="sci-rs-next"><b>当前缺口</b><Copy text={result.requiredItems[0]} limit={60} /></div>}
        </Card>} />
      </Section>}
      {hasPaper && page === 'team' && <Section title="团队进展" icon="team" count={team.members.length}>
        {!team.members.length && !active.length && <p className="sci-rs-empty">团队尚未开始工作。派发任务后，成员与进度会显示在这里。</p>}
        <CardList label="团队成员" items={team.members} render={(member) => <Card key={member.name} icon={memberIcons[member.role] || 'team'} label="团队成员" title={member.label || member.name} status={<Pill tone={member.liveStatusTone}>{member.liveStatusLabel}</Pill>}
          action={onOpenMember && member.childId && <Action icon="arrow" onClick={() => onOpenMember(member)}>打开成员会话</Action>}>
          <Copy text={member.currentTasks.length ? member.currentTasks.map((task) => task.subject || task.id).join('；') : '当前没有进行中的任务。'} />
          {member.lastReport && <Copy text={`最近回报：${member.lastReport}`} />}
        </Card>} />
        <CardList label="执行任务" items={active} render={(task) => <Card key={task.id} icon="structure" label="执行任务" title={task.subject || task.id} status={<Pill tone={task.isRunning ? 'good' : undefined}>{task.label}</Pill>}>
          <div className="sci-rs-meta"><span>{task.assignee || '尚未分配'}</span>{task.resultIds?.length > 0 && <span>{task.resultIds.join('、')}</span>}</div>
        </Card>} />
      </Section>}
      {hasPaper && page === 'figures' && <Section title="登记图件" icon="figure" count={figures.length}>
        {!figures.length && <p className="sci-rs-empty">登记图件后可在这里预览。</p>}
        <CardList label="图件" items={figures} render={(figure) => <Card key={figure.id || figure.path} icon="figure" label="图件" title={figure.title}
          action={figure.url && <Action icon="arrow" href={figure.url}>打开原图</Action>}>
          <div className="sci-rs-meta">{[figure.resultId || '未关联结果', figure.version && `v${figure.version}`, audit[figure.audit?.overallStatus]].filter(Boolean).map((label) => <span key={label}>{label}</span>)}</div>
          <FigurePreview key={figure.url} figure={figure} />
        </Card>} />
      </Section>}
      {(!hasPaper || page === 'overview') && <Section title="常用技能" icon="explore">
        <p className="sci-rs-copy">点击后填入对话草稿，由你补充并发送。</p>
        <div className="sci-rs-skills">{skills.map(([id, icon, label]) => <Action key={id} icon={icon} disabled={busy} onClick={() => onHandoff(id)}>{label}</Action>)}</div>
      </Section>}
    </>}
  </div>
}
