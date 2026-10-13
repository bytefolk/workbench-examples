# 小云雀真实链路 POC

来源环境 2026-10-13 的交接状态：官方 CLI 1.0.38 已安装，预检未登录，无真实任务/成片。本仓库不随附 CLI；在运行机器单独安装和登录后再验证。接口结论见 `../docs/XIAOYUNQUE-API-RESEARCH.md`。

所有操作通过官方 CLI。运行数据和素材映射只保存到忽略目录 `poc/runs/`，不会进入源码包。不要在请求 JSON 或日志中保存密钥。

```sh
# 本项目已安装的 CLI；可用 XYQ_CLI_PATH 指定另一个已验证的绝对路径
node .local/xyq-cli/node_modules/@pippit-dev/cli/scripts/run.js status
node .local/xyq-cli/node_modules/@pippit-dev/cli/scripts/run.js login
node poc/xyq-poc.mjs preflight
```

首次安装（源码包不含 CLI）：

```sh
npm install --prefix .local/xyq-cli --ignore-scripts @pippit-dev/cli@1.0.38
node .local/xyq-cli/node_modules/@pippit-dev/cli/scripts/install-cli.js
```

复制 `request.example.json` 到 `poc/runs/current/request.json`，从实际账号模型目录填写 model，按当前模型配置选择支持的时长/画幅，并填写已授权的本地图片与 WAV/MP3 参考音频路径。示例 model 为 null，不能直接提交。真实上传与生成需要运行者另行授权并自行完成账号登录；收录本案例不代表获得真实生成授权。脚本不会增加二次生成或自动重试。

```sh
node poc/xyq-poc.mjs upload /path/to/authorized-test.png poc/runs/photo
# 使用上传返回的真实 asset_id；占位符不能直接执行
node poc/xyq-poc.mjs readback ACTUAL_ASSET_ID poc/runs/photo
node poc/xyq-poc.mjs generate poc/runs/current/request.json poc/runs/current
node poc/xyq-poc.mjs query poc/runs/current
```

`query` 为单次查询，完成时由官方 CLI 下载视频；未完成时保留同一 thread/run，再次查询。`completed=true`、退出码 0 或网页链接均不单独算成片取得；必须有非空的本地真实视频。当前格式校验覆盖 MP4/ISO 容器头与 SHA，不代替播放器、实际时长和质量验收。

照片/音频登记与普通 `generate-video` 是两个独立接口检查：后者会再次上传本地素材。POC 不把两者的成功伪装成“上传一次长期复用”。长期 ID 复用需通过已有引用/营销契约另做实测，原始音频的可上传也不等于声线克隆完成。

```sh
node --test poc/xyq-poc.test.mjs
```

8 项本地检查覆盖鉴权拦截、模型/输入、任务 ID、错误状态、非视频下载、未知提交禁止重放与凭据脱敏。这些是本地软件验证，不能代替真实小云雀调用。
