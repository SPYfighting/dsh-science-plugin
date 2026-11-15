// dsh-science — 原生 composer skill 插入逻辑（T0.2 spike → 阶段 3 正式 skill-launcher）
//
// 设计真源 §11：技能按钮是斜杠 skill 的图形入口，不是新表单系统。全部自由文本走
// DSH 原生 composer；本模块只做"把 skill 引用 + 引导语准备到原生草稿"这一件事。
// 唯一公开 seam：session-scope slot 注入的 inputActions.captureInsertion()/insertText()；
// 禁止 DOM 操作、window 事件、setDraft 整段覆盖（会丢引用 chip）。

// 语义动作按钮：{ id, label, hint, skill?, prompt }
//   有 skill → 插入 `/skill\n引导语`（原生 skill 手势，按空白边界识别）；
//   无 skill → 插入自然语言请求文本（仍由用户审阅后手动发送）。
export const SCIENCE_SKILLS = Object.freeze([
  { id: 'explore', label: '开始探索', hint: '澄清研究问题、已有证据与可行范围', skill: 'sci-hypothesis', guide: '我想研究的方向是：' },
  { id: 'results', label: '整理已有结果', hint: '把散落的结果整理成可追溯清单', skill: null, prompt: '请检查并整理我已有的科研结果：先列出可追溯的结果、来源和不确定项，不要补造缺失数据。' },
  { id: 'literature', label: '查文献', hint: '围绕当前问题扩展文献与流程探索', skill: 'sci-autoresearch', guide: '请围绕我的研究问题做文献与流程探索：' },
  { id: 'draw', label: '绘图', hint: '为结果建立可追溯图件', skill: 'sci-figures', guide: '请为以下研究结果建立图件方案：' },
  { id: 'write', label: '写作', hint: '围绕已确认结果起草或修改稿件', skill: 'sci-writing', guide: '请基于当前论文主线起草：' },
  { id: 'slides', label: '汇报', hint: '把已确认结果整理成汇报 PPT', skill: 'sci-slides', guide: '请基于当前研究进展制作汇报：' },
])

// 插入文本构造（纯函数，单测覆盖）：
// - skill 按钮：`/skill\n引导语`；引导语让用户接着写，不自动发送。
// - insertText 是"光标处插入"，不是整段替换：空草稿插入 body 本身；已有草稿只插入
//   `\n\n + body`（光标通常在草稿末尾），绝不把旧草稿拼进插入文本重复写入。
// - 连续点击同一 skill：草稿已含该引用时不重复插入（幂等），避免刷屏。
export function insertionTextFor(entry, currentDraft = '') {
  const body = entry.skill ? `/${entry.skill}\n${entry.guide || ''}` : String(entry.prompt || '')
  const draft = String(currentDraft || '')
  if (draft.includes(body)) return null // 幂等：已插入过，不再追加
  if (draft.trim() === '') return body
  return `\n\n${body}`
}

/**
 * 把一条 skill 引用准备到原生草稿。
 * @param inputActions 会话 slot 注入的 InputActions（captureInsertion/insertText）
 *   注意：slot 注入的 facade 实际暴露 insertQuote/captureInsertion/insertText/setDraft/
 *   persistDraft/addAttachments/removeAttachment/pruneAttachments/submit；
 *   focus()/notify() 只存在于 SessionInput（SessionInputResolver 面），dock 拿不到——
 *   焦点保持由按钮的 onMouseDown preventDefault 保证（见 ScienceDock）。
 * @param inputState   useInput 快照（phase/draft/draftRev）；可为 null（会话尚未就绪）
 * @param entry        SCIENCE_SKILLS 之一
 * @returns {ok:true, inserted:boolean} | {ok:false, code, message}
 */
export function insertSkillEntry(inputActions, inputState, entry) {
  if (!inputActions || typeof inputActions.captureInsertion !== 'function' || typeof inputActions.insertText !== 'function') {
    return { ok: false, code: 'no-input-actions', message: '当前 DSH 版本不提供原生输入接口。' }
  }
  if (!entry || (!entry.skill && !entry.prompt)) {
    return { ok: false, code: 'bad-entry', message: '技能配置缺失。' }
  }
  const phase = inputState ? inputState.phase : 'plain'
  if (phase && phase !== 'plain') {
    return { ok: false, code: 'busy', message: '输入框正在提交中，请稍后再试；草稿未改动。' }
  }
  const draft = inputState ? String(inputState.draft || '') : ''
  const text = insertionTextFor(entry, draft)
  if (text == null) {
    return { ok: true, inserted: false, message: '该技能已在草稿中。' }
  }
  // CAS：capture 与 insert 之间草稿任何变化 → insertText 返回 false，明确失败提示重试。
  let span = null
  try {
    span = inputActions.captureInsertion()
  } catch (err) {
    return { ok: false, code: 'capture-failed', message: `无法捕获插入点（${(err && err.message) || 'unknown'}）；草稿未改动。` }
  }
  let accepted = false
  try {
    accepted = inputActions.insertText(text, span) === true
  } catch (err) {
    return { ok: false, code: 'insert-failed', message: `插入失败（${(err && err.message) || 'unknown'}）；草稿未改动。` }
  }
  if (!accepted) {
    return { ok: false, code: 'draft-changed', message: '草稿刚刚发生了变化，未插入；请重新点击。原草稿完整保留。' }
  }
  // 焦点：dock 按钮经 onMouseDown preventDefault 不抢焦点，composer 焦点全程保持；
  // 宿主 inputActions facade 无 focus()（SessionInput 专有），此处不做 DOM 补焦。
  return { ok: true, inserted: true }
}
