# 新增与维护案例

1. 阅读 [分类边界](docs/domains.md)、[资产模型](docs/case-assets.md)和[案例规范](docs/case-standard.md)。先选择服务模型、业务族与主领域，按目标能力分类；云厂商和数据库不决定分类。
2. 查找 [标准主干](catalog/blueprints.json) 与 [场景变体](catalog/variants.json)。沿用已有 ID，新增时写清稳定角色、业务对象、流程、页面、扩展点，以及变体相对主干的差异。只有分类或设计时维护目录 JSON，不创建空案例。
3. 有具体实现材料后，复制 `templates/case/` 到 `examples/<serviceModel>/<domain>/<case-id>/`，替换全部 `REPLACE_*` 占位符。一个实现只保留一个目录。
4. 填写需求、流程、数据模型、接入与验收；区分来源事实、设计建议和待确认内容。案例 README 说明继承的主干、采用的变体、实际覆盖和复用限制。
5. 在版本 3 的 `case.json` 中声明 `blueprintId`、`variantId`、`caseKind`、来源、状态、证据和能力模式，在 `catalog/cases.json` 增加一致的索引。变体必须属于主干，主干必须属于案例领域。
6. 参考实现使用 `reference-implementation`；真实项目使用 `project-case` 并提供可公开、脱敏的项目证据文件。纯研究、需求转述或技术测试不应包装成客户交付。项目来源与成熟度独立，`verified` 仍需对应验收证据和确认。
7. 有原型时提供运行命令、重置方法和入口；工作台源码可放在 `workbench/`。通过 `npm run demo` 的统一首页 <http://127.0.0.1:4173> 验证能找到主干、变体及实现。外部服务要声明配置、权限和失败处理。
8. 执行 `npm ci && npm run check`；交互变化执行 `npm run test:e2e` 并实际浏览。把命令、结果、日期和限制写进相关验证记录。
9. PR 使用英文说明业务问题、最终行为与验证证据；标题使用 Conventional Commits，例如 `feat(dam): add content production reference implementation`。

只有真正跨案例稳定复用的代码才提取为共享模块；不同案例可以使用不同前端栈和数据提供方。标准主干先约定业务语义，不强制同一套数据库或账号。

公开提交只保留获准的抽象需求、合成数据和脱敏证据，不提交私人聊天、客户身份、凭据或带签名的素材链接。
