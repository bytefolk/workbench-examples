# 外部能力与证据边界

所有适配目前只有公开合同和模拟响应的软件验证，未取得真实账号成功回执，因此 manifest 保持 prototype，相关外部能力标为 unavailable，而不标 connected。

| 能力                           | 当前代码                       | 真实使用条件与限制                                          |
| ------------------------------ | ------------------------------ | ----------------------------------------------------------- |
| 免费规则候选                   | local                          | 按名称、编号和标签排序，人工确认后应用                      |
| Qwen JSON解析                  | 可配置适配，未实测             | 百炼密钥、对应地域兼容URL及模型；按Token付费，校验返回ID    |
| Soul ID v2                     | 创建、绑定、查询适配，未实测   | 同API账号照片，明确v2，completed后使用；不是导出模型        |
| Soul 2图片                     | 人物ID生成新图适配，未实测     | 将合格新图应用到人物，再供视频参考；720p单张                |
| Seedance 2.0                   | reference-to-video适配，未实测 | 人物/商品/场景各一张图片，4–15秒，720p或1080p，可选片内音频 |
| Kling O3                       | image-reference适配，未实测    | 三图、3–15秒、标准档；无独立分辨率字段，关闭多镜头          |
| 上传、估算、查询、取消、下载   | 适配及模拟响应测试             | 服务端密钥，签名上传不带API凭据；仅排队取消，媒体及时下载   |
| 声音克隆、TTS、口型            | unavailable                    | 本轮未接独立服务；原生音频不等于品牌声线                    |
| 多人库、永久存储、私有人物模型 | unavailable                    | 尚无生产共享；平台人物参考不可导出为独立模型                |

使用 [Higgsfield API](https://open.higgsfield.ai/) 的独立余额，网页订阅不抵扣API。每条真实请求使用当前账号估算及账单；失败与取消按供应商返回和规则处理，人工不接受的成功候选不等于免费。[计费和文件保留](https://docs.higgsfield.ai/docs/concepts/billing-and-retention)

官方参考：[Soul 2及v2参考](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/api-reference)、[Seedance 2.0](https://open.higgsfield.ai/models/bytedance/seedance-2.0/reference-to-video/api-reference)、[Kling O3](https://open.higgsfield.ai/models/kling-video/o3/image-reference/api-reference)、[API与网页及音频区别](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api)、[Soul ID限制](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-create-and-use-a-soul-id-character)。参考日期2026-10-14，仍需运行者核对当前账号合同和权限。

密钥仅使用工作台 `.env`，默认 `HF_ENABLE_REAL=false`；本机代理绑定127.0.0.1，不应直接发布为公网生产服务。 `.local/` 与 `.env` 被忽略。目录4173入口不调用代理，独立4318入口通过Vite代理至8788。当前没有自动充值或付费批处理。
