import React, { useEffect, useState } from 'react'
import { Button, Panel, StatusMessage } from './components/ui.jsx'

async function request(binding, payload, signal) {
  const response = await fetch('/plugins/dsh-science/skill-manage', {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: binding.sessionId, expectedProjectId: binding.projectId, ...payload }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '无法读取项目专家')
  return data
}

function Expert({ role, data, act, busy, openManager }) {
  const [kind, setKind] = useState('global')
  const [value, setValue] = useState('')
  const links = data.config.links[role] || []
  const local = data.installed[role] || []
  const options = kind === 'global' ? data.global.map(s => s.name) : data.legacy[role] || []
  const typeLabel = { global: '全局 Skill', legacy: '旧版技能', local: '项目 Skill', plugin: 'DSH 插件' }
  const choose = kind === 'global' || kind === 'legacy'
  const submit = async event => {
    event.preventDefault()
    const ok = await act(kind === 'local' ? { action: 'install', role, repoUrl: value.trim() } : { action: 'link', role, kind, value: value.trim() })
    if (ok) setValue('')
  }
  return <Panel title={data.roles[role]?.label || role} action={data.writable && <Button small quiet disabled={busy} onClick={() => act({ action: 'hide', role })}>移出项目专家</Button>}>
    {links.map(l => <div className="sci-expert-row" key={l.kind + '/' + l.value}><span>{typeLabel[l.kind]} · {l.kind === 'plugin' ? <a href={l.value} target="_blank" rel="noreferrer">{l.value}</a> : l.value}</span>
      {data.writable && <Button small quiet disabled={busy} onClick={() => act({ action: 'unlink', role, kind: l.kind, value: l.value })}>取消关联</Button>}</div>)}
    {local.map(s => <div className="sci-expert-row" key={s.name}><span>项目 Skill · {s.name}{s.warn ? '（仓库中未发现 SKILL.md）' : ''}</span>
      {data.writable && <Button small quiet disabled={busy} onClick={() => act({ action: 'remove', role, name: s.name })}>从本项目卸载</Button>}</div>)}
    {data.writable && <form className="sci-expert-form" onSubmit={submit}><select aria-label="扩展类型" value={kind} onChange={e => { setKind(e.target.value); setValue('') }}>
      <option value="global">引用全局 Skill</option><option value="local">安装项目 Skill</option><option value="plugin">关联 DSH 插件</option>
      {!!data.legacy[role]?.length && <option value="legacy">引用旧版角色技能</option>}</select>
      {choose ? <select aria-label="选择技能" value={value} onChange={e => setValue(e.target.value)}><option value="">{options.length ? '选择已安装的技能' : '暂无可引用的技能'}</option>{options.map(n => <option key={n}>{n}</option>)}</select> :
        <input aria-label="扩展来源链接" type="url" required value={value} placeholder={kind === 'plugin' ? 'npm 包或 GitHub / GitLab 仓库链接' : 'GitHub / GitLab 仓库首页链接'} onChange={e => setValue(e.target.value)} />}
      <Button small type="submit" disabled={busy || !value.trim()}>{kind === 'local' ? '安装到项目' : '关联'}</Button>
    </form>}
    {(kind === 'plugin' || links.some(l => l.kind === 'plugin')) && <p className="sci-small">项目保存插件来源。安装和启用会作用于当前 DSH 配置。 <Button quiet small onClick={openManager}>打开 DSH 插件管理器</Button></p>}
  </Panel>
}

export function ExpertSetupPage({ binding, services }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [role, setRole] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!binding.projectId) return
    const abort = new AbortController()
    request(binding, { action: 'inspect' }, abort.signal).then(setData).catch(e => { if (!abort.signal.aborted) setError(e.message) })
    return () => abort.abort()
  }, [binding.sessionId, binding.projectId, retry])
  const act = async payload => {
    setBusy(true); setError('')
    try {
      await request(binding, payload)
      setData(await request(binding, { action: 'inspect' }))
      return true
    } catch (e) { setError(e.message); return false }
    finally { setBusy(false) }
  }
  const bind = async () => {
    setBusy(true)
    try {
      const r = await binding.act({ actionId: 'project.ensure-binding', commandId: crypto.randomUUID(), payload: {} })
      if (r.status !== 200) throw new Error(r.body?.reason || '创建项目失败')
      await binding.refresh()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const openManager = () => {
    if (!services.openPluginManager?.()) setError('请从 DSH 设置打开「插件」管理页面。')
  }
  return <div className="sci-project-experts">
    <h1>项目专家</h1>
    {error && <StatusMessage tone="error">{error} <Button small onClick={() => { setError(''); setRetry(retry + 1) }}>重新读取</Button></StatusMessage>}
    {!binding.projectId ? <Panel title="为当前课题配置专家"><p>先将此会话绑定到科研项目，再选择需要的专家和扩展。</p>{binding.ref?.relationship === 'unbound' && <Button primary disabled={busy} onClick={bind}>创建当前科研项目</Button>}</Panel> :
      !data ? <p role="status">正在读取专家配置…</p> : <>
        <Panel title="选择专家" subtitle="选择只保存在当前项目。派发任务时才会启动专家。">
          {data.writable ? <><div className="sci-expert-presets">{Object.entries(data.presets).map(([id, p]) => <Button key={id} disabled={busy || p.roles.every(r => data.config.roles.includes(r))} onClick={() => act({ action: 'preset', value: id })}>
            {p.label}<small>{p.roles.map(r => data.roles[r].label).join(' · ')}</small></Button>)}</div>
            <div className="sci-expert-form"><select aria-label="添加单个专家" value={role} onChange={e => setRole(e.target.value)}><option value="">选择其他专家</option>{Object.entries(data.roles).filter(([id]) => !data.config.roles.includes(id)).map(([id, d]) => <option key={id} value={id}>{d.label}</option>)}</select>
            <Button small disabled={busy || !role} onClick={async () => { if (await act({ action: 'add', role })) setRole('') }}>添加专家</Button></div></> : <p>请在项目的主会话修改专家配置。</p>}
        </Panel>
        {data.config.roles.map(r => <Expert key={r} role={r} data={data} act={act} busy={busy} openManager={openManager} />)}
      </>}
  </div>
}
