// Shared by the project-store regression and the two-host installation smoke test.
import assert from 'node:assert/strict'

export async function runLongStudyTasks({ a, b, call, board, setGate }) {
  const dispatch = (lead, subject, options = {}) => call(lead, 'sci_team_dispatch', {
    result_id: 'res-1', subject, task_desc: subject, ...options,
  })
  const update = (lead, id, status) => call(lead, 'sci_team_update_task', { task_id: id, status })
  const status = (lead, options = {}) => call(lead, 'sci_team_status', options)

  setGate('warn')
  const upstream = (await dispatch(a, '质控原始批次')).taskId
  const analysis = (await dispatch(a, '按质控结果分析批次', { blocked_by: [upstream] })).taskId
  const independent = (await dispatch(a, '独立重复测量')).taskId
  const expectedA = [upstream, analysis, independent]
  const expectedB = []
  for (let i = 0; i < 201; i++) expectedB.push((await dispatch(b, '独立项目样本 ' + i)).taskId)
  assert.deepEqual((await status(a)).tasks.map(t => t.id), expectedA)

  let cursor
  const seen = []
  do {
    const result = await status(b, { before: cursor, limit: 35 })
    assert.equal(result.totalTasks, 201)
    seen.unshift(...result.tasks.map(t => t.id))
    cursor = result.nextBefore
  } while (cursor)
  assert.deepEqual(seen, expectedB)
  await assert.rejects(status(a, { before: expectedB[0] }), /找不到/)
  const before = await board(a)
  await assert.rejects(update(a, analysis, 'completed'), /尚未满足交付条件/)
  assert.deepEqual(before.paper.results[0].tasks.map(t => t.id), expectedA)
  assert.equal(before.team.counts.blocked, 1)
  assert.equal((await board(b)).paper.results[0].taskCount, 201)

  await update(a, upstream, 'failed')
  await assert.rejects(update(a, analysis, 'completed'), /未成功交付/)
  assert.deepEqual((await status(a)).tasks.find(t => t.id === analysis).unresolved, [{ id: upstream, status: 'failed' }])
  assert.match((await board(a)).team.tasks.find(t => t.id === analysis).blockers.join(' '), /未成功交付/)
  setGate('hard')
  await assert.rejects(dispatch(a, '使用质控输出', { blocked_by: [upstream] }), /未成功交付/)
  await update(a, independent, 'cancelled')
  await assert.rejects(dispatch(a, '使用重复测量输出', { blocked_by: [independent] }), /未成功交付/)
  const diagnostic = await dispatch(a, '复盘失败和取消的批次', { blocked_by: [upstream, independent], dependency_policy: 'finished' })
  assert.deepEqual(diagnostic.dependencyGate.unresolved, [])
  assert.equal((await board(a)).team.tasks.find(t => t.id === diagnostic.taskId).isBlocked, false)

  const older = expectedB[0]
  await update(b, older, 'completed')
  const final = await dispatch(b, '汇总第一个样本', { blocked_by: [older] })
  const result = await board(b)
  assert.equal(result.team.tasks.find(t => t.id === final.taskId).isBlocked, false)
  assert.equal(result.team.counts.completed, 1)
  assert.equal(result.paper.results[0].taskCount, 202)
  return { projectA: (await status(a)).totalTasks, projectB: (await status(b)).totalTasks, oldestA: upstream, oldestB: older, diagnostic: diagnostic.taskId, joined: final.taskId }
}
