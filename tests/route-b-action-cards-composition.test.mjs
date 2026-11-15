// 路线 B T0 红灯：原生 Action Cards 的有效插件组合必须同时包含服务端 Host 与客户端
// 卡片框架。依据：验收 R1 B2 / 任务书 T4；设计真源 §10.2（durable anchor：确认卡是
// 路线 B 的关键用户决策表面）。
//
// 事实来源：官方 bundle `@deepseek-ai/dsh-personalized-recommendations` 的插件行同时
// 插入 `@deepseek-ai/dsh-action-cards`（Host）与 `@deepseek-ai/dsh-client-ui-action-cards`
// （Client）。只装 Host 时服务端能登记 kind，但对话回答下方没有已加载的客户端渲染器。
// 当前 DSH 运行时（app.asar/dsh/package.json）为 0.2.2-rc.3，两个包都以该版本随运行时提供。
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

  test('Action Cards 依赖版本与当前 DSH 运行时精确一致（不使用 ^/~ 范围）', () => {
    const pkg = JSON.parse(read('package.json'))
    const spec = pkg.dependencies && pkg.dependencies[HOST_ACTION_CARDS]
    assert.ok(spec, `package.json 必须声明 ${HOST_ACTION_CARDS}`)
    assert.match(
      String(spec),
      /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/,
      `Action Cards 依赖必须是精确版本（当前为 ${CURRENT_DSH_RUNTIME_VERSION}），实际为 "${spec}"`,
    )
    assert.equal(
      spec,
      CURRENT_DSH_RUNTIME_VERSION,
      `Action Cards 依赖必须与当前 DSH 运行时 ${CURRENT_DSH_RUNTIME_VERSION} 精确一致，实际为 "${spec}"`,
    )
  })
})

// 当前安装的 DSH 桌面运行时版本（app.asar/dsh/package.json，0.2.2-rc.3）。
// 升级 DSH 时本常量与 package.json 的 action-cards 版本必须一起更新——这正是回归点。
const CURRENT_DSH_RUNTIME_VERSION = '0.2.2-rc.3'
