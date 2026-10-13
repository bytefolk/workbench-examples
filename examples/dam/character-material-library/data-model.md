# 数据模型

## Persona Studio 主模型

| 实体                               | 主要职责                                                 |
| ---------------------------------- | -------------------------------------------------------- |
| Character / CharacterVersion       | 人物档案、当前版本、不可变素材和使用范围快照             |
| Asset                              | 图片、视频、音频、声线、动作、表情、脚本与授权文件元数据 |
| GenerationRequest / GenerationTask | 原始需求、解析配置、人物版本、素材快照、渠道、状态与事件 |
| GenerationResult / Review          | 静态占位结果、任务来源、审核意见与决定                   |
| Provider / AuditLog                | 渠道模式、配置状态、Mock 费率和操作记录                  |

准确字段见 [types.ts](workbench/src/domain/types.ts)，初始合成数据见 [seed.ts](workbench/src/domain/seed.ts)。初始为 3 个人物、3 个渠道、6 个任务、4 个占位结果，模拟进度推进后数量可以增长。使用范围和素材记录为演示数据，不代表真实媒体的授权。

浏览器保存版本 1 的业务状态，存储键 `bytefolk-character-material-library-v1`。历史任务保留原人物版本及素材快照，复制新任务时重新验证当前人物与权限。

## 素材管理简版合成模型（仅 demo/）

| 实体      | 关键字段                                                                    | 约束                                                           |
| --------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Character | id、name、description、rights                                               | 唯一 ID；rights 包含 status 和 allowedUsages                   |
| Asset     | id、name、type、characterId、emotion、version、status、rights、tags、source | 人物素材关联真实存在的 fixture 人物；产品素材 characterId=null |
| MockJob   | id、kind、status、createdAt、character、inputs、usage、prompt、output       | 输入复制 ID、名称与版本；output 永远为 null                    |

rights.status：`approved`、`pending`、`restricted`。allowedUsages：`internal-demo`、`marketing`。这些值由合成 fixture 明示，用于验证流程，不代表任何真人或媒体的实际授权。

Asset.type：`image`、`video`、`product`；emotion：`neutral`、`happy`、`angry`、`sad`、`joyful`、null；素材 status：`active`、`archived`。人物概览只统计 active 的关联 video 素材。

两个虚构人物、六项人物素材和两项产品素材，共八项素材。周宁与关联素材均为 pending；至少一个素材用途仅 internal-demo，用于演示限制分支。

数据按 `data/fixtures.schema.json` 校验；仓库校验另外检查 ID 唯一与人物引用，测试覆盖用途、状态与输入快照。

## 接入后扩展

- AssetVersion：不可变媒体版本、格式、大小、校验和、存储引用、时长与分辨率。
- UsageGrant：授权凭据内部引用、主体、用途、期限、地区、审核、撤销记录。
- GenerationJob / Attempt：服务类型、模型版本、输入快照、配置、请求 ID、状态、错误、重试与成本。
- GeneratedOutput：生成媒体、来源任务、审核状态、质量指标与使用范围。
- AuditEvent：入库、修改、使用、归档、任务与授权变更的操作记录。

真实凭据和临时签名媒体 URL 留在服务端，不纳入案例 fixture。期限与撤销等规则需根据已确认业务要求实现。
