# 案例复用资产

本库把可复用设计与实际实现分开组织：**标准主干 → 场景变体 → 实际案例**。标准主干保存共通业务结构，场景变体描述差异，案例保存实现、集成和证据。这里的“标准”指仓库内部统一格式，不代表行业认证或外部标准。

当前有 **22 个标准主干、44 个场景变体、3 个参考实现、0 个项目案例**。主干和变体都是参考设计，不能加总为“已运行案例”“客户项目”或“已交付工作台”。参考实现确有代码和各自的验证记录，但并不因此成为客户项目交付证明。

## 三种复用资产

| 层次               | 回答的问题                               | 保留的内容                                     | 运行与来源声明                                         |
| ------------------ | ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| 标准主干 blueprint | 这一业务领域的共通工作方式是什么？       | 角色、实体、主流程、页面、扩展点               | 参考设计，无运行状态                                   |
| 场景变体 variant   | 行业或业务情境具体改变了什么？           | 适用行业、字段与约束、角色权限、流程或集成差异 | 参考设计，无客户交付声明                               |
| 实际案例 case      | 哪部分已经实现，如何运行，验证到了哪里？ | 代码、规格、数据、集成、运行声明、验收与证据   | 使用 caseKind、status、source 和 capabilities 分别表达 |

分类与复用是两个维度：`serviceModel → groupId → domain` 决定目录中的位置；`blueprintId → variantId → case` 决定设计与实现之间的关系。一个主干属于一个服务模型和领域，一个变体属于一个主干，一个案例选择一个主干和变体。案例的领域与服务模型必须与主干一致，变体也必须属于该主干。

实际案例继续使用 `examples/<serviceModel>/<domain>/<case-id>/`。不为主干或变体创建空的 `examples/` 目录，也不为了多个标签复制实现。跨领域协同通过 tags、流程说明和集成契约表达。

## 机器可读约定

| 数据                                                | 当前版本 | 关键字段                                                                                           |
| --------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| [domain-groups.json](../catalog/domain-groups.json) | 1        | groups 中每项包含 id、serviceModel、title、summary                                                 |
| [domains.json](../catalog/domains.json)             | 3        | domains 中每项增加 groupId，与所属组的 serviceModel 一致                                           |
| [blueprints.json](../catalog/blueprints.json)       | 1        | id、serviceModel、domain、title、summary、roles、entities、workflow、pages、extensionPoints        |
| [variants.json](../catalog/variants.json)           | 1        | id、blueprintId、title、summary、industries、adaptations                                           |
| [cases.json](../catalog/cases.json) 与 case.json    | 3        | 在分类与状态之外声明 caseKind、blueprintId、variantId；manifest 用 evidence 引用本案例内的证据文件 |

所有业务数组必须有具体内容，不能用“待补充”“通用流程”凑数。`workflow` 按操作顺序描述业务步骤；`adaptations` 应至少说明可观察的字段、状态、权限、规则或集成差异，而非只把标题换成一个行业名。ID 保持稳定，文案改进不应破坏已有案例关联。

这些 JSON 是结构化设计资料。`adaptations` 目前是差异说明，不是可执行配置补丁；关联主干不会自动生成代码、数据库、权限或页面，也不会自动同步已有案例。改变主干业务语义时，应检查所有关联变体与案例，说明哪些差异需要进入实现。

## 从主干落到实现

1. 先根据主要业务对象选择领域，按 [分类边界](domains.md) 判断是否已有合适主干。
2. 复用主干的共通角色、实体、流程和页面，记录哪些内容不在本次范围内。
3. 选择或新增有实质差异的场景变体。行业名称是辅助标签，不能替代差异设计。
4. 在实际案例文档中把差异展开成字段约束、状态转换、权限矩阵、失败处理与验收条件。
5. 实现必要代码和适配器，提供可复现的运行方式，再记录实际验证结果。
6. 同步 manifest、catalog、能力声明和证据；设计覆盖率、代码完成度、外部集成与客户确认分别说明。

同一主干允许多个变体和多个案例，但案例实现范围可以只是主干的一个明确子流程。没有实现的能力要写入不支持范围；不要因继承一个广义 MES、ERP 或 CRM 主干就宣称拥有完整产品能力。分类数量也不要求每个领域立即拥有主干或案例：本轮 60 个 SaaS 领域中只有 22 个已写主干，其余保留分类边界，后续按真实需求补充。

共通扩展点应面向业务契约，例如身份、仓库、支付、资产和通知。具体部署采用的数据库、登录方式和资产平台在案例的 integrations.md 中决定。当前工厂案例通过 IdentityProvider、OperationsRepository、AssetStore 分离身份、业务和资产，并提供组合和替换入口；可复用约定见 [数据提供方契约](data-provider-contract.md)。这个实现经验不表示其他主干已经具备同样的代码或集成。

## 三个已有案例如何复用

| 案例                                                                        | 关联关系                                                                           | 已有实现与设计边界                                                                                                                                       |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Persona Studio](../examples/saas/dam/character-material-library/README.md) | dam-content-assets → digital-human-content-production → character-material-library | 参考实现、prototype；人物素材与制作审核闭环可运行，生成相关能力保留模拟声明。主干中的企业资产平台和真实生成扩展点不能据此标记 connected。                |
| [MUSE 缪思](../examples/saas/dam/brand-digital-human-studio/README.md)      | dam-content-assets → digital-human-content-production → brand-digital-human-studio | 参考实现、prototype；合成品牌素材、候选确认、模拟制作与审核可运行。真实模型适配只有软件测试，未验证账号、质量或客户交付。                                |
| [工厂运营工作台](../examples/saas/mes/factory-operations/README.md)         | mes-production-operations → garment-workshop-consumables → factory-operations      | 参考实现、integrated；已实现车间耗材与断针上报、审批配送、回收闭环和销售拜访扩展，并有真实数据服务验证。没有完整生产排程、报工、库存扣减或客户验收声明。 |

