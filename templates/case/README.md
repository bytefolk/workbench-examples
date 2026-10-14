# REPLACE_TITLE

类型：参考实现（reference-implementation）。状态：proposal。目标用户：REPLACE_ROLE。

业务问题与价值：REPLACE_PROBLEM。

## 复用关系

- 服务模型 / 分类族 / 领域：REPLACE_SERVICE_MODEL / REPLACE_GROUP_ID / REPLACE_DOMAIN。
- 标准主干：REPLACE_BLUEPRINT_ID。说明沿用的角色、实体、流程和页面。
- 场景变体：REPLACE_VARIANT_ID。说明该行业或业务场景的适配点。
- 本实现：REPLACE_CASE_ID。列出与主干、变体相比新增或未覆盖的范围。

主干及变体从 catalog/blueprints.json、catalog/variants.json 选择；它们是设计资产，不要求有应用目录。新实现独立放在 examples/<serviceModel>/<domain>/<case-id>/，并同步 catalog/cases.json。

## 实现与验证边界

运行步骤、入口、依赖与重置：当前无演示程序，交付原型时补充。逐项区分本地实现、模拟、未接入和已连接能力。

caseKind 与交付状态独立：参考实现可以连接真实服务；project-case 表示有实际项目实施证据，不能仅凭需求记录或参考设计改为项目案例。要标为 project-case，先整理真实且可公开的脱敏证据文件，再在 case.json 的 evidence 中列出标题和案例内相对路径。没有客户验收时不得标为 verified。

参见 requirements.md、workflows.md、data-model.md、integrations.md、acceptance.md 和 evidence/verification.md。
