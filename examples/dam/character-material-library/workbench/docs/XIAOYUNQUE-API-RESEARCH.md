# 小云雀：人物照片与声线复用接口核查

核查日期：2026-10-13。官方 CLI 本机安装版本：1.0.38。用户确认账号/API 权限尚未核实；CLI 实际返回 `logged_in=false`。未提交真实生成任务，未取得成片。

## 当前判断

**有接入路径，但“人物照片与真人声线上传一次、长期跨任务复用”尚未完成验证。** 需要分别验收：素材能够保存、同账号能回读、不同任务能引用、保留期限明确、生成结果保持形象与声音一致。协议字段存在只能证明客户端能表达引用。

| 核查项           | 已确认事实                                                             | 未确认部分                                                                   |
| ---------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 人物照片输入     | 官方 CLI 接收本地图片并上传为平台素材 ID                               | 真人图审核/认证要求、实际账号准入                                            |
| 音频输入         | 同一生成命令接收 WAV/MP3 音频作为参考素材                              | 能否稳定复现同一人的声线、音色跨任务一致性                                   |
| 角色存档         | 已安装 CLI 的画布 Schema 有主图、参考音频、`voiceId`、`voiceType` 字段 | 写入、刷新、跨画布/项目复用的实际行为                                        |
| 旧素材 ID 引用   | 营销请求接受 `asset_ids`，画布可引用已有草稿中的媒体 ID                | 后续任务可用性、保留期、团队范围                                             |
| 视频直出帮助入口 | `generate-video` 接受本地文件路径                                      | 没有复用已上传 ID 的同名生成参数；源码显示逐次上传，不能声称上传一次永久复用 |
| 克隆声线         | 角色 Schema 可以保存声音描述、音频引用和已有 Voice ID                  | 没查到官方 CLI 的真人声线创建/克隆/训练命令及 Voice ID 生命周期契约          |
| 企业共享         | 已查 CLI 原生画布为个人空间；营销 Schema 未公开团队切换字段            | 企业成员共享、跨账号权限和资产归属                                           |

## 接口与证据

1. [小云雀官网 CLI 入口](https://xyq.jianying.com/cli)指向官方 `@pippit-dev/cli` 安装与文档。CLI 支持浏览器授权，凭据由系统安全存储管理。安装检查不等于账号权限验收。
2. [官方生视频命令](https://github.com/Pippit-dev/cli/blob/main/skills/xyq-nest-skill/commands/generate-video.md)说明图片/视频/音频参考输入，模型与参数以账号真实发现结果为准。
3. [官方生视频源码](https://github.com/Pippit-dev/cli/blob/main/internal/generate_video/generate_video.go)逐个上传图片、视频、音频，再将返回 ID 放入 `video_part_tool_param.images/videos/audios`。它支持素材引用结构，但当前命令本身不避免重复上传。
4. [官方上传源码](https://github.com/Pippit-dev/cli/blob/main/internal/common/upload_file.go)返回真实 `asset_id`，来源为 `pippit_asset_id`；未提供素材保留期输出。保留期未知，不能当作永久有效。短剧任务查询的 12 小时过期和模型目录的 5 分钟缓存，均不能作为素材 ID 或声线的保留期限。
5. [官方 Canvas 说明](https://github.com/Pippit-dev/cli/blob/main/skills/xyq-nest-skill/commands/canvas.md)与本机离线 Schema：`xyq.role.updateAppearance.patch.mainImage.pippitAssetId`、`voiceAudio.pippitAssetId`，以及 `voice.voiceId/voiceType`。这些为角色文档字段，不证明已能创建克隆声线。
6. [官方营销契约](https://github.com/Pippit-dev/cli/blob/main/skills/xyq-marketing-skill/references/api.md)有上传、提交、查询和积分接口，支持传入已有素材 ID；个人登录身份和服务端授权决定访问范围。
7. [火山公开短剧素材接口](https://docs.volcengine.com/docs/JimengAI/Xiaoyunque-shortdramaAgent-imagegeneration-interfacedocumentation?lang=zh)的入参主要是剧本分析返回的资产/会话 ID，音色返回结构主要是描述；文档说明生成失败的素材无法以外部图片补入。该接口不能直接作为外部人物照片和克隆声线入口的证据。

火山「剧创」产品的团队人像库与音色配置属于另一套产品资料，不能据此断言小云雀当前客户账号或上述 API 已具备相同能力。

## 先跑一条真实链路

已经准备 `poc/xyq-poc.mjs`，通过官方 CLI 调用，不从前端持有密钥。真实输出保存在被忽略的 `poc/runs/` 中；同一运行目录保留提交意图，结果未知时禁止自动再提交。

1. 完成当前小云雀网页授权；实际 `status.logged_in=true` 后，读取账号模型列表和积分。
2. 使用已授权人物测试图和 WAV/MP3 参考音频；首轮可使用非敏感测试素材，但不能借此宣称真人授权/克隆声线已验收。
3. 上传测试素材，记录内容 SHA、账号归属和实际平台 ID；回读资产。保留期仍为未知，直到文档或实测支持结论。
4. 从实际模型目录选定模型，提交一条用户确认的短片；保存 thread/run/link；只查询原任务，不因下载或超时重复生成。
5. 获取真实视频，检查文件、内容类型、时长、图像与声音；用户验收后才标记质量通过。
6. 复用同一平台素材 ID 在新的任务或画布中生成不同内容，再跨日回读。即时两次复用不等于永久保留；最终期限和退出规则仍须平台确认。

角色/素材库引用和短剧工作流还需要单独的实调用验证。第一条模型直出链路不能替代完整短剧 Agent、企业权限或声线长期复用验收。

## 工作台落点

企业侧保存授权原图与原始参考音频、版本、来源和使用范围，供系统自动准备素材。平台返回的 ID 作为账号范围内的外部映射保存，不当作企业资产主键或永久地址。未明确期限时 `expiresAt=null`，回读失败先核对原因，不自动跨账号重传。

原 Mock 演示保留。真实渠道只有在实际账号调用和结果取得完成后才允许标记可用；当前仅完成接口研究、CLI 安装和本地预检。
