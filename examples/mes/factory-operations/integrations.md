# 集成与部署

所有业务页面使用 [标准端口](../../../docs/data-provider-contract.md)。本案例可以采用 Supabase，或由企业通过 HTTP 接入 MySQL、现有资产平台与身份服务。每个部署独立选择；端口也可以分别实现后组合，业务代码不绑定数据库产品。

## 交付状态

| 能力                             | 模式          | 当前说明                                                      |
| -------------------------------- | ------------- | ------------------------------------------------------------- |
| React 工作台、表单和角色交互     | `local`       | 本地应用代码；服务端仍需再次授权和校验                        |
| 三个端口与提供方配置             | `local`       | 身份、业务、资产独立契约；支持部署默认与当前浏览器覆盖        |
| Supabase 适配器与迁移            | `connected`   | 三个迁移已应用于专用 QA 项目，真实 SDK 适配器通过云端闭环验证 |
| Supabase 云端登录、数据库、文件  | `connected`   | 真实登录、工作区隔离、数据库回读、私有文件字节回读已验证      |
| 企业 HTTP 客户端                 | `local`       | 标准路由和对象的契约测试通过，企业后端服务未部署              |
| MySQL 或企业资产平台后端         | `unavailable` | 企业需实现 HTTP API；没有浏览器直连或预置服务                 |
| 钉钉通知、AI 总结、语音/图片识别 | `unavailable` | 本次没有服务接入和执行结果                                    |

`connected` 属于经过验证的部署状态。本次 Supabase 连接证据见 [验证记录](evidence/verification.md)；换用其他项目或提供方时仍需独立联调。项目创建成功或填写地址不等于业务已经可用。

## Supabase 组合

依赖：Supabase Auth、Postgres 数据库与 Storage，客户端通过锁定版本的 `@supabase/supabase-js` 访问。所用包版本见 [package.json](workbench/package.json) 与根锁文件。

部署步骤：

1. 部署者在自己选择的组织中创建或使用独立项目。
2. 应用 [supabase/migrations/](supabase/migrations/) 中的迁移。迁移定义业务表、成员授权、受控业务命令与私有资产访问。具体表和函数名称以 SQL 为准。
3. 配置邮箱登录/注册策略，以及实际应用访问地址；若启用邮箱确认，用户完成邮件确认后才能登录。
4. 在工作台连接设置或 `.env.local` 中配置项目 URL 和 publishable key。兼容的 `anon` key 只作公开客户端密钥使用；管理员密钥不进入前端。
5. 登录、创建工作区、上传合成测试文件、写入申领与拜访，完成跨用户和跨工作区拒绝检查，再记录连接状态。

业务记录写入数据库，文件正文进入私有对象存储；报告保留资产 ID，预览时取得授权地址。SQL 的权限规则和状态命令负责阻止跨工作区访问、无权审批及未回收断针完结，前端角色显示不能替代它们。

项目创建、运行费用、备份、邮件可达性及运维由部署者管理。仓库不包含真实项目地址、私钥、测试用户密码或已签名文件 URL。

## 复用云端验证

[cloud-smoke.mjs](workbench/scripts/cloud-smoke.mjs) 调用真实 Supabase 适配器，验证两个独立账号的登录、工作区隔离、私有文件字节回读、断针回收约束、状态幂等与版本冲突、拜访写入、成员权限及退出重登后的持久化。脚本会在所选项目中创建合成测试工作区、文件和业务记录，并把第二个测试账号加入该工作区。

准备两个已确认邮箱的专用测试账号，在仓库外保存本地 JSON 文件，结构如下。字段值由部署者填写，不要提交该文件：

```json
{
  "url": "https://your-project.supabase.co",
  "key": "your-publishable-key",
  "owner": {
    "email": "owner@example.test",
    "password": "test-account-password"
  },
  "outsider": {
    "email": "outsider@example.test",
    "password": "another-test-account-password"
  }
}
```

在 Linux/WSL 中，从仓库根目录运行：

```bash
FACTORY_SMOKE_CONFIG=/absolute/path/outside-repository/factory-smoke.json node examples/mes/factory-operations/workbench/scripts/cloud-smoke.mjs
```

检查命令退出状态、逐项 `PASS` 与本机忽略目录 `workbench/.local/cloud-smoke-result.json`。该结果可能只覆盖失败前已通过的项目，不能只因文件存在就判断全部通过。脚本不自动删除测试业务数据；部署管理员可根据结果中的 ID 清理。不要把账号文件或包含账号 ID 的原始结果作为公开证据提交；公开验证记录仅保存覆盖范围和通过情况。

## 企业 HTTP 组合

设置 `VITE_DATA_PROVIDER=http` 和 `VITE_API_BASE_URL`，或在连接设置中选“自有数据平台”。所有路由、输入、响应、Cookie 会话、CSRF、版本及请求幂等约定见 [数据提供方契约](../../../docs/data-provider-contract.md)。

后端应实现与 Supabase 组合相同的业务语义：可信身份、工作区隔离、角色权限、原子状态推进和资产授权。MySQL 连接池和凭据放在后端；现有资产平台通过稳定 ID 与受控下载 URL 接入。HTTP 客户端不会把一个任意 URL 自动转换为可用平台，也不会自动部署数据库。

## 配置、故障和恢复

缺少配置时展示连接说明。认证失败、网络错误、权限不足和版本冲突显示错误；不会偷偷退回本地模拟数据。切换连接需要使用目标服务的账号，目标服务没有记录时显示空状态。

浏览器保存的是提供方选择、公开地址和公开客户端密钥。回到部署默认配置不会删除远端数据。服务迁移、备份恢复、资产清理和账号生命周期由部署管理员执行，本案例不提供自动搬迁或清库操作。
