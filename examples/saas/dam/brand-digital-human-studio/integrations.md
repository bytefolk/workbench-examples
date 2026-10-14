# 外部能力与证据边界

所有适配目前只有公开合同和模拟响应的软件验证，未取得真实账号成功回执，因此 manifest 保持 prototype，相关外部能力标为 unavailable，而不标 connected。

| 能力                           | 当前代码                       | 真实使用条件与限制                                                                                       |
| ------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 演示账号登录                   | mock，桌面/手机软件检查通过    | 固定虚构公共账号，本地登录记录；不接身份提供方，无正式鉴权/RBAC/API保护，两个身份共享浏览器工作空间      |
| 免费规则候选                   | local                          | 按名称、编号和标签排序，人工确认后应用                                                                   |
| Qwen JSON解析                  | 可配置适配，未实测             | 百炼密钥、对应地域兼容URL及模型；按Token付费，校验返回ID                                                 |
| Soul ID v2                     | 创建、绑定、查询适配，未实测   | 同API账号照片，明确v2，completed后使用；不是导出模型                                                     |
| Soul 2图片                     | 人物ID生成新图适配，未实测     | 将合格新图应用到人物，再供视频参考；720p单张                                                             |
| Seedance 2.0（Higgsfield渠道） | reference-to-video适配，未实测 | 人物/商品/场景各一张图片，4–15秒，720p或1080p，可选片内音频                                              |
| Seedance 独立视频              | 适配范围，真实账号未验收       | 独立Key；`doubao-seedance-2-0-fast-260128`、5秒720P；文生或单图；本机成片回收，下载网关/Base64需账号验证 |
| Kling O3                       | image-reference适配，未实测    | 三图、3–15秒、标准档；无独立分辨率字段，关闭多镜头                                                       |
| 上传、估算、查询、取消、下载   | 适配及模拟响应测试             | 服务端密钥，签名上传不带API凭据；仅排队取消，媒体及时下载                                                |
| 万相、声线复刻、TTS与图片口型  | 适配和模拟响应测试，未实测     | wan2.6-i2v-flash、voice-enrollment、qwen-audio-3.0-tts-flash、wan2.2-s2v；真实账号与质量待验证           |
| 小云雀CLI                      | 可选适配和模拟响应测试，未实测 | 官方CLI1.0.38，账号授权/会员和积分以实际账号为准，默认关闭                                               |
| 多人库、永久存储、私有人物模型 | unavailable                    | 尚无生产共享；平台人物参考不可导出为独立模型                                                             |

