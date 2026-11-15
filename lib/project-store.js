// dsh-science — 项目状态存储（Project Store，T0.3 spike → 阶段 1 正式 module）
//
// 设计真源 §8.4：Node 内置 node:sqlite；库文件 $DSH_HOME/dsh-science/science-state.sqlite；
// WAL + foreign keys + busy timeout；全部 SQL 预编译参数。
// 首版表结构按"事件表 + 最新 JSON snapshot"最小集：projects / snapshots / audit_events /
// idempotency_receipts / outbox / schema_migrations。对象（core/results/claims/evidence）
// 与确认凭据保存在 snapshot JSON 内，由领域层维护对象 revision——避免过早拆关系表。
//
// 唯一写 seam：execute(projectId, command) 在同一个事务里推进 revision、写 snapshot、
// 审计事件、幂等回执和 outbox；提交后由 outbox 发布（失败不回滚业务事实，重试补发）。

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { dataDirOf } from './store.js'

const SCHEMA_VERSION = 1

function log(msg) {
  console.log(`[dsh-science project-store] ${msg}`)
}

const WORKSPACE_KEY_RE = /^[a-f0-9]{64}$/

export function assertWorkspaceKey(value) {
  const key = String(value || '')
  if (!WORKSPACE_KEY_RE.test(key)) {
    throw new StoreError('invalid-workspace-key', 'workspaceKey 只能由服务端生成，不能由客户端提交')
  }
  return key
}

