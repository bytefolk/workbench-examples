# ByteFolk Workbench Examples

按 **SaaS / PaaS / IaaS → 领域 → 案例** 组织的工作台案例库。从业务应用、开发平台和基础设施管理需求出发，沉淀可以演示、验证和复用的工作台。

## 从这里开始

- [分层分类](docs/domains.md)：SaaS 的 CRM、ERP、MES 等 22 个领域，PaaS 的应用平台、数据库等 8 个领域，IaaS 的计算、存储等 5 个领域。
- [目录验证记录](docs/evidence/catalog-taxonomy.md)：分层迁移、筛选导航、手机界面和回归检查。
- [服务模型字典](catalog/service-models.json)与[领域字典](catalog/domains.json)：统一首页使用的机器可读分类。
- [案例目录](catalog/cases.json)：机器可读索引，目前包含两个案例。
- [本色 Persona Studio · 企业数字人工作台](examples/saas/dam/character-material-library/README.md)：SaaS / DAM 案例，含六页工作台、业务规格、合成数据与制作审核闭环。
- [工厂运营工作台](examples/saas/mes/factory-operations/README.md)：SaaS / MES 案例，通过 CRM 标签关联销售拜访；含断针/耗材申领、审批配送、回收及真实数据服务。
- [数据提供方契约](docs/data-provider-contract.md)：身份、业务和资产三个独立端口；部署者可选择 Supabase 或实现企业 HTTP API 接入 MySQL 与资产平台。
- [案例规范](docs/case-standard.md)：目录、元信息、交付状态与验收要求。
- [新增案例](CONTRIBUTING.md)：从模板开始，提交前执行检查。

```bash
npm ci
npm run check
npm run demo
```

打开统一首页 <http://127.0.0.1:4173>，先选择 SaaS、PaaS 或 IaaS，再选择领域和具体案例。`npm run demo` 先构建工作台再提供目录服务。没有已收录案例的分类显示空状态，不会跳转到占位应用。

Persona Studio 使用合成数据演示素材与模拟视频制作。工厂运营工作台需要配置数据服务并登录，业务记录与附件保存到所选服务。开发某个案例时使用该案例 README 的命令；仓库入口始终是上面的统一首页。

服务模型分类标记工作台面向的应用、平台或基础设施层，不表示这些代码模板已经是托管 SaaS。部署方式与数据提供方独立选择：工厂工作台使用 Supabase 仍归 SaaS / MES；企业也可通过标准 HTTP 后端连接 MySQL 和现有资产平台。

需要 Node.js 22.12 或更新版本。Windows 若使用 `\\wsl.localhost\...` 工作目录，请在 WSL 中执行 npm 命令；Windows npm 的默认脚本 shell 不支持 UNC 工作目录。

## 目录结构

```text
catalog/                     # 服务模型、领域字典与案例索引
docs/                        # 分类规则、案例规范、架构与推进方式
schemas/                     # 本仓库的案例、分类和索引 JSON Schema
templates/case/              # 新案例模板（不算已交付案例）
examples/<serviceModel>/<domain>/<case>/
  case.json                  # 标识、状态、入口、能力与接入声明
  README.md                  # 场景说明与运行入口
  requirements.md            # 已知需求、MVP 建议、待确认问题
  workflows.md               # 角色、步骤、状态与异常
  data-model.md              # 业务实体、关系与约束
  integrations.md            # 外部能力、接口与接入状态
  acceptance.md              # 验收条件与检查方法
  data/                      # 合成演示数据及其 schema
  demo/                      # 简版或静态演示
  workbench/                 # 完整工作台源码（npm workspace，可选）
  evidence/                  # 实际检查记录与限制
scripts/                     # 索引校验与本地演示服务
tests/                       # 业务边界与仓库检查的验证
```

## 案例状态

`proposal → specified → prototype → integrated → verified`。状态表示已有证据覆盖的最高阶段，详细定义见[案例规范](docs/case-standard.md)。Persona Studio 为 **prototype**：素材管理与任务编排可以演示，视频生成、真人形象数字人和产品试戴尚未接入。工厂运营工作台为 **integrated**：Supabase 认证、数据库和私有资产存储已在专用 QA 项目完成真实闭环验证；企业 HTTP 客户端本地可用，MySQL 后端尚未接入。具体覆盖见各案例证据记录，二者均未完成客户正式验收。

没有案例的领域仅列在分类字典中；不会用空目录或占位页面表示已有产品。

## 与 ByteFolk 其他仓库的关系

| 仓库                                                                                   | 在本案例库中的用途                                                                 |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [design-system](https://github.com/bytefolk/design-system)                             | 正式工作台可复用的设计令牌、组件与应用框架；当前案例保留交接工作台的原有组件与设计 |
| [digital-employee](https://github.com/bytefolk/digital-employee)                       | 需要数字员工执行任务时采用的包契约与运行能力；每个案例单独声明接入                 |
| [digital-employee-quickstart](https://github.com/bytefolk/digital-employee-quickstart) | 数字员工包和组织示例，保持其现有格式；本仓库存放面向业务用户的工作台场景           |
| [roleweave](https://github.com/bytefolk/roleweave)                                     | 有岗位协作需求的案例可接入的桌面工作区；不是所有工作台的必需运行环境               |

`case.json` 与 `catalog/` 是本仓库的案例资产格式，不是这些产品的新 API。案例中的数字人指媒体生成的真人或虚拟形象；数字员工指处理任务的 Agent，两者各自声明能力与依赖。

## 名称与发布范围

仓库名使用 **workbench-examples**，SaaS、PaaS、IaaS 是一级分类，CRM、ERP、MES、数据库平台、计算资源等是各自下属领域。范围覆盖业务应用、平台工具和基础设施工作台，也支持本地与自托管部署。

代码和文档采用 Apache-2.0。公开内容只包含抽象需求和合成数据；案例要收录真实客户内容时，先完成其来源、发布范围和授权核对，不提交凭据或私人聊天记录。
