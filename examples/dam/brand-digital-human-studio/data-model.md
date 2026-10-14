# 数据模型与生命周期

| 实体                  | 关键字段                                                             | 边界                                                             |
| --------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| DemoUser              | id、name、email、role                                                | 两个虚构身份；角色只是展示，不是企业权限或RBAC                   |
| DemoSession           | version=1、userId、issuedAt、expiresAt                               | 登录命名空间独立；sessionStorage8小时或localStorage7天，不存密码 |
| Asset                 | id、kind、name、code、tags、image、Soul ID、音频URL、克隆声线ID/模型 | 当前浏览器元数据；无企业共享、不可变版本或授权治理               |
| Draft                 | 需求、引用资产、供应商、首帧、分镜、新台词、speechAudioId            | 分镜为文字意图，不是精确时间轴                                   |
| Task                  | 输入快照、状态、供应商/请求ID、错误、结果URL                         | 模拟/真实分开，实际媒体与审核标记分别保存                        |
| SpeechSample          | UUID、格式、时长、文件、会话                                         | 本机WAV/MP3录音                                                  |
| SpeechVoice / Binding | sampleId、characterId、voice_id、目标模型、状态、人物绑定            | 平台资源ID，非模型权重                                           |
| SpeechAudio           | voiceId、characterId、新台词、文件、时长                             | 语音与台词/当前绑定匹配才允许对口型                              |
| SpeechVideo           | 操作UUID、输入指纹、平台任务、MP4                                    | 付费提交不自动重试，15秒查询节流                                 |

浏览器存储键与其他案例隔离；目录入口不访问本机API。代理数据在忽略目录 `workbench/.local/higgsfield-demo/`，语音表和绑定在 `speech/state.json`，文件在UUID子目录。页面Key按匿名会话保存在 `wan/settings.json`，不回显、导出或写入浏览器；尚无生产凭据加密和企业鉴权。

演示登录记录使用 `bytefolk-muse-demo-auth-v1`，保存版本、虚构userId与签发/失效时间，不保存输入密码。有效期为当前标签页sessionStorage8小时，或记住登录的localStorage7天；版本、账号与时间失效后重新登录。演示登录不绑定供应商匿名会话，不保护API，也不建立两个账号各自的资产库。

`admin@muse.demo` 与 `creator@muse.demo` 的密码均为 `Muse2026!`，是公开虚构演示凭据。退出删除两类存储中的登录命名空间，保留工作空间键和后端供应商配置/Key，不取消云任务；不能当作平台注销或凭据撤销。跨设备登录、企业成员、授权及审计属于后续建设。

上传URL绑定云账号和模型，48小时临时存储，复刻录音与对口型文件分别上传。原录音、新语音、MP4和浏览器配置分别备份。客户文件、Key、平台签名地址和运行状态不入Git；删除浏览器数据不删除云声线。
