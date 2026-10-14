# ByteFolk Workbench Examples

工作台案例资产库：按 **SaaS / PaaS / IaaS → 业务领域 → 标准主干 → 场景变体 → 案例实现** 沉淀可复用方案。先找业务场景，再看标准流程与差异，最后复用已有实现和验证材料。

## 从这里开始

- [分类目录](docs/domains.md)：SaaS 的 60 个领域，按 10 个业务族组织；保留 PaaS 8 类和 IaaS 5 类。
- [案例资产模型](docs/case-assets.md)：22 个标准主干、44 个场景变体，以及从项目差异回收共性的方式。
- [案例索引](catalog/cases.json)：目前两个参考实现，尚无按项目证据收录的实际项目案例。
- [本色 Persona Studio](examples/saas/dam/character-material-library/README.md)：DAM 内容资产主干 → 数字人内容制作变体 → 素材管理与模拟制作审核实现。
- [工厂运营工作台](examples/saas/mes/factory-operations/README.md)：MES 生产运营主干 → 服装车间耗材变体 → 申领、审批配送、回收与销售拜访实现。
- [案例规范](docs/case-standard.md)与[贡献指南](CONTRIBUTING.md)：关联、来源、运行、证据与维护要求。
- [目录验证记录](docs/evidence/catalog-assets.md)：本次资产关系、浏览交互与回归检查。

```bash
npm ci
npm run check
npm run demo
```

打开统一首页 <http://127.0.0.1:4173>，按业务族、领域、行业与关键词查找主干、变体和实现，查看它们的关系与材料。目录浏览无需登录或数据库。主干和变体是参考设计，数量与可运行实现、实际项目分别统计。

Persona Studio 使用合成数据演示素材与模拟视频制作。工厂运营工作台保留已实现的数据服务接入，运行该案例时按其 README 配置。账号系统不属于当前目录建设的重点。

需要 Node.js 22.12 或更新版本。Windows 若使用 `\\wsl.localhost\...` 工作目录，请在 WSL 中执行 npm 命令。

## 三种可复用资产

| 资产     | 保存的内容                                   | 当前收录                   |
| -------- | -------------------------------------------- | -------------------------- |
| 标准主干 | 稳定角色、业务对象、流程、页面与扩展点       | 22 个参考设计              |
| 场景变体 | 行业和使用情境，以及相对主干需要改变的内容   | 44 个参考设计              |
| 案例实现 | 代码、运行入口、业务规格、接入情况与验证证据 | 2 个参考实现；0 个项目案例 |

例如，新车间项目可以先定位 MES 主干，再找到适合的场景变体，复用已有工厂实现的适用部分。共性进入主干，行业差异留在变体，具体项目的交付与证据留在案例里。不会因为新增分类或参考设计就增加实际案例数量。

目录中的 `caseKind` 表示参考实现或项目案例；`status` 表示实现成熟度，两者独立。Persona Studio 为 `prototype`，工厂运营为 `integrated`；现有材料支持原型和技术接入验证，不作为已交付客户项目展示。

## 目录结构

```text
catalog/
  service-models.json         # SaaS / PaaS / IaaS
  domain-groups.json          # 业务族
  domains.json                # 领域及所属业务族
  blueprints.json             # 标准主干
  variants.json               # 场景变体及其主干
  cases.json                  # 实现索引及主干、变体关联
docs/                        # 分类、资产模型、规范与验证记录
schemas/                     # JSON Schema
templates/case/              # 新案例模板，不计入案例
examples/<serviceModel>/<domain>/<case>/
  case.json                  # 关联、来源、状态、运行与能力
  README.md                  # 适用场景、复用边界与运行说明
  requirements.md            # 事实、需求与待确认事项
  workflows.md               # 角色、流程、状态与异常
  data-model.md              # 实体、关系与约束
  integrations.md            # 数据提供方、配置与能力状态
  acceptance.md              # 验收条件与检查方法
  data/                      # 合成数据及 schema
  demo/                      # 简版或静态演示（可选）
  workbench/                 # 工作台源码（可选 npm workspace）
  evidence/                  # 实际检查与可公开的项目证据
scripts/                     # 关系、路径、数据校验与目录服务
tests/                       # 仓库和业务规则验证
```

业务主干通过 ID 与变体、案例关联。案例代码继续保留一个稳定目录，跨领域用标签检索，不为每个变体复制工作台。

## 部署与数据独立选择

分类按工作台解决的问题确定，与云厂商、数据库或部署方式无关。SaaS 下的工作台模板可以在本地或企业环境运行；分类不代表已经提供托管 SaaS 服务。

[数据提供方契约](docs/data-provider-contract.md)保留身份、业务和资产三个独立端口。工厂实现支持 Supabase 组合和标准 HTTP 客户端；使用 MySQL 或企业资产平台的部署者可以实现对应后端。主干、变体和案例关联不绑定 Supabase，也不要求统一账号方案。

## 与 ByteFolk 其他仓库的关系

| 仓库                                                                                   | 在本案例库中的用途                                   |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [design-system](https://github.com/bytefolk/design-system)                             | 可复用设计令牌、组件与应用框架，案例记录实际采用情况 |
| [digital-employee](https://github.com/bytefolk/digital-employee)                       | 需要 Agent 执行任务时引用的包契约与运行能力          |
| [digital-employee-quickstart](https://github.com/bytefolk/digital-employee-quickstart) | 数字员工包和组织示例                                 |
| [roleweave](https://github.com/bytefolk/roleweave)                                     | 有岗位协作需求时可接入的桌面工作区                   |

机器可读资产为后续检索、知识库与技能编写提供材料；本仓库不自动创建或发布技能。数字人指媒体中的真人或虚拟形象，数字员工指处理任务的 Agent，各自声明能力与依赖。

代码和文档采用 Apache-2.0。公开内容仅保留抽象需求、合成数据和可公开证据；不提交私人聊天、客户身份或凭据。
