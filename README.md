# ByteFolk Workbench Examples

面向 SaaS 与行业业务场景的工作台案例库。从业务需求出发，沉淀可以演示、验证和复用的工作台。

## 从这里开始

- [场景分类](docs/domains.md)：CRM、ERP、MES、DAM 等 16 个业务领域。
- [案例目录](catalog/cases.json)：机器可读索引，目前包含一个案例。
- [本色 Persona Studio · 企业数字人工作台](examples/dam/character-material-library/README.md)：首个 DAM 案例，含六页工作台、业务规格、合成数据与制作审核闭环。
- [案例规范](docs/case-standard.md)：目录、元信息、交付状态与验收要求。
- [新增案例](CONTRIBUTING.md)：从模板开始，提交前执行检查。

```bash
npm ci
npm run check
npm run demo
```

打开 <http://127.0.0.1:4173>。目录入口可按领域筛选；首个案例可管理人物与素材、解析需求、模拟视频任务、人工审核和归档溯源。`npm run demo` 先构建工作台再提供统一目录服务，全部使用合成数据，不连接外部 SaaS 或生成模型。

需要 Node.js 22.12 或更新版本。Windows 若使用 `\\wsl.localhost\...` 工作目录，请在 WSL 中执行 npm 命令；Windows npm 的默认脚本 shell 不支持 UNC 工作目录。

## 目录结构

```text
catalog/                     # 领域字典与案例索引
docs/                        # 分类规则、案例规范、架构与推进方式
schemas/                     # 本仓库的案例、分类和索引 JSON Schema
templates/case/              # 新案例模板（不算已交付案例）
examples/<domain>/<case>/
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

`proposal → specified → prototype → integrated → verified`。状态表示已有证据覆盖的最高阶段，详细定义见[案例规范](docs/case-standard.md)。首个案例为 **prototype**：素材管理与任务编排可以演示，视频生成、真人形象数字人和产品试戴尚未接入。

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

仓库名使用 **workbench-examples**，SaaS 是描述和分类标签。范围也覆盖制造、内容制作和可自托管工作台。

代码和文档采用 Apache-2.0。公开内容只包含抽象需求和合成数据；案例要收录真实客户内容时，先完成其来源、发布范围和授权核对，不提交凭据或私人聊天记录。
