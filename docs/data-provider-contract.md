# 工作台数据提供方契约

工作台以业务模型组织页面，以三个独立端口访问外部服务。部署者选择数据库、身份系统和资产平台；Supabase 是一个可运行适配器，不是案例格式或业务模型的必需依赖。

当前参考实现为 [工厂运营工作台](../examples/mes/factory-operations/README.md)。准确的 TypeScript 类型以 [contracts.ts](../examples/mes/factory-operations/workbench/src/data/contracts.ts) 为准。此契约是该案例的 v1 接入约定，尚未承诺所有未来案例使用完全相同的业务实体。

## 三个端口

| 端口                   | 责任                                   | 关键操作                                                                                                                                                                           |
| ---------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IdentityProvider`     | 当前身份、登录注册、退出、身份变更通知 | `currentUser`、`signIn`、`signUp`、`signOut`、`onChange`                                                                                                                           |
| `OperationsRepository` | 工作区与成员、申领与时间线、销售拜访   | `listWorkspaces`、`createWorkspace`、`listMembers`、`addMember`、`listReports`、`createReport`、`transitionReport`、`confirmRecovery`、`listTimeline`、`listVisits`、`createVisit` |
| `AssetStore`           | 资产列表、文件上传、授权读取           | `list`、`upload`、`signedUrl`                                                                                                                                                      |

页面依赖 `DataServices`，不导入 Supabase 客户端或直接发出 SQL。三个端口可以分别实现和组合，例如企业身份服务 + MySQL 业务 API + 现有资产平台；组合时应由服务端统一识别用户 ID、工作区 ID 和授权语义。把三个对象拼在一起并不会自动建立不同服务间的信任或 token 交换。

内置配置工厂提供 Supabase 与 HTTP 两套完整组合。若需混合提供方，用 [data/index.ts](../examples/mes/factory-operations/workbench/src/data/index.ts) 的 `composeDataServices` 注入遵守这些端口的实现，或通过 `registerDataProvider` 注册新组合，并完成相同权限与失败测试。当前配置界面选择一套组合，不提供三套地址的任意拼接向导。

## 配置与状态

- `VITE_DATA_PROVIDER=supabase`：使用 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_PUBLISHABLE_KEY`。
- `VITE_DATA_PROVIDER=http`：使用 `VITE_API_BASE_URL`。
- 用户也可在连接设置中选择提供方，当前浏览器保存公开配置并覆盖部署默认；“使用部署默认配置”清除覆盖。
- 切换提供方后使用该服务的账号登录。切换配置不会复制、迁移或删除原服务中的数据。
- 数据库密码、管理员密钥、`service_role` 和 Secret key 不属于浏览器配置。MySQL 连接参数留在企业服务端。
- 配置成功只表示字段有效；只有通过实际认证、读写和授权文件访问检查，才能把具体部署记录为 `connected`。

## HTTP 接入 v1

参考客户端为 [http.ts](../examples/mes/factory-operations/workbench/src/data/http.ts)。`VITE_API_BASE_URL` 可带 `/api/workbench` 等前缀；下表路由附加在该地址之后。返回业务对象直接使用 `contracts.ts` 的 camelCase 字段，不再包一层 `data`。

