# dsh-science-plugin｜对话优先科研工作台

`dsh-science-plugin` 是 DeepSeek Harness（DSH）的科研插件。它把研究问题、可核验结果、团队任务和图件组织成**按项目隔离的结构化状态**，并把这些状态投影到原生对话输入框、会话轮次和右侧栏的卡片上。你继续用自然语言做科研，插件负责记住论文主线、守住确认闸门、把团队与产物整理成可核对的状态。

界面中的"研究结果（Result）""主张（Claim）"和"证据（Evidence）"是插件数据结构的固定名称：研究结果由可检验主张和证据支持。确认操作绑定当前修订；内容修改后需要重新确认。

## 工作方式

| 入口 | 用途 |
|---|---|
| 对话输入框上方的"科研"技能条 | 显示当前项目、阶段与待确认计数；提供开始探索、整理已有结果、查文献、绘图、写作、汇报等按钮——点击把技能引用与引导语填入原生输入框（不自动发送），由你补充后发送。 |
| 会话轮次中的状态卡 | AI 调用科研工具后，本轮改变了哪些对象、从哪个工具来、是否待确认，都在回答下方折叠展示。 |
| 确认卡片（Action Card） | 核心结论与 Result 的确认经 DSH 原生 Action Card 发起：默认同时加载 `@deepseek-ai/dsh-action-cards`（服务端 proposal/decision）与 `@deepseek-ai/dsh-client-ui-action-cards`（对话回答下方的卡片渲染），版本与当前 DSH 运行时精确一致。确认同时绑定项目 revision、对象 revision 与对象内容哈希（`expectedHash`）；目标对象被修改后旧卡失效，无关对象更新不会让卡片无故失效；退回只记录 decision，不修改论文语义。 |
| 右侧栏"研究状态" | 卡片作战室：待你处理（未确认/受阻）→ 论文主线 → 正在工作 → 成果 → 常用技能。成果只显示当前项目已登记的关键图件摘要，不列出全局文件或审查。 |
| 左侧栏"科研工作台" | 从项目首页配置专家，查看论文主线、团队进展和图表成果。 |

## 项目专家

从科研工作台首页选择 **配置项目专家**。新项目从空名单开始，可以单独添加角色，也可以采用文献调研、数据分析或论文写作方案。选择方案只会加入角色。队长派工或显式启动团队时才会使用子代理。

- **引用全局 Skill** 会列出当前 DSH 可供模型使用的技能。选择后，该专家在此项目内按需使用已有安装。
- **安装项目 Skill** 接受 GitHub 或 GitLab 的仓库首页链接。文件只安装到当前项目对应专家的目录。已有旧版共享角色技能可以在对应专家下显式关联。
- **关联 DSH 插件** 接受 npm 包或仓库链接。项目保存这条关联，安装与启用请在 DSH 官方插件管理器中完成，作用范围为当前宿主配置。

移出专家会停止向其派发新工作。已完成的任务、已启动成员的记录及该专家的扩展配置会保留，重新加入后可继续使用。

## 安装与入口

科研工作台支持 DSH 0.2.2（从 rc.3 起）和 0.2.3（从 alpha.2 起）。0.14.3 已在 rc.3、rc.5 和 alpha.2 的独立 DSH Web 配置中安装验证，覆盖项目专家方案、项目总览、科研主张确认、回执和重复点击。rc.3、rc.5 使用工具确认卡，alpha.2 复用宿主内置确认卡。已安装 0.14.0 的用户也可以用下面的命令升级。

**推荐使用 DSH 自带的插件管理器。** 在桌面版或 Web 版打开 **插件 → 添加插件**，输入 `dsh-science-plugin@0.14.3`，点击 **安装 → 立即启用**。[DSH 官方插件管理器说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/packages/client/ui-plugin-manager/README.zh.md)

**命令行安装。** 在使用 DSH Web 的机器上运行下面一条命令，再重启正在运行的 `dsh web`。如果使用自建的配置，将 `web` 换成对应的 profile 名称。[DSH 官方插件发布与安装说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/docs/user/develop/basic/publish.zh.md)

```bash
dsh plugin --profile web add dsh-science-plugin@0.14.3
```

**从 GitHub 安装。** 可以安装对应版本的源码，或从 [v0.14.3 发布页](https://github.com/SPYfighting/dsh-science-plugin/releases/tag/v0.14.3) 下载 `dsh-science-plugin-0.14.3.tgz` 后在下载目录安装。两种方式任选一种。

```bash
# 发布标签
dsh plugin --profile web add git+https://github.com/SPYfighting/dsh-science-plugin.git#v0.14.3

# 已下载的发布包
dsh plugin --profile web add ./dsh-science-plugin-0.14.3.tgz
```

**在 DSH「发现」中浏览。** 在 **插件 → 实验性插件** 启用 **自定义插件索引**。打开 **发现 → 添加索引源**，粘贴下面的地址，再搜索“科研工作台”并安装。[DSH 官方索引指南](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.5/docs/user/guide/plugin-market.zh.md)

```text
https://raw.githubusercontent.com/SPYfighting/dsh-science-plugin/master/index.json
```

**确认启用。** 打开会话后，输入框上方会出现“科研”技能条。左侧的“科研工作台”可查看论文主线、团队进展和图件。右侧“研究状态”中的“查看全部项目”列出当前工作区的课题，点击课题可回到对应的根会话。

### 连接 SSH 计算服务器

首次连接或从旧版升级后，先向服务器管理员索取对应主机密钥的 SHA-256 指纹。也可在已经验明身份的服务器控制台查看，例如运行 `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256`，复制以 `SHA256:` 开头的值。请使用服务器实际提供的主机密钥类型。

通过 `sci_ssh_profiles add` 保存主机、端口、用户、原有认证设置和 `profile.hostFingerprint`，核对 DSH 审批框中的主机和指纹后确认。也可在已有配置 `$DSH_HOME/dsh-science/ssh-profiles.json` 的相应主机条目补上 `hostFingerprint`。旧配置缺少指纹时无法连接；服务器换钥后，先通过同一可信渠道核对新指纹，再更新配置。

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

- [功能规格说明](https://github.com/SPYfighting/dsh-science-plugin/blob/v0.14.3/docs/SPEC.md)（§24 起为对话优先架构）
- [开发日志](https://github.com/SPYfighting/dsh-science-plugin/blob/v0.14.3/docs/DEVLOG.md)
- [科研团队协作示例](docs/recipes/agent-teams-science.md)

## 设计参考

- [dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams)：团队进度页面和角色会话入口。
- [dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)：队长分派与专业成员执行的分层方式。
- [AcademicForge](https://github.com/HughYau/AcademicForge) 和 [K-Dense scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills)：科研计算说明、工具档案和验证记录。
- [PaperSpine](https://github.com/WUBING2023/PaperSpine)、[ARS academic-research-skills](https://github.com/Imbad0202/academic-research-skills) 与 [nature-skills](https://github.com/Yuan1z0825/nature-skills)：论文证据组织、文献与写作技能设计参考。DSH 论文证据主干 v2 是本插件的独立实现，不是这些项目的分支或运行依赖。

## 许可证

本项目使用 [MIT 许可证](LICENSE)。第三方仓库、模型、模板和技能仍受各自许可证约束。
