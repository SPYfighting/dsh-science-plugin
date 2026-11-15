# dsh-science｜对话优先科研工作台

`dsh-science` 是 DeepSeek Harness（DSH）的科研插件。它把研究问题、可核验结果、团队任务和图件组织成**按项目隔离的结构化状态**，并把这些状态投影到原生对话输入框、会话轮次和右侧栏的卡片上。你继续用自然语言做科研，插件负责记住论文主线、守住确认闸门、把团队与产物整理成可核对的状态。

界面中的"研究结果（Result）""主张（Claim）"和"证据（Evidence）"是插件数据结构的固定名称：研究结果由可检验主张和证据支持。确认操作绑定当前修订；内容修改后需要重新确认。

## 工作方式

| 入口 | 用途 |
|---|---|
| 对话输入框上方的"科研"技能条 | 显示当前项目、阶段与待确认计数；提供开始探索、整理已有结果、查文献、绘图、写作、汇报等按钮——点击把技能引用与引导语填入原生输入框（不自动发送），由你补充后发送。 |
| 会话轮次中的状态卡 | AI 调用科研工具后，本轮改变了哪些对象、从哪个工具来、是否待确认，都在回答下方折叠展示。 |
| 确认卡片（Action Card） | 核心结论与 Result 的确认经 DSH 原生 Action Card 发起：默认同时加载 `@deepseek-ai/dsh-action-cards`（服务端 proposal/decision）与 `@deepseek-ai/dsh-client-ui-action-cards`（对话回答下方的卡片渲染），版本与当前 DSH 运行时精确一致。确认同时绑定项目 revision、对象 revision 与对象内容哈希（`expectedHash`）；目标对象被修改后旧卡失效，无关对象更新不会让卡片无故失效；退回只记录 decision，不修改论文语义。 |
| 右侧栏"研究状态" | 卡片作战室：待你处理（未确认/受阻）→ 论文主线 → 正在工作 → 成果 → 常用技能。成果只显示当前项目已登记的关键图件摘要，不列出全局文件或审查。 |
| 左侧栏"科研工作台" | 二级总览：论文主线、团队进展、图表与成果、专家配置四个页面，用于关系图、依赖图和配置检查；不再是开始科研的必经入口。 |

## 安装与入口

需要 DeepSeek Harness `>=0.2.0 <0.3.0`（当前按 DSH `0.2.2-rc.3` 的客户端服务接口与 Action Cards 组合构建）。插件目前通过本仓库分发，尚未发布到 npm/插件市场；从本地目录安装：

```bash
dsh plugin --profile web add "D:\path\to\dsh-science"
```

也可以在 DSH 的插件管理页面添加本地目录。安装后重启对应的 DSH 配置。

打开方式：直接在会话中对话即可——输入框上方出现"科研"技能条表示插件已加载。右侧栏的"研究状态"提供"查看全部项目"，只列出当前工作区的课题摘要；打开课题会切到它已绑定的根会话，不改绑当前会话。左侧栏的"科研工作台"按需打开。

## 首次使用

1. 新建会话，直接说"我想研究……"。没有项目时技能条显示轻量起始卡（开始探索 / 整理已有结果 / 连接现有项目）。写入研究问题、核心或结果都会创建项目；仅查看卡片、点技能或普通聊天不会制造空项目。
2. AI 在对话中调用科研工具（`sci_blueprint_set`、`sci_result_add` 等）把研究问题、Result、证据写入项目状态；卡片随持久状态更新。
3. 派发正式执行任务前，核心与全部目标 Result 的当前修订必须已确认（确认走 Action Card 或右栏确认按钮）；该闸门由服务端在派单前强制重算。
4. 普通成员（子代理）只能提交提案与任务回报；只有队长/root 能整合为论文语义。普通 fork 与父项目写时复制隔离。
5. 升级用户：旧版全局 JSON（blueprint.json 等）不会自动迁移。右侧栏与工具提供只读导入（`sci_blueprint_import_legacy`，支持预览）；原文件保留为只读备份，不删除、不双写。

## 数据与科学边界

- 项目状态保存在 `$DSH_HOME/dsh-science/science-state.sqlite`（Node 内置 SQLite，WAL + 外键 + 参数化语句）；每次写入同一事务推进修订、审计、幂等回执与变更通知。
- 确认绑定对象修订与内容哈希；无关对象的更新不会使另一张确认失效，目标对象语义变化后旧卡/旧按钮会被服务端拒绝（结构化 conflict）。
- 项目卡记录研究问题（question）、研究范围（scope）与来源摘要；阶段（explore/frame/execute/…）只是描述性上下文，不要求按固定步骤完成，正式派单只由 dispatch gate 校验显式 ResultIds 与确认状态。Result 不再有硬数量上限；超过 5 个给软提醒，工作台默认折叠长列表。
- 图件前检只检查可观察属性（格式、尺寸、分辨率、源数据、代码与人工终审记录）；不构成期刊接收保证。浏览器能否内嵌预览取决于实际加载结果，失败时有重试与打开原文件入口。
- 技能安装（角色扩展）每次都经宿主审批卡；技能只提供操作说明，运行依赖、模型权重、API 凭据和数据许可要另行确认。

## 配置与安全

可选配置文件：`$DSH_HOME/dsh-science/config.json`。

```json
{
  "falsificationThreshold": 2,
  "blockedGate": "warn"
}
```

数据库默认只读，写操作需要审批。SSH 凭据通过 DSH 凭据引用或环境变量读取，不写入科研工作区，也不进入项目状态。文件接口限制在允许的工作区内，并阻止路径穿越、凭据状态文件与项目状态库的直链下载。涉及未发表数据、患者信息或受许可约束的材料时，使用外部 API 前先确认数据边界。

## 项目文档

- [功能规格说明](docs/SPEC.md)（§24 起为对话优先架构）
- [开发日志](docs/DEVLOG.md)
- [科研团队协作示例](docs/recipes/agent-teams-science.md)

## 设计参考

- [dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams)：团队进度页面和角色会话入口。
- [dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)：队长分派与专业成员执行的分层方式。
- [AcademicForge](https://github.com/HughYau/AcademicForge) 和 [K-Dense scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills)：科研计算说明、工具档案和验证记录。
- [PaperSpine](https://github.com/WUBING2023/PaperSpine)、[ARS academic-research-skills](https://github.com/Imbad0202/academic-research-skills) 与 [nature-skills](https://github.com/Yuan1z0825/nature-skills)：论文证据组织、文献与写作技能设计参考。DSH 论文证据主干 v2 是本插件的独立实现，不是这些项目的分支或运行依赖。

## 许可证

本项目使用 [MIT 许可证](LICENSE)。第三方仓库、模型、模板和技能仍受各自许可证约束。
