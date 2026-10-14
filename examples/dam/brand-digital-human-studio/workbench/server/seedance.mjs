import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, readFile, writeFile, rename, realpath } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "./provider.mjs";
import { SEEDANCE_MODELS, seedanceModel } from "../shared/seedance-models.mjs";

export const SEEDANCE_DEFAULT_BASE_URL = "https://ai.amaxsmp.com/v1";
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const FINAL = new Set(["completed", "failed", "canceled"]);
const MAX_VIDEO = 120 * 1024 * 1024;
const hash = (value) => createHash("sha256").update(value).digest("hex");
export function seedanceBase(value = SEEDANCE_DEFAULT_BASE_URL) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 2048 ||
    !/^https?:\/\//i.test(value.trim()) ||
    /[\\\x00-\x20\x7f?#]/.test(value.trim())
  )
    throw new ApiError(
      "Seedance 对接网址需填写 HTTPS 基础地址，不包含空白、查询参数或片段。",
    );
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ApiError("Seedance 对接网址格式不合法，请填写完整基础地址。");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && local))
  )
    throw new ApiError(
      "Seedance 对接网址只接受无账号密码的 HTTPS 地址；本机开发可用 HTTP localhost、127.0.0.1 或 [::1]。",
    );
  const pathname = url.pathname.replace(/\/+$/, "");
  const segments = pathname.split("/").filter(Boolean);
  if (
    pathname &&
    (segments.at(-1) !== "v1" ||
      /\/{2,}/.test(pathname) ||
      segments.some((part) => !/^[a-zA-Z0-9._~-]+$/.test(part)) ||
      segments.slice(0, -1).includes("v1"))
  )
    throw new ApiError(
      "请填写服务根网址，或以 /v1 结尾的 API 基础地址（反向代理可用 /前缀/v1）；不要填写视频生成、查询或下载接口的完整地址。",
    );
  return `${url.origin}${pathname || "/v1"}`;
}
export function seedanceError(message, key = "") {
  let text = String(message || "请检查模型权限、额度和余额。");
  if (key) text = text.split(key).join("[密钥已隐藏]");
  const safe = text
    .replace(/https?:\/\/\S+/gi, "[媒体地址]")
    .replace(/(?:Bearer\s+\S+|sk-[\w-]+)/gi, "[密钥已隐藏]")
    .replace(/amax/gi, "Seedance")
    .slice(0, 400);
  return /may contain real person/i.test(safe) && !safe.includes("可信素材流程")
    ? `${safe}；平台人物审核未通过，这不证明图片是真人照片。请使用服务支持的可信素材流程；当前入口尚未接入可信素材库，不会自动重试。`
    : safe;
}
export function seedanceStatus(value) {
  switch (String(value || "").toLowerCase()) {
    case "queued":
    case "pending":
    case "not_start":
    case "submitted":
      return "queued";
    case "in_progress":
    case "generating":
    case "processing":
    case "running":
      return "in_progress";
    case "success":
    case "succeeded":
    case "completed":
      return "completed";
    case "failed":
    case "failure":
    case "error":
      return "failed";
    case "canceled":
    case "cancelled":
      return "canceled";
    default:
      return undefined;
  }
}
export function buildSeedanceInput(draft, image) {
  const model = seedanceModel(draft?.modelId);
  if (!model) throw new ApiError("请选择已接入的 Seedance 模型。");
  if (
    !model.durations.includes(draft.duration) ||
    !model.resolutions.includes(draft.resolution)
  )
    throw new ApiError("当前 Seedance Demo 只开放 5 秒、720P 预设。");
  if (!model.inputModes.includes(draft.seedanceInputMode))
    throw new ApiError("请选择文生视频或单图生视频。");
  if (typeof draft.prompt !== "string" || !draft.prompt.trim())
    throw new ApiError("请输入视频内容和动作描述。");
  const segments = [draft.prompt.trim()];
  if (draft.shots !== undefined) {
    if (
      !Array.isArray(draft.shots) ||
      draft.shots.length > 6 ||
      draft.shots.some(
        (s) => !s || typeof s.description !== "string" || !s.description.trim(),
      )
    )
      throw new ApiError("请提供最多 6 个有效镜头描述。");
    for (const [i, shot] of draft.shots.entries())
      segments.push(`镜头${i + 1}：${shot.description.trim()}`);
  }
  if (draft.mood) segments.push(`情绪：${String(draft.mood).slice(0, 60)}`);
  const prompt = segments.join("\n");
  if (prompt.length > model.promptLimit)
    throw new ApiError(`Demo 需求与分镜合计最多 ${model.promptLimit} 字。`);
  if (
    draft.seedanceInputMode === "image" &&
    (typeof image !== "string" || !image)
  )
    throw new ApiError("单图模式需要首帧资产或公开 HTTPS 图片地址。");
  return {
    model: model.id,
    prompt,
    duration: draft.duration,
    resolution: draft.resolution.toUpperCase(),
    ...(draft.seedanceInputMode === "image" ? { image } : {}),
  };
}
function remoteTask(data) {
  return data?.data &&
    typeof data.data === "object" &&
    !Array.isArray(data.data)
    ? data.data
    : data;
}
function remoteId(task) {
  const id = task?.task_id || task?.id;
  if (typeof id !== "string" || !/^[\w.:-]{1,200}$/.test(id))
    throw new ApiError(
      "Seedance 没有返回可识别的任务编号，请核对平台记录，勿重复生成。",
      502,
    );
  return id;
}
function validatePublicUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError("需要公开 HTTPS 媒体地址。");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.includes(":") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      hostname,
    )
  )
    throw new ApiError("不允许读取本机或内网媒体地址。");
  return url.toString();
}
async function defaultCheckUrl(value) {
  const url = new URL(validatePublicUrl(value));
  const hosts = await lookup(url.hostname, { all: true });
  if (
    !hosts.length ||
    hosts.some(
      ({ address }) =>
        address.includes(":") ||
        /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
          address,
        ),
    )
  )
    throw new ApiError("不允许读取本机或内网媒体地址。");
  return url.toString();
}
export async function installSeedance(
  app,
  {
    env = {},
    fetchImpl = fetch,
    dataDir,
    publicDir,
    root,
    checkMediaUrl = defaultCheckUrl,
  },
) {
  const directory = path.join(dataDir, "seedance");
  await mkdir(directory, { recursive: true });
  const settingsFile = path.join(directory, "settings.json");
  const stateFile = path.join(directory, "state.json");
  const load = async (file) => {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      return {};
    }
  };
  const settings = await load(settingsFile),
    records = await load(stateFile);
  let writes = Promise.resolve();
  const save = (file, value) => {
    const snapshot = JSON.stringify(value);
    writes = writes
      .catch(() => {})
      .then(async () => {
        await writeFile(`${file}.tmp`, snapshot, { mode: 0o600 });
        await rename(`${file}.tmp`, file);
      });
    return writes;
  };
  let recovered = false;
  for (const record of Object.values(records)) {
    if (!record.remoteId && !FINAL.has(record.status)) {
      record.providerStatus = "submission_unknown";
      record.status = "in_progress";
      record.error =
        "本地服务在提交期间中断，结果不明，请核对平台记录；不会自动重新生成。";
      recovered = true;
    }
  }
  if (recovered) await save(stateFile, records);
  const config = (owner) =>
    settings[owner]
      ? {
          ...settings[owner],
          baseUrl: seedanceBase(
            settings[owner].baseUrl ?? SEEDANCE_DEFAULT_BASE_URL,
          ),
          source: "page",
        }
      : {
          apiKey: env.SEEDANCE_API_KEY?.trim() || "",
          baseUrl: seedanceBase(
            env.SEEDANCE_BASE_URL ?? SEEDANCE_DEFAULT_BASE_URL,
          ),
          enabled: env.SEEDANCE_ENABLE_REAL === "true",
          source: env.SEEDANCE_API_KEY?.trim() ? "environment" : "none",
        };
  const publicConfig = (owner) => {
    const c = config(owner);
    return {
      configured: !!c.apiKey,
      enabled: c.enabled,
      source: c.source,
      baseUrl: c.baseUrl,
      model: SEEDANCE_MODELS[0].id,
      models: SEEDANCE_MODELS,
      credentialVerified: false,
    };
  };
  const requireConfig = (owner) => {
    const c = config(owner);
    if (!c.apiKey || !c.enabled)
      throw new ApiError("请先保存 Seedance API Key 并开启真实生成。", 409);
    return c;
  };
  const requireTaskConfig = (owner, record) => {
    const c = requireConfig(owner);
    if (hash(c.apiKey) !== record.credentialHash)
      throw new ApiError(
        "当前 Key 与提交此任务时不同，请恢复原 Key 后查询或下载。",
        409,
      );
    if (
      c.baseUrl !== (record.baseUrl || SEEDANCE_DEFAULT_BASE_URL) ||
      (record.baseUrlHash && hash(c.baseUrl) !== record.baseUrlHash)
    )
      throw new ApiError(
        "当前对接网址与提交此任务时不同，请恢复原网址后查询或下载。",
        409,
      );
    return c;
  };
  const handle = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
  const safeUrl = async (value) => checkMediaUrl(validatePublicUrl(value));
  const bytesFrom = async (response, max) => {
    if (!response.ok || !response.body)
      throw new ApiError(
        "Seedance 视频下载失败，请稍后重取原结果，不会重新生成。",
        502,
      );
    if (Number(response.headers.get("content-length")) > max)
      throw new ApiError("媒体超出 Demo 大小限制。", 413);
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > max) throw new ApiError("媒体超出 Demo 大小限制。", 413);
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  };
  const imageData = async (source) => {
    if (typeof source !== "string") throw new ApiError("请选择首帧图片。");
    if (source.startsWith("https:")) return safeUrl(source);
    let type, bytes;
    const data = source.match(
      /^data:(image\/(?:png|jpeg|webp));base64,([\w+/=]+)$/,
    );
    if (data) {
      type = data[1];
      bytes = Buffer.from(data[2], "base64");
    } else if (/^(?:\.\/|\/)media\/[\w-]+\.png$/.test(source)) {
      type = "image/png";
      bytes = await readFile(
        path.join(
          publicDir || path.join(root, "public"),
          "media",
          path.basename(source),
        ),
      );
    } else throw new ApiError("只接受资产库图片或公开 HTTPS 图片地址。");
    const valid =
      type === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216
          : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
    if (!valid || !bytes.length || bytes.length > 10 * 1024 * 1024)
      throw new ApiError("首帧必须为有效 PNG、JPEG 或 WebP，最多 10 MB。");
    return `data:${type};base64,${bytes.toString("base64")}`;
  };
  const gateway = async (c, suffix, body) => {
    let response;
    try {
      response = await fetchImpl(`${c.baseUrl}${suffix}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${c.apiKey}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(body === undefined ? 45000 : 120000),
        redirect: "error",
      });
    } catch {
      const error = new ApiError(
        "Seedance 未收到明确响应，请核对任务记录，勿重复生成。",
        504,
      );
      error.submissionUnknown = true;
      throw error;
    }
    const data = await response.json().catch(() => null);
    const code = data?.code;
    if (
      !response.ok ||
      data?.error ||
      (code !== undefined &&
        ![0, 200, "0", "200", "success", "SUCCESS"].includes(code))
    ) {
      const error = new ApiError(
        `Seedance 请求失败（${response.status}）：${seedanceError(data?.error?.message || data?.message || code, c.apiKey)}`,
        [401, 403, 429].includes(response.status) ? response.status : 502,
      );
      error.submissionUnknown =
        response.status >= 500 || response.status === 408;
      throw error;
    }
    if (!data || typeof data !== "object") {
      const error = new ApiError(
        "Seedance 返回无法识别的响应，请核对任务记录。",
        502,
      );
      error.submissionUnknown = true;
      throw error;
    }
    return remoteTask(data);
  };
  const view = (r) => ({
    requestId: r.id,
    status: r.status,
    remoteTaskId: r.remoteId,
    providerStatus: r.providerStatus,
    video: r.mediaFile ? `/api/seedance/requests/${r.id}/media` : undefined,
    canCancel: false,
    canRetryDownload: !!r.remoteCompleted && !r.mediaFile,
    error: r.error,
  });
  const owned = (req) => {
    const record = UUID.test(req.params.id) && records[req.params.id];
    if (!record || record.owner !== req.demoOwner)
      throw new ApiError("此会话没有该 Seedance 任务。", 404);
    return record;
  };
  app.get("/api/seedance/config", (req, res) =>
    res.json(publicConfig(req.demoOwner)),
  );
  app.post(
    "/api/seedance/config",
    handle(async (req, res) => {
      const { apiKey, baseUrl, enabled = true } = req.body || {};
      if (
        typeof enabled !== "boolean" ||
        (apiKey !== undefined &&
          (typeof apiKey !== "string" ||
            apiKey.length > 512 ||
            /\s/.test(apiKey.trim())))
      )
        throw new ApiError("Seedance 配置格式不合法，Key 不能包含空白字符。");
      const key = apiKey?.trim() || config(req.demoOwner).apiKey;
      if (!key || key.length < 8 || /[\x00-\x1f\x7f]/.test(key))
        throw new ApiError("请填写完整 Seedance API Key。");
      const canonicalBase = seedanceBase(
        baseUrl === undefined ? config(req.demoOwner).baseUrl : baseUrl,
      );
      settings[req.demoOwner] = {
        apiKey: key,
        baseUrl: canonicalBase,
        enabled,
      };
      await save(settingsFile, settings);
      res.json(publicConfig(req.demoOwner));
    }),
  );
  app.post(
    "/api/seedance/config/clear",
    handle(async (req, res) => {
      settings[req.demoOwner] = {
        apiKey: "",
        baseUrl: SEEDANCE_DEFAULT_BASE_URL,
        enabled: false,
      };
      await save(settingsFile, settings);
      res.json(publicConfig(req.demoOwner));
    }),
  );
  const submissions = new Set();
  app.post(
    "/api/seedance/videos",
    handle(async (req, res) => {
      const { submissionId, draft, assets } = req.body || {};
      if (
        typeof submissionId !== "string" ||
        !UUID.test(submissionId) ||
        !Array.isArray(assets)
      )
        throw new ApiError("提交编号或素材格式不合法。");
      const fingerprint = hash(JSON.stringify({ draft, assets }));
      if (records[submissionId]) {
        const r = records[submissionId];
        if (r.owner !== req.demoOwner || r.fingerprint !== fingerprint)
          throw new ApiError("提交编号已使用，请勿复用于不同内容。", 409);
        return res.json(view(r));
      }
      if (submissions.has(submissionId))
        throw new ApiError("同一提交正在处理，请等待。", 409);
      submissions.add(submissionId);
      try {
        const c = requireConfig(req.demoOwner);
        buildSeedanceInput(draft, "pending");
        let image;
        if (draft.seedanceInputMode === "image") {
          if (
            draft.seedanceReferenceUrl !== undefined &&
            typeof draft.seedanceReferenceUrl !== "string"
          )
            throw new ApiError("图片地址格式不合法。");
          if (draft.seedanceReferenceUrl?.trim())
            image = await safeUrl(draft.seedanceReferenceUrl.trim());
          else {
            const asset = assets.find(
              (a) =>
                a?.id === (draft.seedanceFrameAssetId || draft.characterId) &&
                a.kind !== "voice",
            );
            if (!asset) throw new ApiError("请选择实际发送的首帧资产。");
            image = await imageData(asset.image);
          }
        }
        const payload = buildSeedanceInput(draft, image);
        const r = {
          id: submissionId,
          owner: req.demoOwner,
          fingerprint,
          credentialHash: hash(c.apiKey),
          baseUrl: c.baseUrl,
          baseUrlHash: hash(c.baseUrl),
          modelId: draft.modelId,
          status: "in_progress",
          providerStatus: "submitting",
          createdAt: Date.now(),
          nextPoll: 0,
        };
        records[submissionId] = r;
        await save(stateFile, records);
        // A durable local UUID is returned before any paid network submission.
        void (async () => {
          try {
            const task = await gateway(c, "/video/generations", payload);
            try {
              r.remoteId = remoteId(task);
            } catch (e) {
              e.submissionUnknown = true;
              throw e;
            }
            r.providerStatus = String(task.status || "queued");
            const status = seedanceStatus(task.status);
            r.remoteCompleted = status === "completed";
            r.resultUrl =
              typeof (task.result_url || task.url) === "string"
                ? task.result_url || task.url
                : undefined;
            r.status =
              status === "completed" ? "in_progress" : status || "queued";
            if (r.status === "failed" || r.status === "canceled")
              r.error = seedanceError(
                task.fail_reason ||
                  task.message ||
                  task.error?.message ||
                  task.error,
                c.apiKey,
              );
          } catch (e) {
            r.status = e.submissionUnknown ? "in_progress" : "failed";
            r.providerStatus = e.submissionUnknown
              ? "submission_unknown"
              : "submission_failed";
            r.error = seedanceError(e.message, c.apiKey);
          }
          await save(stateFile, records);
        })().catch(() => {
          r.status = "in_progress";
          r.providerStatus = "submission_unknown";
          r.error = "本地保存失败，请核对平台任务记录，勿重复生成。";
        });
        res.json(view(r));
      } finally {
        submissions.delete(submissionId);
      }
    }),
  );
  async function download(r, c) {
    const inspect = async (response) => {
      const type = response.headers.get("content-type")?.toLowerCase() || "";
      if (/json|text\//.test(type))
        throw new ApiError(
          "Seedance 下载返回了错误内容，没有保存为视频。",
          502,
        );
      const bytes = await bytesFrom(response, MAX_VIDEO);
      if (bytes.length < 16 || bytes.subarray(4, 8).toString() !== "ftyp")
        throw new ApiError("Seedance 返回文件不是 MP4，没有保存为成片。", 502);
      return bytes;
    };
    let bytes;
    try {
      const response = await fetchImpl(
        `${c.baseUrl}/videos/${encodeURIComponent(r.remoteId)}/content`,
        {
          headers: { Authorization: `Bearer ${c.apiKey}` },
          signal: AbortSignal.timeout(60000),
          redirect: "error",
        },
      );
      bytes = await inspect(response);
    } catch {
      if (!r.resultUrl)
        throw new ApiError(
          "Seedance 已生成，但下载未完成。请稍后查询重取原结果；不会重新生成。",
          502,
        );
      // Never send the account Key to an upstream result host or follow redirects.
      const response = await fetchImpl(await safeUrl(r.resultUrl), {
        signal: AbortSignal.timeout(60000),
        redirect: "error",
      });
      bytes = await inspect(response);
    }
    const folder = path.join(directory, r.id);
    await mkdir(folder, { recursive: true });
    const file = path.join(folder, "result.mp4");
    await writeFile(`${file}.tmp`, bytes);
    await rename(`${file}.tmp`, file);
    r.mediaFile = file;
    r.status = "completed";
    r.error = undefined;
    await save(stateFile, records);
  }
  const polling = new Map();
  app.get(
    "/api/seedance/requests/:id",
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
            await save(stateFile, records);
            try {
              if (!r.remoteCompleted) {
                const task = await gateway(
                  c,
                  `/video/generations/${encodeURIComponent(r.remoteId)}`,
                );
                if ((task.task_id || task.id) && remoteId(task) !== r.remoteId)
                  throw new ApiError("Seedance 返回了不匹配的任务编号。", 502);
                const status = seedanceStatus(task.status);
                if (!status)
                  throw new ApiError(
                    "Seedance 返回未知任务状态，请稍后查询；不会猜测完成。",
                    502,
                  );
                r.providerStatus = String(task.status);
                r.remoteCompleted = status === "completed";
                r.status = r.remoteCompleted ? "in_progress" : status;
                if (r.remoteCompleted)
                  r.resultUrl =
                    typeof (task.result_url || task.url) === "string"
                      ? task.result_url || task.url
                      : undefined;
                r.error =
                  status === "failed" || status === "canceled"
                    ? seedanceError(
                        task.fail_reason ||
                          task.message ||
                          task.error?.message ||
                          task.error,
                        c.apiKey,
                      )
                    : undefined;
                await save(stateFile, records);
              }
              if (r.remoteCompleted && !r.mediaFile) await download(r, c);
            } catch (e) {
              r.error = seedanceError(e.message, c.apiKey);
              await save(stateFile, records);
              throw new ApiError(r.error, e.status || 502);
            }
            return view(r);
          })().finally(() => polling.delete(r.id)),
        );
      res.json(await polling.get(r.id));
    }),
  );
  const media = (attachment) =>
    handle(async (req, res) => {
      const r = owned(req);
      if (r.status !== "completed" || !r.mediaFile)
        throw new ApiError("成片尚未归档完成。", 409);
      const file = await realpath(r.mediaFile);
      const relative = path.relative(await realpath(directory), file);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new ApiError("本地成片路径无效。", 502);
      if (attachment) res.attachment(`muse-seedance-${r.id}.mp4`);
      res.type("video/mp4").sendFile(file);
    });
  app.get("/api/seedance/requests/:id/media", media(false));
  app.get("/api/seedance/requests/:id/download", media(true));
  return { publicConfig, requireConfig };
}
export const mountSeedance = installSeedance;
