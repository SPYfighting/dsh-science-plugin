// 路线 B T0 红灯：原生 Action Cards 的有效插件组合必须同时包含服务端 Host 与客户端
// 卡片框架。依据：验收 R1 B2 / 任务书 T4；设计真源 §10.2（durable anchor：确认卡是
// 路线 B 的关键用户决策表面）。
//
// 事实来源：官方 bundle `@deepseek-ai/dsh-personalized-recommendations` 的插件行同时
// 插入 `@deepseek-ai/dsh-action-cards`（Host）与 `@deepseek-ai/dsh-client-ui-action-cards`
// （Client）。只装 Host 时服务端能登记 kind，但对话回答下方没有已加载的客户端渲染器。
// 两个包由 DSH 运行时配套提供。
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const read = (rel) => readFileSync(join(root, rel), 'utf8')

// 只解析真实的插件行（insert 下的 - id/name），忽略注释——旧注释曾声称“客户端框架由官方
// web 前端按需加载”，把注释当证据会漏掉真实缺陷。
function patchRows(text) {
  const rows = []
  let current = null
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idMatch = /^-\s+id:\s*(.+)$/.exec(line)
    const nameMatch = /^name:\s*(.+)$/.exec(line)
    if (idMatch) {
      current = { id: stripQuotes(idMatch[1]) }
      rows.push(current)
    } else if (nameMatch && current) {
      current.name = stripQuotes(nameMatch[1])
    }
  }
  return rows
}

function stripQuotes(value) {
  return String(value).trim().replace(/^['"]|['"]$/g, '')
}

const HOST_ACTION_CARDS = '@deepseek-ai/dsh-action-cards'
const CLIENT_ACTION_CARDS = '@deepseek-ai/dsh-client-ui-action-cards'

describe('T0 红灯：Action Cards Host + Client 有效组合', () => {
  test('cordis.patch.yml 同时插入 Action Cards Host 与客户端卡片框架两行', () => {
    const rows = patchRows(read('cordis.patch.yml'))
    const names = rows.map((row) => row.name).filter(Boolean)
    assert.ok(names.includes(HOST_ACTION_CARDS), '缺少 Action Cards 服务端 Host 行')
    assert.ok(
      names.includes(CLIENT_ACTION_CARDS),
      '缺少 Action Cards 客户端行：服务端能登记确认 kind，但对话回答下方没有已加载的渲染器',
    )
    const host = rows.find((row) => row.name === HOST_ACTION_CARDS)
    const client = rows.find((row) => row.name === CLIENT_ACTION_CARDS)
    assert.notEqual(host, client, 'Host 与 Client 必须是两个独立插件行')
    assert.ok(host.id && client.id && host.id !== client.id, 'Host 与 Client 需要各自稳定的插件 id')
    assert.notEqual(host.disabled, true, 'Action Cards Host 行不得禁用')
    assert.notEqual(client.disabled, true, 'Action Cards 客户端行不得禁用')
  })

  test('工作台插件行按公开包名解析，确认卡使用宿主提供的配套版本', () => {
    const pkg = JSON.parse(read('package.json'))
    const mainRow = patchRows(read('cordis.patch.yml')).find(row => row.id === 'dsh-science')
    assert.equal(mainRow?.name, pkg.name)
    for (const name of [HOST_ACTION_CARDS, CLIENT_ACTION_CARDS]) {
      assert.equal(pkg.peerDependencies[name], pkg.engines.dsh)
      assert.equal(pkg.dependencies[name], undefined)
    }
    assert.equal(pkg.devDependencies[HOST_ACTION_CARDS], pkg.devDependencies[CLIENT_ACTION_CARDS])
  })
})
