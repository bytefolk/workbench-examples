# 数据模型

业务类型见 [contracts.ts](workbench/src/data/contracts.ts)，提供方映射和 HTTP 约定见 [数据提供方契约](../../../../docs/data-provider-contract.md)。基础端口将 ID 视为不透明字符串；本案例的 `factory-operations` v1 交换注册契约进一步要求 UUID，以匹配现有业务记录。其他提供方若使用不同 ID，需显式映射并声明兼容契约，不能自动改写历史引用。

| 实体              | 关键字段                                                                                                                | 关系与用途                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `UserIdentity`    | `id`、`email`                                                                                                           | 身份服务返回的当前用户；密码不进入业务数据         |
| `Workspace`       | `id`、`name`、`role`、`createdAt`                                                                                       | 数据隔离单位；`role` 是当前用户在此工作区的角色    |
| `WorkspaceMember` | `userId`、`email`、`role`                                                                                               | 用户与工作区的成员关系；所有者、主管、操作员、销售 |
| `OperationReport` | `id`、`workspaceId`、`kind`、`contractNumber`、`materialNumber`、`station`、`reason`、`quantity`、`status`              | 断针或耗材申领及处理状态                           |
| 报告版本与留痕    | `createdBy`、`createdAt`、`updatedAt`、`version`、`fragmentsRecovered`                                                  | 创建人、状态并发控制、断针回收条件                 |
| `TimelineEntry`   | `id`、`reportId`、`actorId`、`action`、`note`、`createdAt`                                                              | 与报告关联的操作事件                               |
| `SalesVisit`      | `id`、`workspaceId`、`createdBy`、`customer`、`visitedAt`、`summary`、`issues`、`nextStep`、`followUpDate`、`createdAt` | 销售拜访与跟进记录                                 |
| `AssetRef`        | `id`、`workspaceId`、`name`、`mediaType`、`size`、`storagePath`、`createdAt`                                            | 资产元数据，文件正文保存在资产存储                 |

报告输入通过 `assetIds` 关联资产；回读时带 `assets` 元信息列表。下载地址在预览时取得，不属于永久字段。合同、物料和客户当前为录入文本，尚未连接 ERP 或客户主数据字典。

## 业务约束

- 工作区、成员、报告、拜访与资产按工作区授权；授权来自服务端成员关系，不能由浏览器自报。
- `kind` 为 `broken_needle` 或 `consumable`。`status` 为 `submitted`、`approved`、`delivering`、`completed` 或 `rejected`。
- 合同号、物料编号与工位不超过 120 字，原因不超过 2000 字；数量为 1 到 100000 的整数。
- 单据最多关联 10 个不同附件，附件必须属于同一工作区；断针至少一张 JPG、PNG 或 WebP 照片，耗材可不关联。资产允许 JPG、PNG、WebP、PDF、MP4、MP3，大小大于 0 且不超过 20 MB。
- 状态命令包含 `expectedVersion`、操作 `note` 和 `requestId`。服务端校验版本后原子写入新状态和事件；旧版本不能覆盖新版本。
- 断针只有完成回收确认后才可进入 `completed`；状态和回收标记由服务端受控命令修改。
- 拜访的客户名称、沟通纪要、下一步为必填，问题可以为空，跟进日期可以为 `null`。拜访时间使用可解析的时间戳；跟进日期使用 `YYYY-MM-DD`。所有者与主管读取全工作区拜访，销售只读取本人记录，操作员不可读取。

## 生命周期

新建记录写入所选提供方，刷新和再次登录从该服务读取。切换提供方不会迁移旧数据。普通单据页面不提供删除、撤回或自动归档；所有者可通过完整校验和确认的整包替换恢复同工作区业务表。部署管理员仍应制定文件备份、保留与清理策略。

上传文件与创建业务记录是两个步骤。上传成功、单据提交失败时可能留下未关联资产；资产列表仍可查看。生产部署需要按业务政策补充未关联资产巡检与清理，不能仅因客户端失败就删除可能已被引用的对象。

## 合成数据

[data/fixtures.json](data/fixtures.json) 是公开的表单输入与验收场景，不是生产数据库转储。它没有真实用户、已上传文件、服务地址、认证凭据或签名 URL。当前不在登录后自动注入；创建工作区后可手工使用其中字段验证流程。

## `factory-operations` v1 交换注册契约

类型见 [exchange-contracts.ts](workbench/src/data/exchange-contracts.ts)，业务校验见 [exchange.ts](workbench/src/domain/exchange.ts)。包结构遵守 [通用交换契约](../../../../docs/ledger-exchange.md)，具体表与字段如下；未知字段拒绝，不静默删除或转成默认值。

| 表              | 每行 `data` 字段                                                                                                                                  | 核心约束                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `factory`       | `name`                                                                                                                                            | 恰好一行，行 ID 等于目标工作区；必须在包与替换范围中                                                                 |
| `reports`       | `kind, contractNumber, materialNumber, station, reason, quantity, assetIds, createdBy, createdAt, updatedAt, status, version, fragmentsRecovered` | 数量严格整数；断针有照片，完结有回收；状态/版本可由完整事件链重建                                                    |
| `report-events` | `reportId, actorId, action, note, createdAt, requestId, payload`                                                                                  | 初始 submitted 的 requestId/payload 为 null；其他 payload 为 `{version, action, note}`，请求 ID 唯一且与流程版本一致 |
| `visits`        | `customer, visitedAt, summary, issues, nextStep, followUpDate, createdBy, createdAt`                                                              | 合法含时区时间戳、真实日历日期或 null；保留客户纪要与下一步                                                          |

每行另外有 UUID `id` 和 `provenance`。来源包括 `contentOrigin` 及可选的 `{mode, reviewStatus, sourceAssetIds}` 识别记录。已有同 ID 业务行不能通过导入改写来源、识别模式或原图引用；mock 经人工确认后仍为 mock/synthetic。包的来源汇总只统计业务行，不计工厂档案。当前模型没有独立分析/行动表，拜访问题与下一步随 `visits` 保存；未知 ERP 台账不接受。

资产清单记录 `id/name/mediaType/size/sha256/reference`。允许是当前工作区已登记资产的子集；包内每项元信息、摘要与稳定引用必须匹配，传入业务行所用附件或识别原图必须在包清单中声明。候选库保留当前全部资产，范围外保留行按当前资产清单验证；备份后新增无关资产不会阻止恢复，也不会被删除。不能传入未登记文件、其他工作区路径或短时 URL；资产正文仍由 AssetStore 保存。原资产缺少摘要时需由可信服务补齐真实字节摘要，不得猜测。业务行、事件操作者与资产 ID 必须保持合法引用。

目标工作区有独立数据 `revision`；正常写入与整包发布均推进版本，预览固定目标版本。候选库按“范围外旧表 + 范围内新表”校验，提交结果与新版本一次发布。当前界面采用四表范围，内部契约也允许包含 factory 的显式子范围；缺表与 `[]` 的含义不同。成员关系与文件不属于替换范围。

导入上限为 5 MiB JSON、40 层嵌套、每表 10000 行、10000 个资产。数量、日期和 UUID 不自动转换；合同与物料编号是字符串，前导零保留。导出包最大范围仍受上限限制，不能把被截断列表称为完整快照。