使用 [Higgsfield API](https://open.higgsfield.ai/) 的独立余额，网页订阅不抵扣API。每条真实请求使用当前账号估算及账单；失败与取消按供应商返回和规则处理，人工不接受的成功候选不等于免费。[计费和文件保留](https://docs.higgsfield.ai/docs/concepts/billing-and-retention)

官方参考：[Soul 2及v2参考](https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/api-reference)、[Seedance 2.0](https://open.higgsfield.ai/models/bytedance/seedance-2.0/reference-to-video/api-reference)、[Kling O3](https://open.higgsfield.ai/models/kling-video/o3/image-reference/api-reference)、[API与网页及音频区别](https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api)、[Soul ID限制](https://higgsfield.ai/creator-hub/help-center/ai-models/how-do-i-create-and-use-a-soul-id-character)。参考日期2026-10-14，仍需运行者核对当前账号合同和权限。

Higgsfield密钥使用工作台 `.env`，阿里云也支持上述页面配置，默认 `HF_ENABLE_REAL=false`；本机代理绑定127.0.0.1，不应直接发布为公网生产服务。 `.local/` 与 `.env` 被忽略。目录4173入口不调用代理，独立4319入口通过Vite代理至8788。当前没有自动充值或付费批处理。

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

### Seedance 视频：独立页面配置与手动生成

在「视频创作」选择「Seedance 视频」，点「配置 Seedance」，填写「接口地址（Base URL）」与所接入服务的 API Key，点击「保存配置」，再选择文生视频或单图参考模式。页面显示 Seedance，不把聚合接入平台名称作为创作渠道标题；技术资料保留真实接口来源，便于维护和核对账号。

第一期只开放 `doubao-seedance-2-0-fast-260128`，固定 5 秒、720P。这是当前公开示例能确认的配置范围，不是断言模型本身只支持这些规格。合成后的提示词收窄至1500字符，这是Demo校验范围，不是宣称平台官方上限。文生模式只发文字；单图模式默认用人物资产的单张图片，也可指定云端可读取的 HTTPS 图片链接。人物图片可编码为 Data URL，Base64 在实际账号和渠道下是否被接受仍需联调。独立帽子、场景图片与人物声线仅保留创作档案，本入口不同时上传三张图、不发送克隆声线或音频。

仅用户点击「提交 Seedance 真实生成」才创建收费任务；保存、刷新、清除配置不调用云模型、不核验余额。按生成时长计费，当前不编造统一单价或免费额度，账号权限和价格需在服务控制台核对。不自动换模型或重发收费提交。下载失败只重新取回原任务成片，不再生成。

独立 Key 不与万相/声音配置混用：密码输入，保存后不回显，不写 localStorage，不进入创作 JSON 导出；后端按浏览器匿名会话保存在忽略的 `workbench/.local/higgsfield-demo/seedance/settings.json`（本机明文文件，不是生产加密凭据库）。配置包含 `baseUrl` 与Key。可选环境变量 `SEEDANCE_BASE_URL`、`SEEDANCE_API_KEY`、`SEEDANCE_ENABLE_REAL=false`，需显式开启真实环境配置；页面保存可独立启用当前会话，清除只影响此渠道，不撤销平台 Key，也不清阿里云声线配置。目录演示入口仍不调用 API。

本机接口：`GET/POST /api/seedance/config`、`POST /api/seedance/config/clear`、`POST /api/seedance/videos`、`GET /api/seedance/requests/:id`、同任务 `/media` 与 `/download`。服务端默认Base URL为 `https://ai.amaxsmp.com/v1`，按保存的Base URL拼接 `/video/generations` 提交、`/video/generations/{task_id}` 查询、`/videos/{task_id}/content` 下载。Bearer仅送给所配置服务的接口，不转发给外部视频结果地址。

Base URL默认 `https://ai.amaxsmp.com/v1`，可在同一配置面板填写使用相同视频接口协议的服务地址；不能仅改网址就调用另一种协议。填根网址时自动补 `/v1`，已含 `/v1` 或反向代理前缀 `.../v1` 时不重复。地址须为HTTPS，不含用户名密码、查询参数或片段；HTTP仅允许localhost、127.0.0.1、[::1]本机开发。不要填写完整生成端点，`.../video/generations` 会被拒绝。保存网址和Key仍只写本机，不验证云端或生成。

新任务快照保存提交时的Base URL；更改网址或Key后，查询未归档的旧任务需恢复原配置，不能把原任务ID发到新服务。已下载的本机视频播放和下载不依赖当前云端配置，清除配置不会删除已归档文件。这里是聚合服务接入，不应称作字节官方直连或自研模型。

兼容任务响应的顶层 ID、`top_task_id` 或包装任务对象，归一平台状态；本机提交中的 `submitting` 或结果不明的 `submission_unknown` 不视作成功，任务详情保留平台任务ID供核对。只有云端成功且 MP4 下载本机后才进入成品库。公开文档提示下载网关的二进制转发尚未完成验证，需验证实际文件，并支持从任务的可访问结果地址取回。结果与任务记录保存在 `workbench/.local/higgsfield-demo/seedance/`，需自行备份。接口存在和模拟响应测试不代表真实账号成功。

尚未接入：取消、任意模型目录、多图/参考视频、音频驱动与品牌声线克隆、固定身份训练或模型权重导出。原生模型是否产声不等于指定品牌声线；继续使用独立阿里云声音入口。人物一致性、全身动作和帽子准确性依然需客户素材实测，新增渠道不改变 B 类交付边界。

官方资料（2026-10-14）：[视频生成](https://ai.amaxsmp.com/docs/zh/02-api/video-generation/)、[任务查询](https://ai.amaxsmp.com/docs/zh/02-api/video-task/)、[视频下载](https://ai.amaxsmp.com/docs/zh/02-api/video-download/)。真实上传、付费生成和客户质量未验收。

2026-10-14 网址配置前的历史软件验证：本地 `npm test` 共48项通过（Seedance新增12项），生产构建通过。Browser插件未提供，使用Playwright与真实本机Express代理、临时状态及模拟上游，在1440×1000和390×844验证：Key保存/刷新/清除不触发上游、不修改阿里云配置，不进浏览器存储或导出；页面显示Seedance、默认Fast/5秒/720P，文图切换、HTTPS/非法链接、首帧与刷新；手动提交、状态查询、本机MP4播放/下载、审核/导出/复用。故障fixture首次返回JSON导致预期502，15秒后重新取回原视频；上游生成POST仍只有1次，下载字节与内置fixture一致。预期502以外无控制台/页面错误，无溢出或错误覆盖层。全部仅为软件及模拟合同验证，真实平台生成/素材上传/付费调用为0，Data URL、账号权限、计费和客户画面质量仍待用户验证。

## Seedance 网址配置版最终软件结果

2026-10-14 网址配置版最终软件验证：本地全套53/53项通过，其中Seedance17项（初始12项＋网址配置5项）；仓库MUSE接口54/54项通过。仓库npm ci成功、依赖不变，最终完整npm run check通过：格式、两套构建、16领域/2案例、7项根检查、54项MUSE、17项Persona、8项离线POC。MUSE最终6项完整浏览器回归通过，新增目录检查包含自定义Base URL被本地目录保护阻断、零API和零Key存储。

网址配置版隔离真实本机代理以1440×1000、390×844验证：默认/v1，自填 `https://video-fixture.example/v1/` 保存后规范化并重新打开回读；提交、查询、content均走自填Base URL。更改网址与假Key后查询旧任务返回预期409且不发外部请求，恢复原URL与Key后取回原成片；本机播放、原生下载字节等fixture、审核、导出无Key及复用通过。模拟上游生成POST仅1次、本机查询5次、结果地址回退2次。故障fixture的502一次、409一次均为预期，无意外console/pageerror；桌面/手机配置弹窗截图已视觉检查，无横向溢出。根5173/8787及仓库4318/8788重启后fresh匿名会话为configured=false、默认Base URL、credentialVerified=false，不触发云调用。

这些是本机软件、假凭据和模拟上游证据，真实平台素材上传/生成/付费调用均为0；真实Key、账号权限、Base64/Data URL、公共网关和客户效果未验收。状态仍prototype、外部适配unavailable，不标connected。

## 万相官方与兼容视频网关（当前公开代码）

页面支持WAN_PROTOCOL=dashscope/gateway、WAN_BASE_URL、WAN_GATEWAY_MODEL_ID和独立Key。官方协议保留登记模型合法参数；兼容网关使用POST /video/generations、GET /video/generations/{id}及GET /videos/{id}/content，当前为单图5秒720P。实际模型名、权限、价格以自己的供应商账号为准；更改网址不等于兼容所有平台。

声音复刻/TTS/图片口型仍只支持百炼官方协议，网关模式提前阻断。保存配置不调用模型，不自动充值、重发或降级换模型。明确渠道拒绝标记失败，超时等不明确提交标记待核对；成功云任务下载原成片后再入库。任务记录保留实际模型和协议，不记录Key。

公开目录和公开构建不提供凭据输入或真实操作，API函数本地阻断；本机入口保留手动验证。运行数据默认workbench/.local/higgsfield-demo，Git忽略。云账号、计费及模型画面质量不属于模拟软件检查。无官方asset://或人像认证机制，写实AI头像也可能被拒绝。
