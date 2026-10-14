# MUSE 工作台源码

从仓库根目录执行 `npm ci`，然后 `npm run dev --workspace muse-digital-studio`。开发入口为 http://127.0.0.1:4318 ，代理为 127.0.0.1:8788，默认不调用付费服务。

根目录 `npm run demo` 的 4173 案例入口始终只运行免费模拟，无代理依赖。配置、真实调用步骤、演示与重置方法见 [案例说明](../README.md)。

独立预览需要两个终端：`npm run api --workspace muse-digital-studio` 与 `npm run preview --workspace muse-digital-studio`；提前构建工作台。 `.env` 放在本工作台目录，禁止使用 `VITE_` 密钥或提交运行状态。

`npm test --workspace muse-digital-studio` 使用模拟供应商响应验证参数、安全边界和状态，不证明真实账号、扣费或生成质量。
