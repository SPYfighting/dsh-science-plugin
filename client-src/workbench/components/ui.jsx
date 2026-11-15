import React, { useEffect, useRef, useState } from 'react'

export function Button({ children, primary = false, small = false, quiet = false, ...props }) {
  return <button {...props} className={['sci-button', primary && 'sci-button-primary', small && 'sci-button-small', quiet && 'sci-button-quiet', props.className].filter(Boolean).join(' ')}>{children}</button>
}

export function Panel({ title, subtitle, action, children, className = '' }) {
  return <section className={`sci-panel ${className}`}>
    {(title || subtitle || action) && <header className="sci-panel-heading"><div>{title && <h2>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>{action}</header>}
    {children}
  </section>
}

export function Badge({ children, tone = 'default' }) {
  return <span className={`sci-badge ${tone === 'good' ? 'sci-badge-good' : tone === 'warn' ? 'sci-badge-warn' : tone === 'bad' ? 'sci-badge-bad' : ''}`}>{children}</span>
}

export function EmptyState({ title, children, action, secondary }) {
  return <div className="sci-empty"><div><h2>{title}</h2><p>{children}</p><div className="sci-result-actions" style={{ justifyContent: 'center' }}>{action}{secondary}</div></div></div>
}

export function StageTrack({ stages = [] }) {
  return <div className="sci-stage-track" aria-label="论文阶段">{stages.map((stage, index) => <div className="sci-stage" data-state={stage.state} key={stage.id}><div className="sci-stage-dot">{stage.state === 'completed' ? '✓' : index + 1}</div><div className="sci-stage-label">{stage.label}</div></div>)}</div>
}

export function StatusMessage({ tone = 'default', children }) {
  return <div className={tone === 'error' ? 'sci-error-box' : tone === 'success' ? 'sci-success-box' : 'sci-panel'} role={tone === 'error' ? 'alert' : undefined}>{children}</div>
}
