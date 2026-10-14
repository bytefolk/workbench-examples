# 工厂运营工作台

面向工厂现场员工、主管和销售，把断针与耗材申领、审批配送、断针回收、销售拜访和附件追溯放在一个工作台中。业务记录从配置的数据服务真实读取；未连接时显示配置或登录入口，不填入虚构的“已保存”记录。

当前状态为 **integrated**：React 工作台已在专用 QA 项目连接真实 Supabase 认证、数据库和私有资产存储，完成申领、回收、拜访及权限验证。标准数据端口与企业 HTTP 适配器可供其他部署复用；具体覆盖与限制见 [验证记录](evidence/verification.md)。MySQL 后端、AI 总结、语音识别和钉钉通知尚未接入，客户正式验收尚未完成。

## 页面与角色

- **概览**：当前工作区申领和拜访概况。
- **工厂申领**：合同号、物料编号、工位和原因追溯，现场附件，审批、拒绝、配送、回收确认与完结。
- **销售拜访**：客户、拜访时间、沟通纪要、问题、下一步和跟进日期。
- **资产资料**：工作区文件列表、上传与授权预览。
- **工作区设置**：工作区成员和数据连接；所有者可添加已注册且确认邮箱的成员。

所有者和主管处理申领；操作员上报；销售记录拜访。工作区成员权限由服务端执行，界面按角色显示可用操作。所有者额外负责添加成员。

## 从干净检出运行

需要 Node.js 22.12 或更新版本。在仓库根目录执行：

```bash
npm ci
npm run check
npm run factory:dev
```

打开 <http://127.0.0.1:4318>。也可执行 `npm run demo`，打开 <http://127.0.0.1:4173>，在 MES 分类选择本案例。统一目录使用构建后的 `workbench/dist/index.html`。

工作区位于 Windows `\\wsl.localhost\...` 路径时，在 WSL 中执行 npm 命令。Windows npm 默认脚本 shell 不支持 UNC 工作目录。

## 选择数据提供方

每个部署可选择自己的数据服务，用户也可在连接设置中为当前浏览器覆盖默认配置。Supabase 是本次参考实现之一。配置界面接受项目公开地址与公开客户端密钥，或企业 HTTP API 地址；不接受数据库连接串。

可选用工作台目录下的 `.env.local` 设置构建默认值：

```dotenv
VITE_DATA_PROVIDER=supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Supabase 部署先执行 [迁移目录](supabase/migrations/) 中的数据库迁移，并在所选项目配置邮箱认证及应用地址；之后通过工作台注册、确认邮件（如要求）并登录。首次登录创建工作区，再用合成输入验证真实写入与附件上传。迁移和认证配置详情见 [集成说明](integrations.md)。

接入 MySQL 或企业资产平台时使用：

```dotenv
VITE_DATA_PROVIDER=http
VITE_API_BASE_URL=https://your-platform.example/api/workbench
```

企业服务端需实现 [标准 HTTP 契约](../../../docs/data-provider-contract.md)，负责身份、工作区授权、数据库事务和资产访问。仓库已经提供 HTTP 客户端；不会因选择该选项自动创建 MySQL 服务。

身份、业务数据、资产分别通过 `IdentityProvider`、`OperationsRepository`、`AssetStore` 端口接入，也可由部署者组合不同实现。配置和提供方选择不进入业务字段，切换配置不会自动迁移数据。

## 首次体验与重置

1. 连接所选服务并登录，创建一个用于验证的工作区。
2. 使用 [合成输入](data/fixtures.json) 创建断针或耗材申领。断针必须先上传至少一张 JPG、PNG 或 WebP 照片；仓库不附带真实现场照片。
3. 主管或所有者批准、开始配送；断针确认碎片回收后再完结，检查操作时间线。
4. 创建一条销售拜访，刷新页面确认业务记录和资产均能读回。

数据保存在所选服务，刷新不会重置。应用不提供清空云端数据按钮；测试时使用独立工作区，清理和备份由部署管理员在服务端执行。“使用部署默认配置”只删除当前浏览器的连接覆盖，不删除业务数据。

## 规格与限制

详见 [需求](requirements.md)、[流程](workflows.md)、[数据模型](data-model.md)、[集成](integrations.md)、[验收](acceptance.md) 和 [验证记录](evidence/verification.md)。公开夹具均为合成输入；实际服务为空时显示空状态。当前没有离线写入队列、跨服务数据迁移、库存扣减或正式客户验收。
