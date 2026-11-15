// dsh-science T0.2 composer spike 单测：skill 引用插入逻辑（草稿保留 / CAS 失败 / 忙碌拒绝 / 幂等）
// 真实 DSH 浏览器验证（焦点/IME/Undo/chip 保留）在 M0 门禁以 headless Chrome 执行并记录截图。
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const { insertionTextFor, insertSkillEntry, SCIENCE_SKILLS } = await import('../client-src/conversation/skill-actions.js')

function fakeInputActions({ captureThrows = false, insertResult = true, insertThrows = false } = {}) {
  const calls = { capture: 0, insert: [] }
  return {
    calls,
    captureInsertion() {
      calls.capture++
      if (captureThrows) throw new Error('no editor')
      return { start: 0, end: 0, draftRev: 7 }
    },
    insertText(text, span) {
      calls.insert.push({ text, span })
      if (insertThrows) throw new Error('editor exploded')
      return insertResult
    },
  }
}

describe('T0.2 insertionTextFor（纯函数）', () => {
  test('空草稿：skill 引用 + 引导语', () => {
    const entry = SCIENCE_SKILLS.find((s) => s.id === 'explore')
    const text = insertionTextFor(entry, '')
    assert.equal(text, '/sci-hypothesis\n我想研究的方向是：')
  })

  test('已有草稿：只插入分隔+引用（insertText 是光标处插入，不重复旧稿）', () => {
    const entry = SCIENCE_SKILLS.find((s) => s.id === 'explore')
    const text = insertionTextFor(entry, '我手头的草稿')
    assert.equal(text, '\n\n/sci-hypothesis\n我想研究的方向是：')
    assert.ok(!text.includes('我手头的草稿'), '插入文本不得包含旧草稿（insertText 在光标处插入）')
  })

  test('无 skill 的语义动作：插入自然语言请求', () => {
    const entry = SCIENCE_SKILLS.find((s) => s.id === 'results')
    const text = insertionTextFor(entry, '')
    assert.ok(text.startsWith('请检查并整理'))
    assert.ok(!text.startsWith('/'))
  })

  test('连续点击同一 skill：幂等（null = 不重复追加）', () => {
    const entry = SCIENCE_SKILLS.find((s) => s.id === 'explore')
    const once = insertionTextFor(entry, '')
    const again = insertionTextFor(entry, `前置文字\n\n${once}`)
    assert.equal(again, null)
  })
})

describe('T0.2 insertSkillEntry（CAS 行为）', () => {
  const entry = SCIENCE_SKILLS.find((s) => s.id === 'explore')

  test('正常路径：capture → insert（焦点由 dock 按钮 onMouseDown preventDefault 保持，facade 无 focus）', () => {
    const actions = fakeInputActions()
    const r = insertSkillEntry(actions, { phase: 'plain', draft: '', draftRev: 7 }, entry)
    assert.equal(r.ok, true)
    assert.equal(r.inserted, true)
    assert.equal(actions.calls.capture, 1)
    assert.equal(actions.calls.insert.length, 1)
    assert.ok(actions.calls.insert[0].text.startsWith('/sci-hypothesis'))
    assert.deepEqual(actions.calls.insert[0].span, { start: 0, end: 0, draftRev: 7 })
  })

  test('insertText 返回 false（草稿已变化）：明确失败，草稿不覆盖', () => {
    const actions = fakeInputActions({ insertResult: false })
    const r = insertSkillEntry(actions, { phase: 'plain', draft: 'x' }, entry)
    assert.equal(r.ok, false)
    assert.equal(r.code, 'draft-changed')
    assert.match(r.message, /重新点击|草稿/)
  })

  test('提交锁定（claimed/submitting/sending）：拒绝且不触碰编辑器', () => {
    const actions = fakeInputActions()
    const r = insertSkillEntry(actions, { phase: 'submitting', draft: 'x' }, entry)
    assert.equal(r.ok, false)
    assert.equal(r.code, 'busy')
    assert.equal(actions.calls.capture, 0)
  })

  test('captureInsertion 抛错：失败返回，不调用 insert', () => {
    const actions = fakeInputActions({ captureThrows: true })
    const r = insertSkillEntry(actions, { phase: 'plain', draft: '' }, entry)
    assert.equal(r.ok, false)
    assert.equal(r.code, 'capture-failed')
    assert.equal(actions.calls.insert.length, 0)
  })

  test('insertText 抛错：失败返回，不假装成功', () => {
    const actions = fakeInputActions({ insertThrows: true })
    const r = insertSkillEntry(actions, { phase: 'plain', draft: '' }, entry)
    assert.equal(r.ok, false)
    assert.equal(r.code, 'insert-failed')
  })

  test('inputActions 缺失（旧版宿主）：明确 no-input-actions，不抛异常', () => {
    const r = insertSkillEntry(null, null, entry)
    assert.equal(r.ok, false)
    assert.equal(r.code, 'no-input-actions')
  })

  test('重复插入：幂等返回 inserted:false，不改草稿', () => {
    const actions = fakeInputActions()
    const state = { phase: 'plain', draft: '/sci-hypothesis\n我想研究的方向是：', draftRev: 8 }
    const r = insertSkillEntry(actions, state, entry)
    assert.equal(r.ok, true)
    assert.equal(r.inserted, false)
    assert.equal(actions.calls.insert.length, 0)
  })
})
