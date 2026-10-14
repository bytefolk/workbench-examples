import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, realpath } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "./provider.mjs";
import { WAN_MODELS, wanModel, wanEstimate } from "../shared/wan-models.mjs";
import {
  seedanceBase,
  seedanceStatus,
  SEEDANCE_DEFAULT_BASE_URL,
} from "./seedance.mjs";
export { wanEstimate } from "../shared/wan-models.mjs";

const MODEL = "wan2.6-i2v-flash";
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const FINAL = new Set(["completed", "failed", "canceled"]);
const credentialHash = (value) =>
  createHash("sha256").update(value).digest("hex");
const channelUnavailable = (message) =>
  /no available channel for model/i.test(String(message || ""));
export function wanApiBase(protocol = "dashscope", value, workspaceId = "") {
  if (!["dashscope", "gateway"].includes(protocol))
    throw new ApiError("请选择百炼原生协议或视频网关协议。");
  const normalize = (input) => {
    try {
      return seedanceBase(input);
    } catch (error) {
      throw new ApiError(
        error.message.replaceAll("Seedance", "万相"),
        error.status || 400,
      );
    }
  };
  if (protocol === "gateway")
    return normalize(value ?? SEEDANCE_DEFAULT_BASE_URL);
  if (value === undefined) return wanBase(workspaceId);
  const canonical = normalize(value);
  const original = new URL(value.trim());
  if (!original.pathname.replace(/\/+$/, "")) {
    const base = canonical.replace(/\/v1$/, "/api/v1");
    return base === wanBase() ? wanBase(workspaceId) : base;
  }
  if (!canonical.endsWith("/api/v1"))
    throw new ApiError(
      "百炼原生地址需填写服务根网址或以 /api/v1 结尾的基础地址；通用视频网关请切换协议。",
    );
  return canonical === wanBase() ? wanBase(workspaceId) : canonical;
}
function modelAlias(value = "") {
  if (
    typeof value !== "string" ||
    (value && !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(value))
  )
    throw new ApiError(
      "网关模型名称只接受最多 128 位字母、数字及 . _ : / -；请勿填写完整网址或空白。",
    );
  if (/https?:|\/\//i.test(value))
    throw new ApiError("网关模型名称不能填写网址。");
  return value;
}
export function buildWanGatewayInput(draft, image, gatewayModelId = "") {
  if (draft?.duration !== 5 || draft?.resolution !== "720p")
    throw new ApiError(
      "当前视频网关 Demo 只开放 5 秒、720P；账号模型支持范围需实际验证。",
    );
  const model = wanModel(draft?.modelId);
  if (!model) throw new ApiError("请选择已接入的万相视频模型。");
  const native = buildWanInput(
    {
      ...draft,
      generateAudio: model.audioMode === "always",
      wanShotType: "single",
    },
    image,
  );
  return {
    model: modelAlias(gatewayModelId) || draft.modelId,
    prompt: native.input.prompt,
    duration: 5,
    resolution: "720P",
    image,
  };
}
const gatewayTask = (data) =>
  data?.data && typeof data.data === "object" ? data.data : data;
function gatewayId(task) {
  const id = task?.task_id || task?.id;
  if (typeof id !== "string" || !/^[\w.:-]{1,200}$/.test(id))
    throw new ApiError(
      "视频网关未返回可识别的任务编号，请核对平台记录，勿重复生成。",
      502,
    );
  return id;
}
export function wanBase(workspaceId = "") {
  if (
    typeof workspaceId !== "string" ||
    !/^(?:[a-zA-Z0-9][a-zA-Z0-9-]{0,99})?$/.test(workspaceId)
  )
    throw new ApiError(
      "业务空间 ID 只接受字母、数字和连字符，请勿填写完整网址。",
    );
  return workspaceId
    ? `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1`
    : "https://dashscope.aliyuncs.com/api/v1";
}
export function wanError(message, key = "") {
  let text = String(message)
    .replace(/https?:\/\/\S+/g, "[媒体地址]")
    .replace(/(?:Bearer\s+\S+|sk-[a-zA-Z0-9_-]+)/gi, "[密钥已隐藏]");
  if (key) text = text.split(key).join("[密钥已隐藏]");
  text = text.replace(/amax/gi, "视频服务").slice(0, 400);
  if (channelUnavailable(text) && !text.includes("网关未找到该模型可用渠道"))
    text +=
      " 网关未找到该模型可用渠道，请核对控制台模型 ID/别名及 Key 分组，或联系服务方。";
  return text;
}
export function buildWanInput(draft, image) {
  const model = wanModel(draft?.modelId);
  if (!model) throw new ApiError("请选择已接入的万相视频模型。");
  if (
    typeof draft.prompt !== "string" ||
    !draft.prompt.trim() ||
    draft.prompt.length > model.promptLimit
  )
    throw new ApiError(
      `请输入 1–${model.promptLimit} 字创作需求，并为分镜描述留出字符。`,
    );
  if (
    !Number.isInteger(draft.duration) ||
    !model.durations.includes(draft.duration)
  )
    throw new ApiError(
      `${model.label} 的时长必须为 ${model.durations.length === 1 ? "5 秒" : "2–15 秒整数"}。`,
    );
  if (!model.resolutions.includes(draft.resolution))
    throw new ApiError(
      `该模型分辨率只支持 ${model.resolutions.join("、").toUpperCase()}。`,
    );
  if (
    draft.generateAudio !== undefined &&
    typeof draft.generateAudio !== "boolean"
  )
    throw new ApiError("声音开关格式不合法。");
  if (model.audioMode === "always" && draft.generateAudio === false)
    throw new ApiError(
      "万相 2.6 标准版固定有声输出，不能选择无声。请改用 2.6 Flash 或 2.2 Flash。",
    );
  if (model.audioMode === "none" && draft.generateAudio === true)
    throw new ApiError("万相 2.2 Flash 只生成无声视频，不能开启声音。");
  if (
    draft.wanShotType !== undefined &&
    !["single", "multi"].includes(draft.wanShotType)
  )
    throw new ApiError("镜头类型只接受单镜头或多镜头。");
  if (!model.multiShot && draft.wanShotType === "multi")
    throw new ApiError("该模型不支持多镜头参数，请使用 2.6 系列或选择单镜头。");
  if (
    !Array.isArray(draft.shots) ||
    !draft.shots.length ||
    draft.shots.length > 6 ||
    draft.shots.some(
      (s) => typeof s.description !== "string" || !s.description.trim(),
    )
  )
    throw new ApiError("请准备 1–6 个镜头描述。");
  const prompt = [
    draft.prompt,
    `情绪：${String(draft.mood || "自然").slice(0, 60)}`,
    "以首帧中的人物、穿戴和场景为参考。",
    ...draft.shots.map(
      (s, i) =>
        `镜头${i + 1}：${s.description}。台词意图：${String(s.narration || "")}`,
    ),
  ].join("\n");
  if (prompt.length > model.promptLimit)
    throw new ApiError(
      `需求与分镜合计超过该模型的 ${model.promptLimit} 字提示词限制，请缩短内容后提交。`,
    );
  return {
    model: model.id,
    input: { prompt, img_url: image },
    parameters: {
      resolution: draft.resolution.toUpperCase(),
      duration: draft.duration,
      ...(model.audioMode === "toggle"
        ? { audio: draft.generateAudio === true }
        : {}),
      prompt_extend: true,
      ...(model.multiShot
        ? { shot_type: draft.wanShotType === "multi" ? "multi" : "single" }
        : {}),
      watermark: true,
    },
  };
}
export async function installWan(
  app,
  { root, dataDir, env, fetchImpl = fetch, checkMediaUrl },
) {
  const directory = path.join(dataDir, "wan");
  await mkdir(directory, { recursive: true });
  const settingsFile = path.join(directory, "settings.json");
  const taskFile = path.join(directory, "state.json");
  const readJson = async (file) => {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return {};
    }
  };
  const settings = await readJson(settingsFile);
  const records = await readJson(taskFile);
  let recovered = false;
  for (const record of Object.values(records))
    if (!record.remoteId && !FINAL.has(record.status)) {
      const rejected =
        record.protocol === "gateway" && channelUnavailable(record.error);
      record.status =
        rejected || record.protocol !== "gateway" ? "failed" : "in_progress";
      record.providerStatus = rejected
        ? "SUBMISSION_REJECTED"
        : "SUBMISSION_UNKNOWN";
      record.error ||= `本地服务在提交过程中中断，结果未确认。请先到${record.protocol === "gateway" ? "服务控制台" : "百炼"}核对，不会自动重新生成。`;
      if (rejected) record.error = wanError(record.error);
      recovered = true;
    }
  let writes = Promise.resolve();
  function save(file, data) {
    const snapshot = JSON.stringify(data);
    writes = writes
      .catch(() => {})
      .then(async () => {
        await writeFile(`${file}.tmp`, snapshot, { mode: 0o600 });
        await rename(`${file}.tmp`, file);
      });
    return writes;
  }
  if (recovered) await save(taskFile, records);
  function config(owner) {
    const local = settings[owner];
    if (local) {
      const protocol = local.protocol || "dashscope";
      return {
        ...local,
        protocol,
        baseUrl: wanApiBase(protocol, local.baseUrl, local.workspaceId || ""),
        gatewayModelId: modelAlias(local.gatewayModelId || ""),
        source: "page",
      };
    }
    const protocol = env.WAN_PROTOCOL || "dashscope";
    const key =
      env.WAN_API_KEY?.trim() ||
      (protocol === "dashscope" ? env.DASHSCOPE_API_KEY?.trim() : "") ||
      "";
    return {
      apiKey: key,
      workspaceId: env.WAN_WORKSPACE_ID || "",
      protocol,
      baseUrl: wanApiBase(
        protocol,
        env.WAN_BASE_URL,
        env.WAN_WORKSPACE_ID || "",
      ),
      gatewayModelId: modelAlias(env.WAN_GATEWAY_MODEL_ID || ""),
      enabled: env.WAN_ENABLE_REAL === "true",
      source: key ? "environment" : "none",
    };
  }
  function publicConfig(owner) {
    const c = config(owner);
    return {
      configured: !!c.apiKey,
      enabled: c.enabled,
      source: c.source,
      workspaceId: c.workspaceId,
      protocol: c.protocol,
      baseUrl: c.baseUrl,
      gatewayModelId: c.gatewayModelId,
      region: "cn-beijing",
      model: MODEL,
      models: WAN_MODELS,
      credentialVerified: false,
    };
  }
  function requireConfig(owner) {
    const c = config(owner);
    if (!c.apiKey || !c.enabled)
      throw new ApiError("请先在页面保存 API Key，并开启万相真实生成。", 409);
    wanBase(c.workspaceId);
    return c;
  }
  const handle = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };
  app.get("/api/wan/config", (req, res) =>
    res.json(publicConfig(req.demoOwner)),
  );
  app.post(
    "/api/wan/config",
    handle(async (req, res) => {
      const {
        apiKey,
        workspaceId,
        protocol,
        baseUrl,
        gatewayModelId,
        enabled = true,
      } = req.body || {};
      if (
        typeof enabled !== "boolean" ||
        (workspaceId !== undefined && typeof workspaceId !== "string")
      )
        throw new ApiError("配置格式不合法。");
      const previous = config(req.demoOwner);
      if (
        apiKey !== undefined &&
        (typeof apiKey !== "string" ||
          apiKey.length > 512 ||
          /[\x00-\x20\x7f]/.test(apiKey.trim()))
      )
        throw new ApiError("请输入完整的 API Key，不能包含空白字符。");
      const key = apiKey?.trim() || previous.apiKey;
      if (!key || key.length < 8) throw new ApiError("请填写完整 API Key。");
      const workspace =
        workspaceId === undefined ? previous.workspaceId : workspaceId.trim();
      wanBase(workspace);
      const nextProtocol =
        protocol === undefined ? previous.protocol : protocol;
      const defaultPrevious = wanApiBase(
        previous.protocol,
        undefined,
        previous.workspaceId,
      );
      const address =
        baseUrl !== undefined
          ? baseUrl
          : nextProtocol !== previous.protocol ||
              (workspace !== previous.workspaceId &&
                previous.baseUrl === defaultPrevious)
            ? undefined
            : previous.baseUrl;
      const canonicalBase = wanApiBase(nextProtocol, address, workspace);
      if (
        (nextProtocol !== previous.protocol ||
          canonicalBase !== previous.baseUrl ||
          (nextProtocol === "dashscope" &&
            workspace !== previous.workspaceId)) &&
        !apiKey?.trim()
      )
        throw new ApiError(
          "更改协议或对接网址后，请重新填写该服务的 API Key，避免把原服务密钥发送到新网址。",
          409,
        );
      settings[req.demoOwner] = {
        apiKey: key,
        workspaceId: workspace,
        protocol: nextProtocol,
        baseUrl: canonicalBase,
        gatewayModelId: modelAlias(
          gatewayModelId === undefined
            ? previous.gatewayModelId
            : typeof gatewayModelId === "string"
              ? gatewayModelId.trim()
              : gatewayModelId,
        ),
        enabled,
      };
      await save(settingsFile, settings);
      // Never echo credentials. Saving settings performs no external API call.
      res.json(publicConfig(req.demoOwner));
    }),
  );
  app.post(
    "/api/wan/config/clear",
    handle(async (req, res) => {
      // A blank local profile also disables environment fallback for this session.
      settings[req.demoOwner] = {
        apiKey: "",
        workspaceId: "",
        protocol: "dashscope",
        baseUrl: wanBase(),
        gatewayModelId: "",
        enabled: false,
      };
      await save(settingsFile, settings);
      res.json(publicConfig(req.demoOwner));
    }),
  );
  async function request(c, suffix, body, extraHeaders = {}, asyncCall = true) {
    if (
      c.protocol === "gateway" &&
      !/^\/video\/generations(?:\/[^/]+)?$/.test(suffix)
    )
      throw new ApiError(
        "语音复刻和对口型需要百炼原生协议；视频网关只接入视频生成与查询。",
        409,
      );
    let response;
    try {
      response = await fetchImpl(
        `${c.baseUrl || wanBase(c.workspaceId)}${suffix}`,
        {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Authorization: `Bearer ${c.apiKey}`,
            "Content-Type": "application/json",
            ...(body === undefined || !asyncCall || c.protocol === "gateway"
              ? {}
              : { "X-DashScope-Async": "enable" }),
            ...extraHeaders,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(45000),
          redirect: "error",
        },
      );
    } catch {
      const error = new ApiError(
        `万相请求未收到明确响应。提交结果不明时请到${c.protocol === "gateway" ? "服务控制台" : "百炼"}核对，不会自动重试生成。`,
        504,
      );
      error.submissionUnknown = true;
      throw error;
    }
    const data = await response.json().catch(() => null);
    const gatewayFailure =
      c.protocol === "gateway" &&
      (data?.error ||
        (data?.code !== undefined &&
          ![0, 200, "0", "200", "success", "SUCCESS"].includes(data.code)));
    if (
      !response.ok ||
      (c.protocol === "gateway" ? gatewayFailure : data?.code)
    ) {
      const status = [401, 403, 429].includes(response.status)
        ? response.status
        : 502;
      const message =
        data?.error?.message ||
        (typeof data?.error === "string" ? data.error : undefined) ||
        data?.message ||
        data?.code ||
        "请检查 API Key、模型权限、额度和余额。";
      const requestId =
        data?.request_id ||
        data?.requestId ||
        data?.error?.request_id ||
        response.headers.get("x-request-id");
      const error = new ApiError(
        `万相请求失败（${response.status}）：${wanError(`${message}${requestId ? `（request ID: ${String(requestId)}）` : ""}`, c.apiKey)}`,
        status,
      );
      error.submissionRejected =
        c.protocol === "gateway" && !response.ok && channelUnavailable(message);
      error.submissionUnknown =
        !error.submissionRejected &&
        (response.status >= 500 || response.status === 408);
      throw error;
    }
    if (!data) {
      const error = new ApiError("万相返回了无法识别的响应。", 502);
      error.submissionUnknown = true;
      throw error;
    }
    return data;
  }
  async function bytesFrom(response, max) {
    if (!response.ok)
      throw new ApiError(
        "媒体下载失败。可稍后重新查询任务，不会重新生成。",
        502,
      );
    if (Number(response.headers.get("content-length")) > max)
      throw new ApiError("媒体超出 Demo 大小限制。", 413);
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > max) throw new ApiError("媒体超出 Demo 大小限制。", 413);
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async function imageData(source) {
    if (typeof source !== "string") throw new ApiError("请选择首帧图片。");
    let bytes, type;
    const data = source.match(
      /^data:(image\/(?:png|jpeg|webp));base64,([\w+/=]+)$/,
    );
    if (data) {
      type = data[1];
      bytes = Buffer.from(data[2], "base64");
    } else if (/^(?:\.\/|\/)media\/[\w-]+\.png$/.test(source)) {
      type = "image/png";
      bytes = await readFile(
        path.join(root, "public/media", path.basename(source)),
      );
    } else if (source.startsWith("https:")) {
      const response = await fetchImpl(await checkMediaUrl(source), {
        signal: AbortSignal.timeout(30000),
        redirect: "error",
      });
      type = response.headers.get("content-type")?.split(";")[0];
      bytes = await bytesFrom(response, 10 * 1024 * 1024);
    } else
      throw new ApiError("首帧只接受资产库图片或已核验的公开 HTTPS 图片。");
    const valid =
      type === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216
          : type === "image/webp" &&
            bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
    if (!valid || !bytes.length || bytes.length > 10 * 1024 * 1024)
      throw new ApiError("首帧必须为 PNG、JPEG 或 WebP，且不超过 10 MB。");
    if (type === "image/png" && bytes.length >= 26) {
      const width = bytes.readUInt32BE(16),
        height = bytes.readUInt32BE(20);
      if (width < 240 || width > 8000 || height < 240 || height > 8000)
        throw new ApiError("首帧宽高需在 240–8000 像素范围。");
      if ([4, 6].includes(bytes[25]))
        throw new ApiError(
          "万相不支持带透明通道的 PNG，请换 JPEG 或无透明通道的 PNG。",
        );
    }
    return `data:${type};base64,${bytes.toString("base64")}`;
  }
  const view = (r) => ({
    requestId: r.id,
    status: r.status,
    video: r.mediaFile ? `/api/wan/requests/${r.id}/media` : undefined,
    canCancel: false,
    error: r.error,
    remoteTaskId: r.remoteId,
    providerStatus: r.providerStatus,
    estimatedCny: r.estimatedCny,
    modelId: r.actualModelId || r.gatewayModelId || r.modelId,
    protocol: r.protocol || "dashscope",
  });
  function owned(req) {
    const r = UUID.test(req.params.id) && records[req.params.id];
    if (!r || r.owner !== req.demoOwner)
      throw new ApiError("此会话没有该万相任务的记录。", 404);
    return r;
  }
  const submissions = new Set();
  const gatewayImage = async (source) => {
    if (typeof source !== "string") throw new ApiError("请选择首帧图片。");
    if (source.startsWith("https:")) {
      const url = new URL(source);
      if (
        url.username ||
        url.password ||
        url.hostname === "localhost" ||
        url.hostname.includes(":") ||
        /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
          url.hostname,
        )
      )
        throw new ApiError("不接受本机、内网或带凭证的图片地址。");
      return checkMediaUrl(source);
    }
    return imageData(source);
  };
  app.post(
    "/api/wan/videos",
    handle(async (req, res) => {
      const { draft, assets, submissionId } = req.body || {};
      if (
        typeof submissionId !== "string" ||
        !UUID.test(submissionId) ||
        !Array.isArray(assets)
      )
        throw new ApiError("提交编号或素材格式不合法。");
      const fingerprint = createHash("sha256")
        .update(JSON.stringify({ draft, assets }))
        .digest("hex");
      if (records[submissionId]) {
        const r = records[submissionId];
        if (r.owner !== req.demoOwner || r.fingerprint !== fingerprint)
          throw new ApiError("提交编号已被使用，请勿复用到不同配置。", 409);
        return res.json(view(r));
      }
      if (submissions.has(submissionId))
        throw new ApiError("同一提交正在处理，请等待，不要重复生成。", 409);
      submissions.add(submissionId);
      try {
        const c = requireConfig(req.demoOwner);
        const asset = assets.find(
          (a) =>
            a.id === (draft?.wanFrameAssetId || draft?.characterId) &&
            a.kind !== "voice",
        );
        if (!asset) throw new ApiError("请选择要实际发送给万相的首帧资产。");
        // Validate all text and parameters before fetching any reference media.
        const buildInput =
          c.protocol === "gateway"
            ? (value, image) =>
                buildWanGatewayInput(value, image, c.gatewayModelId)
            : buildWanInput;
        buildInput(draft, "pending");
        const payload = buildInput(
          draft,
          await (c.protocol === "gateway"
            ? gatewayImage(asset.image)
            : imageData(asset.image)),
        );
        const record = {
          id: submissionId,
          owner: req.demoOwner,
          fingerprint,
          workspaceId: c.workspaceId,
          protocol: c.protocol,
          baseUrl: c.baseUrl,
          credentialHash: credentialHash(c.apiKey),
          gatewayModelId: c.gatewayModelId || draft.modelId,
          status: "in_progress",
          providerStatus: "SUBMITTING",
          createdAt: Date.now(),
          nextPoll: 0,
          estimatedCny: c.protocol === "gateway" ? null : wanEstimate(draft),
          modelId: draft.modelId,
          actualModelId: payload.model,
          frameAssetId: asset.id,
        };
        records[submissionId] = record;
        await save(taskFile, records);
        // Return a durable local ID immediately; a browser timeout cannot lose the paid task.
        void (async () => {
          try {
            const result = await request(
              c,
              c.protocol === "gateway"
                ? "/video/generations"
                : "/services/aigc/video-generation/video-synthesis",
              payload,
            );
            if (c.protocol === "gateway") {
              const remote = gatewayTask(result);
              try {
                record.remoteId = gatewayId(remote);
              } catch (error) {
                error.submissionUnknown = true;
                throw error;
              }
              record.providerStatus = remote.status || "QUEUED";
              const status = seedanceStatus(remote.status);
              record.remoteCompleted = status === "completed";
              record.videoUrl = remote.result_url || remote.url;
              record.status =
                status === "completed" ? "in_progress" : status || "queued";
              if (["failed", "canceled"].includes(record.status))
                record.error = wanError(
                  remote.fail_reason ||
                    remote.error?.message ||
                    "视频网关生成失败。",
                  c.apiKey,
                );
            } else {
              const remote = result.output;
              if (!remote?.task_id || !UUID.test(remote.task_id)) {
                const error = new ApiError(
                  "万相未返回可识别的真实 task_id。",
                  502,
                );
                error.submissionUnknown = true;
                throw error;
              }
              record.remoteId = remote.task_id;
              record.providerStatus = remote.task_status || "PENDING";
              record.status =
                remote.task_status === "RUNNING" ? "in_progress" : "queued";
            }
          } catch (error) {
            record.status =
              c.protocol === "gateway" && error.submissionUnknown
                ? "in_progress"
                : "failed";
            if (error.submissionUnknown)
              record.providerStatus = "SUBMISSION_UNKNOWN";
            else if (error.submissionRejected)
              record.providerStatus = "SUBMISSION_REJECTED";
            record.error = `${error.submissionRejected ? "提交已被网关拒绝。" : "提交未成功或结果未确认。"}请核对${c.protocol === "gateway" ? "服务控制台" : "百炼"}记录后再决定是否重做。${wanError(error.message, c.apiKey)}`;
          }
          await save(taskFile, records);
        })().catch(() => {
          record.status = "failed";
          record.error = `本地保存失败，请核对${c.protocol === "gateway" ? "服务控制台" : "百炼"}记录，勿重复提交。`;
        });
        res.json(view(record));
      } finally {
        submissions.delete(submissionId);
      }
    }),
  );
  async function gatewayDownload(r, c) {
    const inspect = async (response) => {
      if (/json|text\//i.test(response.headers.get("content-type") || ""))
        throw new ApiError("视频网关返回错误内容，未保存为视频。", 502);
      const bytes = await bytesFrom(response, 120 * 1024 * 1024);
      if (bytes.length < 16 || bytes.subarray(4, 8).toString() !== "ftyp")
        throw new ApiError("视频网关返回文件不是 MP4。", 502);
      return bytes;
    };
    try {
      return await inspect(
        await fetchImpl(
          `${c.baseUrl}/videos/${encodeURIComponent(r.remoteId)}/content`,
          {
            headers: { Authorization: `Bearer ${c.apiKey}` },
            signal: AbortSignal.timeout(60000),
            redirect: "error",
          },
        ),
      );
    } catch {
      if (!r.videoUrl)
        throw new ApiError(
          "视频已生成，但原结果下载未完成，请稍后查询重取，不会重新生成。",
          502,
        );
      const url = new URL(r.videoUrl);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.hostname === "localhost" ||
        url.hostname.includes(":") ||
        /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
          url.hostname,
        )
      )
        throw new ApiError("结果地址必须为公开 HTTPS 地址。", 502);
      return inspect(
        await fetchImpl(await checkMediaUrl(r.videoUrl), {
          signal: AbortSignal.timeout(60000),
          redirect: "error",
        }),
      );
    }
  }
  function requireTaskConfig(owner, r) {
    const c = requireConfig(owner);
    if (
      c.protocol !== (r.protocol || "dashscope") ||
      c.baseUrl !== (r.baseUrl || wanBase(r.workspaceId))
    )
      throw new ApiError(
        "当前协议或对接网址与提交任务时不同，请恢复原配置查询。",
        409,
      );
    if (r.credentialHash && credentialHash(c.apiKey) !== r.credentialHash)
      throw new ApiError(
        "当前 API Key 与提交任务时不同，请恢复原 Key 查询。",
        409,
      );
    if (c.protocol === "dashscope" && c.workspaceId !== r.workspaceId)
      throw new ApiError(
        "当前业务空间与任务提交时不同，请切回原配置查询。",
        409,
      );
    return c;
  }
  const polling = new Map();
  app.get(
    "/api/wan/requests/:id",
    handle(async (req, res) => {
      const r = owned(req);
      if (FINAL.has(r.status) || !r.remoteId) return res.json(view(r));
      const c = requireTaskConfig(req.demoOwner, r);
      if (Date.now() < r.nextPoll) return res.json(view(r));
      if (!polling.has(r.id))
        polling.set(
          r.id,
          (async () => {
            r.nextPoll = Date.now() + 15000;
            if (c.protocol === "gateway" && !r.remoteCompleted) {
              const remote = gatewayTask(
                await request(
                  c,
                  `/video/generations/${encodeURIComponent(r.remoteId)}`,
                ),
              );
              if (
                (remote.task_id || remote.id) &&
                gatewayId(remote) !== r.remoteId
              )
                throw new ApiError("视频网关返回了不匹配的任务信息。", 502);
              const status = seedanceStatus(remote.status);
              if (!status)
                throw new ApiError(
                  "视频网关返回未知任务状态，请稍后查询，不会猜测完成。",
                  502,
                );
              r.providerStatus = remote.status;
              r.remoteCompleted = status === "completed";
              r.status = r.remoteCompleted ? "in_progress" : status;
              if (r.remoteCompleted)
                r.videoUrl = remote.result_url || remote.url;
              if (["failed", "canceled"].includes(status))
                r.error = wanError(
                  remote.fail_reason ||
                    remote.error?.message ||
                    remote.error ||
                    "视频网关生成失败。",
                  c.apiKey,
                );
              await save(taskFile, records);
            } else if (c.protocol !== "gateway" && !r.videoUrl) {
              const result = await request(c, `/tasks/${r.remoteId}`);
              const output = result.output;
              if (!output || (output.task_id && output.task_id !== r.remoteId))
                throw new ApiError("万相返回了不匹配的任务信息。", 502);
              r.providerStatus = output.task_status;
              if (output.task_status === "PENDING") r.status = "queued";
              else if (output.task_status === "RUNNING")
                r.status = "in_progress";
              else if (output.task_status === "SUCCEEDED") {
                if (!output.video_url)
                  throw new ApiError(
                    "生成已结束但没有视频地址，请核对百炼任务。",
                    502,
                  );
                r.videoUrl = await checkMediaUrl(output.video_url);
                r.status = "in_progress";
              } else if (
                ["FAILED", "CANCELED", "UNKNOWN"].includes(output.task_status)
              ) {
                r.status =
                  output.task_status === "CANCELED" ? "canceled" : "failed";
                r.error = wanError(
                  output.message ||
                    result.message ||
                    (output.task_status === "UNKNOWN"
                      ? "任务不存在或超过 24 小时查询有效期，请到百炼核对。"
                      : "平台生成失败，请检查素材、权限与余额。"),
                  c.apiKey,
                );
              } else
                throw new ApiError(
                  "万相返回了未知状态，停止猜测进度，请稍后查询。",
                  502,
                );
              await save(taskFile, records);
            }
            if (
              (c.protocol === "gateway" ? r.remoteCompleted : r.videoUrl) &&
              !r.mediaFile
            ) {
              const response =
                c.protocol === "gateway"
                  ? undefined
                  : await fetchImpl(await checkMediaUrl(r.videoUrl), {
                      signal: AbortSignal.timeout(60000),
                      redirect: "error",
                    });
              const bytes =
                c.protocol === "gateway"
                  ? await gatewayDownload(r, c)
                  : await bytesFrom(response, 120 * 1024 * 1024);
              if (bytes.subarray(4, 8).toString() !== "ftyp")
                throw new ApiError("返回文件不是可播放的 MP4。", 502);
              const folder = path.join(directory, r.id);
              await mkdir(folder, { recursive: true });
              const file = path.join(folder, "result.mp4");
              await writeFile(`${file}.tmp`, bytes);
              await rename(`${file}.tmp`, file);
              r.mediaFile = file;
              r.status = "completed";
              r.error = undefined;
              await save(taskFile, records);
            }
            return view(r);
          })()
            .catch(async (error) => {
              r.error = wanError(error.message, c.apiKey);
              await save(taskFile, records);
              throw new ApiError(r.error, error.status || 502);
            })
            .finally(() => polling.delete(r.id)),
        );
      res.json(await polling.get(r.id));
    }),
  );
  const media = (download) =>
    handle(async (req, res) => {
      const r = owned(req);
      if (r.status !== "completed" || !r.mediaFile)
        throw new ApiError("成片尚未归档完成。", 409);
      const file = await realpath(r.mediaFile);
      const relative = path.relative(await realpath(directory), file);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new ApiError("本地成片路径无效。", 502);
      if (download) res.attachment(`muse-wan-${r.id}.mp4`);
      res.type("video/mp4").sendFile(file);
    });
  app.get("/api/wan/requests/:id/media", media(false));
  app.get("/api/wan/requests/:id/download", media(true));
  const requireSpeechConfig = (owner) => {
    const c = requireConfig(owner);
    if (c.protocol === "gateway")
      throw new ApiError(
        "视频网关当前仅接入视频；声音复刻、语音及对口型需要切回百炼原生协议。",
        409,
      );
    return c;
  };
  return { requireConfig: requireSpeechConfig, request, bytesFrom, imageData };
}
