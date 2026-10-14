# 工作台案例规范 v2

本规范用于记录可复用的工作台案例。案例标识与本仓库 schemas 一起演进，不替代业务产品、平台或基础设施的接口契约。

## 分层与目录

案例按“服务模型 → 领域 → 案例”组织，目录为 `examples/<serviceModel>/<domain>/<case-id>/`。`serviceModel` 从 [服务模型字典](../catalog/service-models.json) 选择 `saas`、`paas` 或 `iaas`，`domain` 必须属于该服务模型下的 [领域字典](../catalog/domains.json)。一个案例只有一个主路径，跨领域使用 tags 发现，不复制案例。

服务模型描述工作台面向的目标能力：SaaS 业务应用、PaaS 开发与运行平台、IaaS 基础设施资源。这是案例库的分类维度，不表示仓库代码已作为托管服务交付。部署在本机、自托管或公共云，以及使用哪种数据库、身份系统和资产存储，均独立记录在 `integrations.md`。

例如工厂运营工作台归 `saas/mes/factory-operations`，销售拜访通过 `crm` 标签关联；使用 Supabase 后端不会将该业务工作台改归 PaaS。详细分类和边界见 [领域分类](domains.md)。没有真实案例的分类只保留字典条目，不创建空案例目录。

## 最小交付

每个案例至少包含：`case.json`、`README.md`、`requirements.md`、`workflows.md`、`data-model.md`、`integrations.md`、`acceptance.md`、`data/`、`evidence/verification.md`。有可运行原型时增加 `demo/` 或声明实际入口。

| 文件                     | 必须回答的问题                                                    |
| ------------------------ | ----------------------------------------------------------------- |
| README.md                | 谁使用，解决什么问题，当前能体验什么，如何运行与重置              |
| requirements.md          | 来源是什么，哪些事实已知，哪些是提议，MVP 范围与待确认问题        |
| workflows.md             | 每个角色如何开始、处理、交付；状态、失败、撤回和重试如何表现      |
| data-model.md            | 实体、关键字段、关系、业务约束、数据生命周期                      |
| integrations.md          | 依赖什么服务、配置和权限；当前是 mock、unavailable 还是 connected |
| acceptance.md            | 编号的 Given/When/Then 标准、检查方法、支持与未支持范围           |
| evidence/verification.md | 实际日期、命令或操作、结果、证据范围与限制                        |

原始客户对话应保留在经过授权的内部来源中；公开规格只保存已抽象的需求。没有看过截图、文档或听记，就不能声称已核实其内容。

## 元信息

`case.json` 的 `version` 为 `2`，按 `schemas/case.schema.json` 校验，包含稳定 id、中文标题、summary、serviceModel、主领域 domain、tags、status、来源、数据模式、交付物路径、运行声明与逐项能力声明。catalog 中的 id、标题、summary、serviceModel、domain、tags 和 status 必须与案例 manifest 完全一致；path 必须为 `examples/<serviceModel>/<domain>/<id>`。ID 全仓库唯一。

`deliverables` 与 `runtime.entry` 使用相对于案例目录的路径，必须落在该案例目录内。分类变更应同步移动目录、修改 catalog 和 manifest、修复文档链接与测试路径；npm workspace 目录约定为 `examples/*/*/*/workbench`。从 v1 迁移时为现有案例补充明确的 serviceModel，不根据所用云厂商自动推断。

能力 mode：

- `local`：本地代码已经处理的功能。
- `mock`：用合成数据和模拟行为演示，界面要标明。
- `unavailable`：规格中存在，当前没有执行能力。
- `connected`：已接入真实服务；要有环境、版本与检查证据。

`dataMode` 为 `synthetic`、`anonymized` 或 `mixed`；后两种必须补充数据来源与发布范围说明。

## 交付状态与证据

| 状态       | 达到该状态的条件                                         |
| ---------- | -------------------------------------------------------- |
| proposal   | 业务问题和目标用户已写清楚；尚未完成详细规格             |
| specified  | 必需文档、数据模型和验收条件完整；未知项已列出           |
| prototype  | 演示入口可运行，核心流程已检查，mock 与真实功能可辨别    |
| integrated | 核心流程所需外部服务已接入，权限、失败与数据回读均有记录 |
| verified   | 在声明环境下完成全部已承诺验收，有人工确认和可追溯证据   |

状态可以回退。没有客户确认时，不把规格定稿写成客户验收；没有生成模型时，不把任务记录写成已生成视频。纯离线原型的最高状态是 prototype。

## 演示与验证

- 运行步骤从干净检出开始，明确依赖、启动 URL、外部调用与重置方法。
- 演示数据可重复加载，使用虚构人物、商品与素材，不依赖私人账号。
- 验收覆盖主流程、空结果、失败状态和关键业务约束。实现了高影响行为才增加针对性自动验证。
- 原型在业务页面直接显示用户需要知道的运行限制，不把内部架构术语塞进业务流程。
- `npm run check` 校验 schemas、索引、路径、分类、数据和业务约束。它不能证明模型质量、SaaS 权限、媒体授权的法律充分性或客户接受程度。
