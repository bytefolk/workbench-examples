# 数据模型

业务类型见 [contracts.ts](workbench/src/data/contracts.ts)，提供方映射和 HTTP 约定见 [数据提供方契约](../../../../docs/data-provider-contract.md)。所有 ID 视为不透明字符串；业务代码不假设某个数据库厂商的格式。

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

新建记录写入所选提供方，刷新和再次登录从该服务读取。切换提供方不会迁移旧数据。应用不提供删除、撤回、恢复、自动归档或清空业务数据按钮；部署管理员应在实际服务中制定备份、保留与清理策略。

上传文件与创建业务记录是两个步骤。上传成功、单据提交失败时可能留下未关联资产；资产列表仍可查看。生产部署需要按业务政策补充未关联资产巡检与清理，不能仅因客户端失败就删除可能已被引用的对象。

## 合成数据

[data/fixtures.json](data/fixtures.json) 是公开的表单输入与验收场景，不是生产数据库转储。它没有真实用户、已上传文件、服务地址、认证凭据或签名 URL。当前不在登录后自动注入；创建工作区后可手工使用其中字段验证流程。
