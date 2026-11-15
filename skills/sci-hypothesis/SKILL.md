---
name: sci-hypothesis
description: 提出科研假设与研究课题思路。用户要 idea/课题/假设/研究方向时使用：基于文献缺口生成、评估、收敛假设。
---

# 假设生成与课题构思（设计参考 ARS/Orchestra Research 的想法生成流程）

## 流程

### 1. 定位（先于发散）
与用户确认：领域、已有数据/资源（数据库权限、算力——可用 `sci_ssh_profiles` list 查）、时间预算、目标产出（论文/基金/预研）。

### 2. 文献缺口分析
- `web_search` / `web_fetch` 多源检索（近 3 年为主）+ `sci_db_tables` 盘点自有数据。
- 输出 3-5 个「缺口卡」：现象 → 已知解释 → 未解释之处 → 为什么现在能做（新数据/新方法/新算力）。

### 3. 假设发散（每轮 3-5 个，宁缺毋滥）
每个假设按模板填写：
- **陈述**：可证伪的一句话（X 通过 Y 机制影响 Z，在 W 条件下）。
- **检验路径**：需要什么数据、什么分析/模拟（能否用 `sci_db_*`/`sci_job_submit` 落地）。
- **风险**：最可能的失败模式；**新颖性**：与哪 3 篇最近文献区分。

### 4. 收敛评分（与用户一起）
新颖性 / 可行性 / 数据就绪度 / 周期，各 1-5 分；淘汰 <3 分项；Top 1-2 展开为开题段落。

## 硬规则

- 假设必须可证伪；检验路径必须映射到本会话可执行的工具链，否则标注"需要新数据/新算力"。
- 所有文献断言经 `web_search` / `web_fetch` 检索并由 `sci_doi_verify` 核对，禁止凭记忆编造研究现状。

## 确认卡（sci-paper-confirm）

需要用户确认核心主张或 Result 时，不要自行替用户确认：

1. 先调用 `sci_blueprint_overview`，取项目的 `revision`、目标对象的 `revision` 与 `contentHash`。
2. 调用 `propose_action`（action=`sci-paper-confirm`），details 填 `projectId`、`objectId`、`objectRevision`、`projectRevision`、`expectedHash`、`title`、`summary`。
3. 卡片只绑定用户提案时看到的那次对象修订与内容哈希；卡片发起后语义被修改，旧卡确认会被拒绝。修改意见回到对话说明，由你更新对象后重新发起。