工厂变体要求断针完成前确认回收；装配工位变体要求序列号、合格数量和工序交接。这是业务差异，不应通过复制同一页面再改标题表示。数字人变体关注人物授权和制作任务，品牌素材库变体关注品牌、区域、渠道与授权到期；两者可共用资产版本、审核和引用关系设计。

## 主干覆盖清单

下列全部是参考设计。每个主干具有两个差异变体，具体角色、实体、流程、页面与扩展点保存在 JSON 中；上表三个参考实现关联到其中两个主干与变体组合。

| 主干 ID                           | 标题                   | 领域        | 两个场景变体                                   |
| --------------------------------- | ---------------------- | ----------- | ---------------------------------------------- |
| `crm-sales-pipeline`              | 客户与商机推进         | `crm`       | 工业客户拜访与长周期商机；专业服务项目商机     |
| `service-request-resolution`      | 客户请求与服务闭环     | `service`   | 企业产品技术支持；零售交易售后                 |
| `marketing-campaign-delivery`     | 活动策划与内容交付     | `marketing` | 企业展会营销；消费品牌新品传播                 |
| `commerce-store-operations`       | 店铺交易与售后运营     | `commerce`  | 连锁门店运营；企业客户订货门户                 |
| `finance-settlement-control`      | 应收应付与结算协同     | `finance`   | 经销回款与账龄；采购应付与付款计划             |
| `hrm-employee-lifecycle`          | 员工入转调离           | `hrm`       | 办公员工入职与调动；多工厂员工入转调离         |
| `lms-training-compliance`         | 培训分配与考核         | `lms`       | 岗位安全培训与复训；客户产品培训               |
| `scm-supply-exception-control`    | 供需协同与交付异常     | `scm`       | 订单驱动制造供需协调；季节性零售供应协同       |
| `srm-supplier-qualification`      | 供应商准入与绩效       | `srm`       | 关键物料供应商准入；外包服务商管理             |
| `wms-warehouse-execution`         | 仓内收发与盘点         | `wms`       | 批次效期仓储；设备备件仓储                     |
| `tms-shipment-dispatch`           | 运输调度与签收结算     | `tms`       | 区域门店配送；跨境货运协同                     |
| `mes-production-operations`       | 生产现场执行与追溯     | `mes`       | 服装车间断针与耗材申领；装配工位报工与异常追踪 |
| `plm-engineering-change`          | 产品基线与工程变更     | `plm`       | 装备设计变更；消费品新品开发                   |
| `qms-quality-corrective-action`   | 检验与质量纠正闭环     | `qms`       | 来料检验与供应商整改；制程质量异常与围堵       |
| `eam-maintenance-work-orders`     | 设备保养与维修工单     | `eam`       | 工厂设备维修与预防保养；分布式站点设备维护     |
| `dam-content-assets`              | 数字内容资产与审核复用 | `dam`       | 企业数字人内容制作；多品牌营销素材库           |
| `cms-knowledge-publishing`        | 内容审核与知识发布     | `cms`       | 内部服务知识库；产品文档与多版本发布           |
| `oa-office-requests`              | 行政申请与审批履约     | `oa`        | 办公用品申请与领取；访客与会议接待             |
| `projects-delivery-coordination`  | 项目任务与交付协作     | `projects`  | 软件版本交付；客户实施交付                     |
| `erp-order-resource-coordination` | 订单到资源的跨部门协同 | `erp`       | 贸易分销订单协同；项目型制造资源协同           |
| `itsm-service-restoration`        | IT 请求与事件处置      | `itsm`      | 员工 IT 服务台；生产系统事件与变更             |
| `analytics-business-review`       | 经营指标与异常复盘     | `analytics` | 销售经营复盘；工厂经营与执行分析               |

## 来源、案例性质与证据

`caseKind` 与 `status` 表达不同事实：

- `reference-implementation`：为解释或验证设计而构建的实现，可以有真实集成；不能自动称为已交付客户项目。
- `project-case`：来自具体项目实践的案例，需要在案例中交代来源，并用非空 evidence 指向可访问的项目实施或验证记录。公开内容仍须使用抽象或授权披露的资料。
- `status`：继续使用 proposal、specified、prototype、integrated、verified 表达交付成熟度。是否客户确认另看 `source.customerConfirmed`，不能用 integrated 代替验收。
- `capabilities[].mode`：逐项区分 local、mock、unavailable、connected。目录设计中的扩展点、第三方宣传能力和本地模拟行为都不构成真实连接证据。

官方产品资料只用于核对常见业务能力与分类边界。它们不证明本库使用了厂商产品，也不证明某个客户提出或确认了这些设计。官方来源及核对范围集中记录在 [领域分类](domains.md#依据与来源范围)；主干与变体的中文流程由本库综合编写，不复制厂商案例，也不使用真实客户名称包装参考设计。

来自实际讨论的需求只能发布已抽象的业务内容。私人听记链接、逐字稿、真实账号、项目标识、访问凭证和签名文件地址不得进入目录数据。样例数据使用合成内容；真实集成验证只发布环境类型、操作步骤、结果和必要的去标识证据。

完整新增与成熟度要求见 [案例规范](case-standard.md)。关系、数据结构与路径由 `npm run validate` 检查；交互行为、真实后端权限和持久化仍需要各案例自己的检查与证据。通过分类校验不等于业务流程已实现。