const MIGRATIONS = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        schema_version INTEGER NOT NULL DEFAULT 1,
        title TEXT NOT NULL DEFAULT '',
        primary_root_session_id TEXT NOT NULL,
        bindings TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        mutation_id TEXT NOT NULL,
        command TEXT NOT NULL,
        payload TEXT NOT NULL,
        actor TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_events(project_id, seq);
      CREATE TABLE IF NOT EXISTS idempotency_receipts (
        mutation_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        receipt TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        frame TEXT NOT NULL,
        published_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(published_at, id);
      CREATE TABLE IF NOT EXISTS root_bindings (
        root_session_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'primary',
        bound_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bindings_project ON root_bindings(project_id);
    `,
  },
  {
    version: 2,
    up: `
      CREATE TABLE IF NOT EXISTS legacy_imports (
        migration_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        backup_path TEXT NOT NULL,
        imported_at INTEGER NOT NULL
      );
    `,
  },
  {
    // H2 修复：幂等回执按 (project_id, mutation_id) 作用域——跨项目同 mutationId 不得串号。
    version: 3,
    up: `
      CREATE TABLE IF NOT EXISTS idempotency_receipts_v3 (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        mutation_id TEXT NOT NULL,
        receipt TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, mutation_id)
      );
      INSERT OR IGNORE INTO idempotency_receipts_v3 (project_id, mutation_id, receipt, created_at)
        SELECT project_id, mutation_id, receipt, created_at FROM idempotency_receipts;
      DROP TABLE idempotency_receipts;
      ALTER TABLE idempotency_receipts_v3 RENAME TO idempotency_receipts;
    `,
  },
  {
    // T7：工作区目录授权键。workspace_key 只由服务端写入；客户端 metadata 不能改它。
    // 无法唯一回填的既有项目保持 legacy-unassigned，不进入任何工作区目录。
    version: 4,
    up: `
      ALTER TABLE projects ADD COLUMN workspace_key TEXT DEFAULT '';
      ALTER TABLE projects ADD COLUMN workspace_status TEXT NOT NULL DEFAULT 'legacy-unassigned';
      CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_status, workspace_key);
      CREATE TABLE IF NOT EXISTS catalog_secret (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        secret TEXT NOT NULL
      );
    `,
  },
]

export class ProjectStore {
  constructor(db) {
    this.db = db
    this.listeners = new Set() // (frame) => void；outbox 发布时通知
    this.publishing = false // M6 重入守卫
    this.publishCount = 0 // L4 清理计数
    this._inTx = false // L4 嵌套事务防护
    this.faultInjector = null // T3 测试 seam：fn(stage) 可抛错，用于事务故障注入
    this.migrate()
    this.prepareStatements()
  }

  static open(dshHome = null) {
    const dir = dshHome ? join(dshHome, 'dsh-science') : dataDirOf()
    mkdirSync(dir, { recursive: true })
    const db = new DatabaseSync(join(dir, 'science-state.sqlite'))
    try {
      db.exec('PRAGMA journal_mode = WAL')
      db.exec('PRAGMA foreign_keys = ON')
      db.exec('PRAGMA busy_timeout = 5000')
      return new ProjectStore(db)
    } catch (err) {
      // 打开失败（损坏 DB 等）必须释放文件句柄，否则 Windows 上删除目录会 EPERM
      try { db.close() } catch { /* ignore */ }
      throw err
    }
  }

  prepareStatements() {
    this.st = {
      getMigration: this.db.prepare('SELECT version FROM schema_migrations'),
      addMigration: null,
      getProject: this.db.prepare('SELECT * FROM projects WHERE id = ?'),
      getProjectByRoot: this.db.prepare(
        `SELECT p.* FROM projects p JOIN root_bindings b ON b.project_id = p.id WHERE b.root_session_id = ?`,
      ),
      getBinding: this.db.prepare('SELECT * FROM root_bindings WHERE root_session_id = ?'),
      insertProject: this.db.prepare(
        'INSERT INTO projects (id, schema_version, title, primary_root_session_id, bindings, created_at, updated_at, workspace_key, workspace_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ),
      assignWorkspace: this.db.prepare(
        `UPDATE projects SET workspace_key = ?, workspace_status = 'assigned', updated_at = ? WHERE id = ? AND workspace_status <> 'assigned'`,
      ),
      listCatalog: this.db.prepare(
        `SELECT id, title, primary_root_session_id, updated_at FROM projects WHERE workspace_status = 'assigned' AND workspace_key = ? ORDER BY updated_at DESC, id ASC`,
      ),
      insertBinding: this.db.prepare(
        'INSERT OR REPLACE INTO root_bindings (root_session_id, project_id, role, bound_at) VALUES (?, ?, ?, ?)',
      ),
      getSnapshot: this.db.prepare('SELECT * FROM snapshots WHERE project_id = ?'),
      insertSnapshot: this.db.prepare(
        'INSERT OR REPLACE INTO snapshots (project_id, revision, snapshot, updated_at) VALUES (?, ?, ?, ?)',
      ),
      insertAudit: this.db.prepare(
        'INSERT INTO audit_events (project_id, revision, mutation_id, command, payload, actor, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ),
      getReceipt: this.db.prepare('SELECT * FROM idempotency_receipts WHERE project_id = ? AND mutation_id = ?'),
      insertReceipt: this.db.prepare(
        'INSERT INTO idempotency_receipts (project_id, mutation_id, receipt, created_at) VALUES (?, ?, ?, ?)',
      ),
      insertOutbox: this.db.prepare(
        'INSERT INTO outbox (project_id, revision, frame, created_at) VALUES (?, ?, ?, ?)',
      ),
      pendingOutbox: this.db.prepare('SELECT * FROM outbox WHERE published_at IS NULL ORDER BY id ASC LIMIT 100'),
      markPublished: this.db.prepare('UPDATE outbox SET published_at = ? WHERE id = ?'),
      maxOutboxId: this.db.prepare('SELECT MAX(id) AS maxId FROM outbox'),
      insertLegacyImport: this.db.prepare(
        // T3：审计事实用普通 INSERT——同一 migrationId 不得被 REPLACE 覆盖。
        'INSERT INTO legacy_imports (migration_id, project_id, source, source_hash, backup_path, imported_at) VALUES (?, ?, ?, ?, ?, ?)',
      ),
      getLegacyImport: this.db.prepare('SELECT * FROM legacy_imports WHERE migration_id = ?'),
      updateProjectTitle: this.db.prepare('UPDATE projects SET title = ?, updated_at = ? WHERE id = ?'),
      getBindingAny: this.db.prepare('SELECT * FROM root_bindings WHERE root_session_id = ?'),
      revisionOf: this.db.prepare('SELECT revision FROM snapshots WHERE project_id = ?'),
    }
    this.migrate()
  }

  // node:sqlite 无 .transaction()（better-sqlite3 API）：手动 BEGIN IMMEDIATE/COMMIT/ROLLBACK。
  // IMMEDIATE 取写锁，避免并发写升级死锁；busy_timeout 由 PRAGMA 兜底。
  // L4：嵌套调用显式报错（调用方不得在事务回调里再走 runInTransaction）。
  runInTransaction(fn) {
    if (this._inTx) throw new StoreError('tx-nested', 'runInTransaction 不允许嵌套调用')
    this.db.exec('BEGIN IMMEDIATE')
    this._inTx = true
    try {
      const out = fn()
      this.db.exec('COMMIT')
      return out
    } catch (err) {
      try { this.db.exec('ROLLBACK') } catch (rbErr) {
        log(`ROLLBACK failed: ${rbErr && rbErr.message}`) // 回滚失败记录；连接交由上层 close 重建
      }
      throw err
    } finally {
      this._inTx = false
    }
  }

  // T3：故障注入 seam（仅测试/诊断使用）。injector(stage) 抛错即模拟对应阶段失败。
  // stage: 'before-command' | 'after-snapshot' | 'at-ledger' | 'after-commit'
  setFaultInjector(injector) {
    this.faultInjector = typeof injector === 'function' ? injector : null
  }

  injectFault(stage) {
    if (!this.faultInjector) return
    this.faultInjector(stage)
  }

  migrate() {
    // 迁移先于 prepareStatements：语句全部针对迁移后的表结构。
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)')
    const applied = new Set(
      this.db.prepare('SELECT version FROM schema_migrations').all().map((r) => Number(r.version)),
    )
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue
      this.runInTransaction(() => {
        this.db.exec(m.up)
        this.db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(m.version, Date.now())
      })
      log(`migration applied: v${m.version}`)
    }
  }

  // ---- 绑定 ------------------------------------------------------------------
  bindingOfRootSession(rootSessionId) {
    const row = this.st.getProjectByRoot.get(String(rootSessionId))
    if (!row) return null
    return {
      projectId: row.id,
      primaryRootSessionId: row.primary_root_session_id,
      title: row.title,
      role: String(rootSessionId) === row.primary_root_session_id ? 'primary' : 'attached',
    }
  }

  // 只读项目清单（升级迁移用：判断旧全局台账能否唯一归属到单个 root）。
  listProjects() {
    return this.db.prepare('SELECT id, primary_root_session_id FROM projects ORDER BY created_at ASC').all()
      .map((row) => ({ projectId: row.id, rootSessionId: row.primary_root_session_id }))
  }

  // T7：授权用 workspaceKey 只存在于 projects 列。set-metadata 与 snapshot JSON 都不能改它。
  projectAuthOf(projectId) {
    const row = this.st.getProject.get(String(projectId))
    if (!row) return null
    return {
      projectId: row.id,
      rootSessionId: row.primary_root_session_id,
      title: row.title,
      workspaceKey: String(row.workspace_key || ''),
      workspaceStatus: String(row.workspace_status || 'legacy-unassigned'),
      updatedAt: Number(row.updated_at) || 0,
    }
  }

  listProjectAuthRows() {
    return this.db.prepare(
      'SELECT id, title, primary_root_session_id, workspace_key, workspace_status, updated_at FROM projects ORDER BY created_at ASC',
    ).all().map((row) => ({
      projectId: row.id,
      title: row.title,
      rootSessionId: row.primary_root_session_id,
      workspaceKey: String(row.workspace_key || ''),
      workspaceStatus: String(row.workspace_status || 'legacy-unassigned'),
      updatedAt: Number(row.updated_at) || 0,
    }))
  }

  catalogSecret() {
    const row = this.db.prepare('SELECT secret FROM catalog_secret WHERE id = 1').get()
    if (row && row.secret) return String(row.secret)
    const secret = randomBytes(32).toString('base64url')
    this.db.prepare('INSERT INTO catalog_secret (id, secret) VALUES (1, ?)').run(secret)
    return secret
  }

  // 只回填尚未归属的项目。已 assigned 的键不可被覆盖，避免客户端或二次迁移改授权。
  assignWorkspaceKey(projectId, workspaceKey, { now = Date.now() } = {}) {
    const key = assertWorkspaceKey(workspaceKey)
    const row = this.st.getProject.get(String(projectId))
    if (!row) throw new StoreError('project-not-found', `项目 ${projectId} 不存在`)
    if (String(row.workspace_status || '') === 'assigned' && String(row.workspace_key || '')) {
      return { changed: false, workspaceKey: String(row.workspace_key) }
    }
    const result = this.st.assignWorkspace.run(key, now, String(projectId))
    return { changed: Number(result.changes) > 0, workspaceKey: key }
  }

  listCatalogProjects(workspaceKey) {
    const key = assertWorkspaceKey(workspaceKey)
    return this.st.listCatalog.all(key).map((row) => ({
      projectId: row.id,
      title: row.title,
      rootSessionId: row.primary_root_session_id,
      updatedAt: Number(row.updated_at) || 0,
    }))
  }

  createProject({ rootSessionId, title = '', workspaceKey = '', now = Date.now() }) {
    const id = `proj-${now.toString(36)}-${randomUUID().slice(0, 8)}`
    const key = workspaceKey ? assertWorkspaceKey(workspaceKey) : ''
    const status = key ? 'assigned' : 'legacy-unassigned'
    this.runInTransaction(() => {
      this.st.insertProject.run(id, SCHEMA_VERSION, String(title), String(rootSessionId), '{}', now, now, key, status)
      this.st.insertBinding.run(String(rootSessionId), id, 'primary', now)
      const snap = emptySnapshot(id, rootSessionId, now)
      if (title) snap.metadata.title = String(title) // 低-1：建项目标题同步进快照（避免首次 execute 空标题回抹）
      this.st.insertSnapshot.run(id, 0, JSON.stringify(snap), now)
    })
    log(`project created: ${id} (root ${rootSessionId})`)
    return id
  }

  attachRoot(projectId, rootSessionId, { now = Date.now() } = {}) {
    const project = this.st.getProject.get(String(projectId))
    if (!project) throw new StoreError('project-not-found', `项目 ${projectId} 不存在`)
    // M4：禁止静默改绑——已绑定到其他项目的 root 必须显式解绑，不能被 attach 覆盖
    const existing = this.st.getBindingAny.get(String(rootSessionId))
    if (existing && existing.project_id !== String(projectId)) {
      throw new StoreError('binding-conflict', `会话 ${rootSessionId} 已绑定项目 ${existing.project_id}，不能改绑到 ${projectId}`)
    }
    this.st.insertBinding.run(String(rootSessionId), String(projectId), 'attached', now)
  }

  // 轻量 revision 读取（observe 兜底轮询用，避免整包 JSON.parse）
  revisionOf(projectId) {
    const row = this.st.revisionOf.get(String(projectId))
    return row ? Number(row.revision) : null
  }

  // M4 统一 attach 入口：表 + 审计 + outbox 同事务维护（命令/HTTP 共用）
  attachSessionWithAudit({ projectId, rootSessionId, actor = {}, now = Date.now() }) {
    const pid = String(projectId)
    let out = null
    this.runInTransaction(() => {
      const snapRow = this.st.getSnapshot.get(pid)
      if (!snapRow) throw new StoreError('project-not-found', `项目 ${pid} 不存在`)
      const current = JSON.parse(snapRow.snapshot)
      const existing = this.st.getBindingAny.get(String(rootSessionId))
      if (existing && existing.project_id !== pid) {
        throw new StoreError('binding-conflict', `会话 ${rootSessionId} 已绑定项目 ${existing.project_id}，不能改绑`)
      }
      if (existing) {
        out = { kind: 'already-applied', bound: true, projectId: pid }
        return
      }
      this.st.insertBinding.run(String(rootSessionId), pid, 'attached', now)
      if (!current.bindings.attachedRootSessionIds.includes(String(rootSessionId))) {
        current.bindings.attachedRootSessionIds.push(String(rootSessionId))
      }
      const nextRevision = Number(snapRow.revision) + 1
      current.revision = nextRevision
      current.metadata.updatedAt = now
      this.st.insertSnapshot.run(pid, nextRevision, JSON.stringify(current), now)
      this.st.updateProjectTitle.run(String(current.metadata && current.metadata.title || ''), now, pid)
      this.st.insertAudit.run(pid, nextRevision, `attach-${String(rootSessionId).slice(0, 40)}-${now}`, 'project.attach-session', JSON.stringify({ rootSessionId }), JSON.stringify(actor), now)
      this.st.insertOutbox.run(pid, nextRevision, JSON.stringify({ projectId: pid, projectRevision: nextRevision, changedKeys: ['bindings'], operationId: `attach-${now}`, updatedAt: now }), now)
      out = { kind: 'applied', bound: true, projectId: pid, revision: nextRevision }
    })
    this.publishPending()
    return out
  }

  // ---- 旧数据导入台账（T3：只允许事务内写入）------------------------------------
  // 正式路径由 execute(..., { legacyImport }) 同事务写入；本方法保留给事务内调用/诊断，
  // 普通 INSERT 保证同一 migrationId 不会被覆盖（重复写入会抛 SQLITE 约束错误）。
  recordLegacyImport({ migrationId, projectId, source, sourceHash, backupPath, now = Date.now() }) {
    this.st.insertLegacyImport.run(
      String(migrationId), String(projectId), String(source), String(sourceHash), String(backupPath), now,
    )
  }

  // ---- 读取 ------------------------------------------------------------------
  snapshotOf(projectId) {
    const row = this.st.getSnapshot.get(String(projectId))
    if (!row) return null
    // M8：行级损坏不静默重建——返回 corrupt 标记，读取方降级为只读恢复提示
    try {
      return { revision: Number(row.revision), snapshot: JSON.parse(row.snapshot), updatedAt: Number(row.updated_at) }
    } catch (err) {
      return { corrupt: true, revision: Number(row.revision), error: `snapshot parse failed: ${err && err.message}` }
    }
  }

  // ---- 唯一写 seam -------------------------------------------------------------
  // command: { mutationId, expectedRevision, command, payload, actor, source }
  // handler(currentSnapshot) -> { snapshot, changedKeys, objects }；抛错则整批回滚。
  // 幂等键按 (projectId, mutationId) 作用域；回执检查在 BEGIN IMMEDIATE 之后（事务内复检），
  // INSERT（非 REPLACE）保证并发同键只有一份回执。
  execute(projectId, command, handler, options = {}) {
    const pid = String(projectId)
    const mutationId = String(command.mutationId || '')
    if (!mutationId) return { kind: 'invalid', reason: 'mutationId 必填（幂等键）' }
    const now = Date.now()
    const ledger = options.legacyImport || null
    if (ledger && String(ledger.projectId) !== pid) {
      return { kind: 'invalid', reason: `迁移台账目标项目不一致（${ledger.projectId} ≠ ${pid}）` }
    }
    let result = null
    try {
      this.runInTransaction(() => {
        // H2：幂等检查在事务内（写锁之后），并断言回执属于本项目
        const existing = this.st.getReceipt.get(pid, mutationId)
        if (existing) {
          const receipt = JSON.parse(existing.receipt)
          if (receipt.projectId !== pid) {
            throw new StoreError('mutation-id-scope', `幂等键 ${mutationId} 已被其他项目占用`)
          }
          // T3：旧版本在 commit 之后才写台账，可能留下“有回执、无台账”的异常状态。
          // 同事务一次性 reconcile：补台账，不重放命令、不推进 revision。
          let reconciled = false
          if (ledger) {
            const row = this.st.getLegacyImport.get(String(ledger.migrationId))
            if (!row) {
              this.injectFault('at-ledger')
              this.insertLedgerRow(ledger, now)
              reconciled = true
            } else if (String(row.project_id) !== pid) {
              throw new StoreError('legacy-import-conflict', `该旧数据已导入过其他项目（${row.project_id}）`)
            }
          }
          result = { kind: 'already-applied', receipt, ...(reconciled ? { reconciled: true } : {}) }
          return
        }
        // T3：仅有台账、没有回执（部分恢复的异常状态）→ 视为已导入，绝不重复应用。
        if (ledger) {
          const row = this.st.getLegacyImport.get(String(ledger.migrationId))
          if (row) {
            if (String(row.project_id) !== pid) {
              throw new StoreError('legacy-import-conflict', `该旧数据已导入过其他项目（${row.project_id}）`)
            }
            result = { kind: 'already-applied', receipt: null, ledgerOnly: true }
            return
          }
        }
        const snapRow = this.st.getSnapshot.get(pid)
        if (!snapRow) throw new StoreError('project-not-found', `项目 ${pid} 不存在`)
        const currentRevision = Number(snapRow.revision)
        if (command.expectedRevision != null && Number(command.expectedRevision) !== currentRevision) {
          throw new StoreError('conflict', `项目 revision 过期（当前 ${currentRevision}，请求基于 ${command.expectedRevision}）`, { currentRevision })
        }
        let current
        try {
          current = JSON.parse(snapRow.snapshot)
        } catch (err) {
          // M8：行级损坏 → 结构化错误（项目进入只读恢复，绝不静默重建）
          throw new StoreError('snapshot-corrupt', `项目 ${pid} 快照损坏，无法读取（${err && err.message}）`)
        }
        this.injectFault('before-command')
        const applied = handler(current, now)
        const nextRevision = currentRevision + 1
        // 快照内嵌 revision 与 updatedAt 由存储层统一维护（领域层只改业务字段）
        applied.snapshot.revision = nextRevision
        if (applied.snapshot.metadata) applied.snapshot.metadata.updatedAt = now
        const snapshotText = JSON.stringify(applied.snapshot)
        this.st.insertSnapshot.run(pid, nextRevision, snapshotText, now)
        // M4：projects 行与 snapshot.metadata.title 保持同步（bindingOfRootSession 不返回 stale title）
        this.st.updateProjectTitle.run(String(applied.snapshot.metadata && applied.snapshot.metadata.title || ''), now, pid)
        this.injectFault('after-snapshot')
        this.st.insertAudit.run(pid, nextRevision, mutationId, String(command.command || ''), JSON.stringify(command.payload ?? {}), JSON.stringify(command.actor ?? {}), now)
        const receipt = {
          mutationId,
          projectId: pid,
          revision: nextRevision,
          command: String(command.command || ''),
          changedKeys: applied.changedKeys || [],
          objects: applied.objects || [],
          appliedAt: now,
          source: String(command.source || 'tool'),
        }
        this.st.insertReceipt.run(pid, mutationId, JSON.stringify(receipt), now)
        const frame = {
          projectId: pid,
          projectRevision: nextRevision,
          changedKeys: applied.changedKeys || [],
          operationId: mutationId,
          updatedAt: now,
        }
        this.st.insertOutbox.run(pid, nextRevision, JSON.stringify(frame), now)
        // T3：legacy 导入台账与命令/审计/回执/outbox 同事务提交。
        if (ledger) {
          this.injectFault('at-ledger')
          this.insertLedgerRow(ledger, now)
        }
        result = { kind: 'applied', receipt, frame }
      })
    } catch (err) {
      if (err instanceof StoreError) {
        const conflictCodes = new Set(['conflict', 'object-conflict'])
        return { kind: conflictCodes.has(err.code) ? 'conflict' : 'invalid', reason: err.message, code: err.code, ...(err.details || {}) }
      }
      throw err
    }
    // 提交后通知：T3 故障注入模拟 outbox 发布失败。业务事实已提交，重试按幂等回执/台账
    // 返回 duplicate，不会重复导入；错误带 committed=true 供调用方区分 partial-success。
    if (result && result.kind === 'applied') {
      try {
        this.injectFault('after-commit')
      } catch (err) {
        err.committed = true
        throw err
      }
    }
    this.publishPending()
    return result
  }

  insertLedgerRow(ledger, now) {
    this.st.insertLegacyImport.run(
      String(ledger.migrationId),
      String(ledger.projectId),
      String(ledger.source || ''),
      String(ledger.sourceHash || ''),
      String(ledger.backupPath || ''),
      now,
    )
  }

  // ---- outbox ------------------------------------------------------------------
  // M6：重入守卫——listener 内再次 execute 时，嵌套 publishPending 直接返回，
  // 由外层循环收尾，避免同帧重复投递与无界递归。
  publishPending() {
    if (this.publishing) return
    this.publishing = true
    try {
      const rows = this.st.pendingOutbox.all()
      for (const row of rows) {
        const frame = JSON.parse(row.frame)
        let delivered = 0
        for (const listener of this.listeners) {
          try {
            listener(frame)
            delivered++
          } catch (err) {
            log(`outbox listener failed: ${err && err.message}`) // 单个订阅者失败不影响其余
          }
        }
        // 本地直接投递（同进程订阅者）成功即标记发布；无订阅者时同样标记（跨进程
        // 拉取方以 revision gap 补读 baseline 为准，无需重试）；仅投递失败保持待发。
        if (delivered > 0 || this.listeners.size === 0) {
          this.st.markPublished.run(Date.now(), row.id)
          this.publishCount++
        }
      }
    } finally {
      this.publishing = false
    }
    // L3/L4：顺手有界清理（每 64 次发布一次；0 次发布时不触发；失败不影响主流程）
    if (this.publishCount > 0 && this.publishCount % 64 === 0) {
      try { this.pruneOutbox() } catch (err) { log(`outbox prune failed: ${err && err.message}`) }
    }
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  // 有界清理：已发布的 outbox 保留最近 keep 条（L1：整数断言 + 预编译参数化）
  pruneOutbox(keep = 1000) {
    const n = Math.floor(Number(keep))
    const limit = Number.isSafeInteger(n) && n > 0 ? n : 1000
    if (!this.st.pruneOutbox) {
      this.st.pruneOutbox = this.db.prepare('DELETE FROM outbox WHERE published_at IS NOT NULL AND id NOT IN (SELECT id FROM outbox WHERE published_at IS NOT NULL ORDER BY id DESC LIMIT ?)')
    }
    this.st.pruneOutbox.run(limit)
  }

  close() {
    try { this.db.close() } catch { /* ignore */ }
  }
}

export class StoreError extends Error {
  constructor(code, message, details = null) {
    super(message)
    this.code = code
    this.details = details
  }
}

export function emptyPaperState(now) {
  return {
    question: '',
    scope: '',
    sourceSummary: '',
    questionUpdatedAt: 0,
    stage: 'explore',
    stageNote: '',
    stageUpdatedAt: now,
    core: null,
    results: [],
    narrative: '',
    resultSeq: 0,
    submission: {
      dataCode: { status: 'pending', note: '', updatedAt: 0 },
      ethics: { status: 'pending', note: '', updatedAt: 0 },
      reporting: { status: 'pending', note: '', updatedAt: 0 },
      limitations: { status: 'pending', note: '', updatedAt: 0 },
    },
  }
}

export function emptySnapshot(projectId, rootSessionId, now) {
  return {
    schemaVersion: 2,
    projectId,
    revision: 0,
    metadata: { title: '', workspaceIdentity: '', createdAt: now, updatedAt: now },
    bindings: { primaryRootSessionId: String(rootSessionId), attachedRootSessionIds: [], branch: 'main' },
    paper: emptyPaperState(now),
    focus: { activeResultId: null, nextDecisions: [], blockers: [] },
    links: { taskRefs: [], artifactRefs: [], reviewRefs: [] },
    decisions: { pending: [], confirmedReceipts: [] },
    migration: { sourceHashes: [], migrationIds: [] },
  }
}
