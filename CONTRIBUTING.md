# 新增与维护案例

1. 先阅读 [分类边界](docs/domains.md)，在 [服务模型字典](catalog/service-models.json) 选择 SaaS、PaaS 或 IaaS，再在其所属的 [领域字典](catalog/domains.json) 中选择主领域。分类依据目标能力和主要管理对象，数据库或部署厂商不决定分类。已有领域优先，新领域需补定义与边界。
2. 复制 `templates/case/` 到 `examples/<serviceModel>/<domain>/<case-id>/`，例如 `examples/saas/mes/factory-operations/`，替换所有 `REPLACE_*` 占位符。没有实际案例时只维护字典，不创建空案例目录。
3. 填写需求、角色、流程、数据模型、集成与验收。将讨论中的原话事实、设计建议和待确认内容分别标明。
4. 在版本 2 的 `case.json` 中声明 `serviceModel`、主领域、真实交付状态、数据来源与能力模式，在 `catalog/cases.json` 增加一致的 ID、标题、summary、serviceModel、domain、状态和标签。路径必须与分类一致；跨领域发现使用 tags，不重复拷贝案例。
5. 有原型时提供运行命令、数据重置方法与演示路径；可运行工作台放在 `examples/<serviceModel>/<domain>/<case-id>/workbench/`。通过 `npm run demo` 的统一首页 <http://127.0.0.1:4173> 验证案例可被发现并打开。提供外部服务时声明配置、权限、失败状态与接入证据。
6. 执行 `npm ci && npm run check`。手工走验收流程；把命令、结果、日期和限制写进 `evidence/verification.md`。
7. 提交变更。PR 使用英文说明业务问题、最终行为与验证证据；标题使用 Conventional Commits，例如 `feat(dam): add character material workbench prototype`。

贡献者可以采用不同前端栈与数据提供方；只有真正跨案例稳定复用的代码才提取为共享模块。服务模型分类不等于托管交付承诺。模板不会自动安装 Agent、创建云服务租户或绑定真实客户账号；一个归 SaaS 的工作台也可以由部署者自托管。