| 方法与路径                      | 请求                                            | 成功响应                                   |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| `GET /session`                  | 无                                              | `UserIdentity`；未登录可返回 `null` 或 401 |
| `POST /auth/sign-in`            | `{ email, password }`                           | `UserIdentity`                             |
| `POST /auth/sign-up`            | `{ email, password }`                           | `{ user, needsEmailConfirmation }`         |
| `POST /auth/sign-out`           | 无                                              | 204                                        |
| `GET /workspaces`               | 无                                              | `Workspace[]`，仅当前用户所属工作区        |
| `POST /workspaces`              | `{ name }`                                      | `Workspace`，当前用户为所有者              |
| `GET /workspaces/:id/members`   | 无                                              | `WorkspaceMember[]`                        |
| `POST /workspaces/:id/members`  | 仅所有者操作，`{ email, role }`，不接受 `owner` | 204                                        |
| `GET /workspaces/:id/reports`   | 无                                              | `OperationReport[]`                        |
| `POST /workspaces/:id/reports`  | `ReportInput`                                   | `OperationReport`                          |
| `POST /reports/:id/transitions` | `TransitionInput`                               | 最新 `OperationReport`                     |
| `POST /reports/:id/recovery`    | `RecoveryInput`                                 | 最新 `OperationReport`                     |
| `GET /reports/:id/timeline`     | 无                                              | `TimelineEntry[]`                          |
| `GET /workspaces/:id/visits`    | 无                                              | `SalesVisit[]`                             |
| `POST /workspaces/:id/visits`   | `VisitInput`                                    | `SalesVisit`                               |
| `GET /workspaces/:id/assets`    | 无                                              | `AssetRef[]`                               |
| `POST /workspaces/:id/assets`   | `multipart/form-data`，文件字段名 `file`        | `AssetRef`                                 |
| `POST /assets/:id/download-url` | 无                                              | `{ url }`，短时授权地址                    |

客户端每次发送 `Accept: application/json`、`X-Requested-With: FactoryOperations` 和 `credentials: include`。JSON 请求设置 `Content-Type: application/json`；上传请求由浏览器生成 multipart boundary。身份服务需设置 HttpOnly 会话 Cookie，后端同时验证 Origin 与 CSRF 条件。跨域部署需明确允许前端 Origin 和 credentials，不得使用通配符 Origin 配合凭据。

错误返回非 2xx 状态与 `{ "message": "面向用户的错误说明" }`。401 表示未登录，403 表示无权限，409 表示版本冲突。不要返回 SQL、数据库连接串或内部异常堆栈。

## 服务端必须保证的行为

1. **授权**：身份由服务端会话确定，工作区成员与角色由可信数据读取；不能相信请求中的用户身份、工作区 ID 或前端按钮状态。只有所有者可添加成员；拜访由所有者/主管查看全工作区，销售只查看本人记录，操作员不可读取。
2. **业务状态机**：服务端校验允许的状态迁移、角色、备注、版本和断针回收条件。仅更新数据库状态字段不满足契约。
3. **并发和幂等**：状态操作带 `expectedVersion` 和 `requestId`，同时通过 `Idempotency-Key` 请求头传递请求 ID。对同一报告的状态、版本和事件做原子更新；重复请求不得追加重复事件。请求 ID 复用于不同内容时应拒绝。
4. **引用完整性**：附件必须存在、属于当前工作区并可由当前用户访问。报告不允许挂入其他租户的资产；断针至少关联一张 JPG、PNG 或 WebP 照片。
5. **资产**：文件正文进入受控资产存储；数据库保留稳定 ID、对象路径、类型、大小和时间。校验文件类型/大小，不把短时 URL 作为长期引用。
6. **输入和错误**：服务端再次校验输入；客户端校验只用于交互。失败不能写半条状态或返回虚假成功。

## MySQL 与现有资产平台

企业可用任意服务端技术实现上述 HTTP API。将 `OperationsRepository` 对应实体映射为 MySQL 表和事务，把 `AssetStore` 映射到现有资产平台，把 `IdentityProvider` 映射到账号或企业身份系统。浏览器不承担数据库连接池、SQL 执行或资产服务管理员身份。

当前仓库交付 HTTP 客户端与接口约定；不随附 MySQL 后端服务或企业资产平台服务器。部署者实现接口、联调并记录证据之前，MySQL 能力保持 `unavailable`。迁移到其他数据库还需设计数据导入、ID 映射和资产迁移；仅修改提供方配置不会完成迁移。

## 新提供方验收

使用合成数据检查登录与退出、工作区隔离、全部角色限制、真实写入与刷新回读、状态并发冲突、幂等重试、附件上传和越权拒绝。参考案例 [acceptance.md](../examples/mes/factory-operations/acceptance.md)。通过软件契约测试只说明接口调用符合预期；外部服务仍需自己的集成证据。
