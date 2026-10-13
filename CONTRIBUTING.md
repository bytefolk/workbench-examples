# 新增与维护案例

1. 在 [领域字典](catalog/domains.json) 中选择一个主领域；已有领域优先，新领域要补定义与示例。
2. 复制 `templates/case/` 到 `examples/<domain>/<case-id>/`，替换所有 `REPLACE_*` 占位符。
3. 填写需求、角色、流程、数据模型、集成与验收。将讨论中的原话事实、设计建议和待确认内容分别标明。
4. 在 `case.json` 中声明真实交付状态、数据来源与能力模式，在 `catalog/cases.json` 增加同一 ID、路径、领域、状态和标签。
5. 有原型时提供运行命令、数据重置方法与演示路径；提供外部服务时声明配置、权限、失败状态与接入证据。
6. 执行 `npm ci && npm run check`。手工走验收流程；把命令、结果、日期和限制写进 `evidence/verification.md`。
7. 提交变更。PR 使用英文说明业务问题、最终行为与验证证据；标题使用 Conventional Commits，例如 `feat(dam): add character material workbench prototype`。

贡献者可以采用不同前端栈；只有真正跨案例稳定复用的代码才提取为共享模块。模板不会自动安装 Agent、创建 SaaS 租户或绑定真实客户账号。
