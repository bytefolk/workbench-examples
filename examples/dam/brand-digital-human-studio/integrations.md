# 外部能力与证据边界

所有适配目前只有公开合同和模拟响应的软件验证，未取得真实账号成功回执，因此 manifest 保持 prototype，相关外部能力标为 unavailable，而不标 connected。

| 能力                           | 当前代码                       | 真实使用条件与限制                                                                                  |
| ------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------- |
| 演示账号登录                   | mock，桌面/手机软件检查通过    | 固定虚构公共账号，本地登录记录；不接身份提供方，无正式鉴权/RBAC/API保护，两个身份共享浏览器工作空间 |
| 免费规则候选                   | local                          | 按名称、编号和标签排序，人工确认后应用                                                              |
| Qwen JSON解析                  | 可配置适配，未实测             | 百炼密钥、对应地域兼容URL及模型；按Token付费，校验返回ID                                            |
| Soul ID v2                     | 创建、绑定、查询适配，未实测   | 同API账号照片，明确v2，completed后使用；不是导出模型                                                |
| Soul 2图片                     | 人物ID生成新图适配，未实测     | 将合格新图应用到人物，再供视频参考；720p单张                                                        |
| Seedance 2.0                   | reference-to-video适配，未实测 | 人物/商品/场景各一张图片，4–15秒，720p或1080p，可选片内音频                                         |
| Kling O3                       | image-reference适配，未实测    | 三图、3–15秒、标准档；无独立分辨率字段，关闭多镜头                                                  |
| 上传、估算、查询、取消、下载   | 适配及模拟响应测试             | 服务端密钥，签名上传不带API凭据；仅排队取消，媒体及时下载                                           |
| 万相、声线复刻、TTS与图片口型  | 适配和模拟响应测试，未实测     | wan2.6-i2v-flash、voice-enrollment、qwen-audio-3.0-tts-flash、wan2.2-s2v；真实账号与质量待验证      |
| 小云雀CLI                      | 可选适配和模拟响应测试，未实测 | 官方CLI1.0.38，账号授权/会员和积分以实际账号为准，默认关闭                                          |
| 多人库、永久存储、私有人物模型 | unavailable                    | 尚无生产共享；平台人物参考不可导出为独立模型                                                        |

使用 [Higgsfield API](https://open.higgsfield.ai/) 的独立余额，网页订阅不抵扣API。每条真实请求使用当前账号估算及账单；失败与取消按供应商返回和规则处理，人工不接受的成功候选不等于免费。[计费和文件保留](https://docs.higgsfield.ai/docs/concepts/billing-and-retention)

官方参考：[Soul 2及v2参考](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/api-reference)、[Seedance 2.0](https://open.higgsfield.ai/models/bytedance/seedance-2.0/reference-to-video/api-reference)、[Kling O3](https://open.higgsfield.ai/models/kling-video/o3/image-reference/api-reference)、[API与网页及音频区别](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api)、[Soul ID限制](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-create-and-use-a-soul-id-character)。参考日期2026-10-14，仍需运行者核对当前账号合同和权限。

Higgsfield密钥使用工作台 `.env`，阿里云也支持上述页面配置，默认 `HF_ENABLE_REAL=false`；本机代理绑定127.0.0.1，不应直接发布为公网生产服务。 `.local/` 与 `.env` 被忽略。目录4173入口不调用代理，独立4318入口通过Vite代理至8788。当前没有自动充值或付费批处理。

## 演示登录与供应商授权

演示登录不依赖外部账号系统，不需要API Key：`admin@muse.demo` / `creator@muse.demo`，密码均 `Muse2026!`，均为虚构公共凭据。默认sessionStorage最长8小时；记住登录使用localStorage最长7天，命名空间 `bytefolk-muse-demo-auth-v1`。两个身份只是演示标签，共用同一浏览器工作空间。

退出只清演示登录态，不清供应商配置/Key、不中止云任务；百炼/Higgsfield/小云雀仍各需独立授权和余额。这个前端入口不是后端鉴权、企业RBAC或API保护。桌面/手机登录QA及仓库5项浏览器回归通过；退出未调用供应商清除/取消接口，没有读取实际客户Key验收配置恢复。正式身份提供方、成员管理、权限和数据隔离仍未接入。

## 阿里云与小云雀补充适配（2026-10-14）

北京地域百炼通用Key可在独立工作台页面配置，或使用WAN_API_KEY、WAN_WORKSPACE_ID、WAN_ENABLE_REAL。页面配置保存在忽略的wan/settings.json，不回显、不进浏览器持久存储和导出，未加生产凭据加密。保存不核验账号、不生成。

语音采用同步HTTP：voice-enrollment create_voice目标qwen-audio-3.0-tts-flash，读取output.voice_id，查询目标模型匹配且OK后绑定。新台词使用相同模型/音色；Base64或音频地址取回本机。对口型为异步wan2.2-s2v，只传image_url/audio_url，音频<20秒，480P/720P，不传独立帽子/场景/分镜。

本机录音10–20秒、≤10MB、WAV/MP3、≥16kHz、WAV16bit；通过官方48小时临时上传取得账号/模型绑定oss地址，使用X-DashScope-OssResourceResolve。OSS上传不带百炼Key。付费操作编号先持久化，各步骤用户点击，不自动重试或连做。对口型15秒查询，处理output.results.video_url，MP4归档后才完成；语音下载失败取回原结果，不重复TTS。

对口型官方北京原价估算480P为0.50元/秒、720P为0.90元/秒，实际额度、折扣和账单由账号确定。复刻/语音/视频分别计费；云声线ID不是可导出权重。此流程不证明完整全身剧情和商品细节达标，也不适配任意已有视频的音轨替换。

小云雀可选运行xyq:install与xyq:login；原生CLI授权由官方工具保存，XYQ_ENABLE_REAL默认false。网页登录不等于CLI授权，不向Git提交工具本体或缓存。

官方资料：[万相视频](https://help.aliyun.com/zh/model-studio/legacy-image-to-video-api-reference/)、[声音复刻](https://help.aliyun.com/zh/model-studio/voice-clone-design-http-api)、[TTS](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-http-api)、[对口型](https://help.aliyun.com/zh/model-studio/wan-s2v-api)、[临时上传](https://help.aliyun.com/zh/model-studio/get-temporary-file-url)、[小云雀CLI](https://github.com/Pippit-dev/cli)。代码和模拟响应已验证；真实账号和效果待联调。
