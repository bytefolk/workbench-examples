# 台账交换空模板

状态：**proposal / 参考设计**。此目录只提供 [empty.json](empty.json) 和填写说明；没有合成样例，没有工厂业务记录，也没有已实现的导入按钮或后端。

`empty.json` 可以通过 [ledger-package.schema.json](../../schemas/ledger-package.schema.json) 的结构校验，但**不能直接提交到工作区或用来清空数据**：

- packageKind 为 template；datasetContract.id 为 unassigned，未绑定任何业务契约。
- dataRevision 和 exportScope 为 null；tables 是空对象，assets 是空清单。
- contentOrigin=user-imported、storage=local 仅是待填写包的声明位置，不证明已有工厂数据或本机数据源；填写时必须按实际来源设置。

准备正式包时，先由目标案例实现 dataset registry 契约，再复制模板并填写其 id/version，改为 snapshot，设置新 packageId、源数据 revision 和真实 exportedAt。填写 exportScope 的表范围与 full/partial 完整性，并按该契约填写表、字段、行来源与资产清单；不能凭通用 schema 自行猜测业务字段，partial 导出不能用于 replace。工厂身份由业务契约维护，不由显示名称或 metadata.label 决定。

每行使用 `{id, data, provenance}`。所有表名、枚举、数值单位、日期、跨表引用、流程与分析/行动记录均由注册契约校验。若输入曾来自模拟识别，人工确认后仍须保留 recognition.mode=mock。

替换范围由预览请求明确给出：漏掉范围内表会报错，显式空数组才表示清空该表；范围外数据保留。空 tables 不能暗示全量清库。JSON 中 assets 只是稳定引用与摘要，不含文件正文，跨存储迁移还要准备和验证实际文件。

完整提案、原子提交、幂等和验收要求见 [台账交换契约](../../docs/ledger-exchange.md)。正式导入还需目标身份、工作区、业务及资产服务，结构校验通过不代表这些能力存在。
