# 台账交换空模板

状态：**通用格式参考**。此目录只提供 [empty.json](empty.json) 和填写说明，没有合成样例或工厂业务记录。工厂案例另有同工作区交换实现，具体运行与验证范围见 [案例说明](../../examples/saas/mes/factory-operations/README.md)；不能据此把本空模板当作可执行导入包。

`empty.json` 可以通过 [ledger-package.schema.json](../../schemas/ledger-package.schema.json) 的结构校验，但**不能直接提交到工作区或用来清空数据**：

- packageKind 为 template；datasetContract.id 为 unassigned，未绑定任何业务契约。
- dataRevision 和 exportScope 为 null；tables 是空对象，assets 是空清单。
- contentOrigin=user-imported、storage=local 仅是待填写包的声明位置，不证明已有工厂数据或本机数据源；填写时必须按实际来源设置。

准备正式包时，先由目标案例实现 dataset registry 契约，再复制模板并填写其 id/version，改为 snapshot，设置新 packageId、源数据 revision 和真实 exportedAt。填写 exportScope 的表范围与 full/partial 完整性，并按该契约填写表、字段、行来源与资产清单；不能凭通用 schema 自行猜测业务字段，partial 导出不能用于 replace。工厂身份由业务契约维护，不由显示名称或 metadata.label 决定。

每行使用 `{id, data, provenance}`。所有表名、枚举、数值单位、日期、跨表引用、流程与分析/行动记录均由注册契约校验。若输入曾来自模拟识别，人工确认后仍须保留 recognition.mode=mock。

替换范围由预览请求明确给出：漏掉范围内表会报错，显式空数组才表示清空该表；范围外数据保留。空 tables 不能暗示全量清库。JSON 中 assets 只是稳定引用与摘要，不含文件正文，跨存储迁移还要准备和验证实际文件。

完整契约、原子提交、幂等和验收要求见 [台账交换契约](../../docs/ledger-exchange.md)。正式导入还需目标身份、工作区、业务及资产服务，结构校验通过不代表这些能力存在。

工厂案例使用 `factory-operations` v1。先在“数据接入”下载当前工作区快照作为填写基准，再查阅 [四表字段、事件和资产要求](../../examples/saas/mes/factory-operations/data-model.md)；必须保留工作区身份、完整事件链、已存在的历史操作者及传入业务行引用的资产声明。包内资产逐项匹配当前已登记资产，恢复不会删除备份之后新增的无关资产。空工作区需要新增记录时优先使用已有表单，拍照入口可提供明确标注的合成草稿编辑流程；模板不会替使用者猜测真实业务值。
