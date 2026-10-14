import { createHash } from "node:crypto";
export const models = [
  {
    id: "seedance-reference",
    label: "Seedance 2.0 · 多素材参考",
    path: "bytedance/seedance-2.0/reference-to-video",
    minDuration: 4,
    maxDuration: 15,
  },
  {
    id: "kling-reference",
    label: "Kling O3 · 多图参考",
    path: "kling-video/o3/image-reference",
    minDuration: 3,
    maxDuration: 15,
  },
];
export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function credential(env) {
  return (
    env.HF_API_KEY?.trim() ||
    (env.HF_API_KEY_ID && env.HF_API_KEY_SECRET
      ? `${env.HF_API_KEY_ID}:${env.HF_API_KEY_SECRET}`
      : "")
  );
}
export function apiUrl(url) {
  const parsed = new URL(url);
  if (parsed.origin !== "https://api.higgsfield.ai")
    throw new ApiError("供应商返回了非预期的状态地址。", 502);
  return parsed.toString();
}
export function redact(message, key = "") {
  let text = String(message).replace(/https?:\/\/\S+/g, "[媒体地址]");
  if (key)
    for (const part of [key, ...key.split(":")])
      if (part.length > 3) text = text.split(part).join("[已隐藏]");
  return text.slice(0, 400);
}
export function buildVideoInput(draft, references) {
  const model = models.find(
    (m) => m.id === (draft.modelId || "seedance-reference"),
  );
  if (!model) throw new ApiError("请选择已核实的模型。");
  if (
    !Number.isInteger(draft.duration) ||
    draft.duration < model.minDuration ||
    draft.duration > model.maxDuration
  )
    throw new ApiError(
      `此模型时长必须为 ${model.minDuration}–${model.maxDuration} 秒。`,
    );
  if (
    !["16:9", "9:16"].includes(draft.ratio) ||
    !["720p", "1080p"].includes(draft.resolution || "720p")
  )
    throw new ApiError("视频规格不合法。");
  if (
    !Array.isArray(draft.shots) ||
    draft.shots.length < 1 ||
    draft.shots.length > 6
  )
    throw new ApiError("请先准备 1–6 个镜头描述。");
  if (
    typeof draft.prompt !== "string" ||
    !draft.prompt.trim() ||
    draft.prompt.length > 1200
  )
    throw new ApiError("创作需求必须为 1–1200 字。");
  const prompt = [
    draft.prompt,
    `情绪：${String(draft.mood || "自然温柔").slice(0, 60)}`,
    "参考图片按顺序分别对应人物、商品和场景。保持人物身份、商品外形及色彩，采用自然的全身动作。",
    ...draft.shots.map(
      (s, i) =>
        `镜头${i + 1}：${String(s.description || "").slice(0, 1200)}。台词参考：${String(s.narration || "").slice(0, 500)}`,
    ),
  ].join("\n");
  if (references.length !== 3)
    throw new ApiError("需要人物、商品、场景三份图片参考。");
  const input = {
    prompt,
    duration: draft.duration,
    aspect_ratio: draft.ratio,
    image_urls: references,
  };
  return {
    model,
    input:
      model.id === "seedance-reference"
        ? {
            ...input,
            resolution: draft.resolution || "720p",
            generate_audio: draft.generateAudio === true,
          }
        : {
            ...input,
            mode: "std",
            sound: draft.generateAudio ? "on" : "off",
            multi_shots: false,
            shot_type: "customize",
          },
  };
}
export function createProvider(env, fetchImpl = fetch) {
  const key = credential(env);
  const enabled = env.HF_ENABLE_REAL === "true";
  function requireKey() {
    if (!key)
      throw new ApiError(
        "尚未配置 HF_API_KEY。请在项目 .env 中配置，密钥只由本地代理读取。",
        409,
      );
    if (!enabled)
      throw new ApiError(
        "真实 API 调用未开启。需要设置 HF_ENABLE_REAL=true。",
        409,
      );
  }
  async function request(path, body, extraHeaders = {}) {
    requireKey();
    const url = path.startsWith("https:")
      ? apiUrl(path)
      : `https://api.higgsfield.ai/${path.replace(/^\//, "")}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Key ${key}`,
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
        redirect: "error",
      });
    } catch {
      throw new ApiError(
        "Higgsfield 请求未收到明确响应。提交生成时请保留本次编号，不要重复创建任务；状态查询可以重试。",
        504,
      );
    }
    if (response.status === 202 && body !== undefined) return {};
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const messages = {
        400: "参数不符或任务已开始，无法取消",
        401: "密钥无效或账号未授权",
        403: "余额或账号权限不足",
        404: "模型或任务对当前账号不可用",
        422: "请求参数或幂等编号不符",
        423: "模型暂时受限",
        429: "调用频率受限",
        503: "模型暂时不可用",
      };
      throw new ApiError(
        `Higgsfield ${response.status}：${messages[response.status] || "请求失败"}。${redact(typeof data?.detail === "string" ? data.detail : "", key)}`,
        response.status >= 500 ? 502 : response.status,
      );
    }
    if (!data) throw new ApiError("供应商响应格式不符合预期。", 502);
    return data;
  }
  return {
    request,
    requireKey,
    keyFingerprint: createHash("sha256").update(key).digest("hex").slice(0, 16),
    config: {
      configured: !!key,
      enabled,
      llmConfigured: !!env.DASHSCOPE_API_KEY && !!env.QWEN_BASE_URL,
      models: models.map(({ id, label, minDuration, maxDuration }) => ({
        id,
        label,
        minDuration,
        maxDuration,
      })),
    },
  };
}
