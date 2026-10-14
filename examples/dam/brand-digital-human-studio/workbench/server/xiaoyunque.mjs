import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  writeFile,
  rename,
  realpath,
  stat,
  copyFile,
} from "node:fs/promises";
import path from "node:path";
import { ApiError } from "./provider.mjs";

const execute = promisify(execFile);
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export function cliPath(root, env) {
  return (
    env.XYQ_CLI_PATH ||
    path.join(
      root,
      "work/xyq-cli/node_modules/@pippit-dev/cli/bin",
      `pippit-tool-cli${process.platform === "win32" ? ".exe" : ""}`,
    )
  );
}
export function safeXyqError(message, env = {}) {
  let result = String(message)
    .replace(/https?:\/\/\S+/g, "[平台地址]")
    .replace(/Bearer\s+\S+/gi, "Bearer [隐藏]")
    .replace(
      /((?:access_key|access_token|random_secret_key|secret_key|api_key|secret|token|authorization)["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi,
      "$1[隐藏]",
    );
  for (const key of [env.XYQ_ACCESS_KEY, env.HF_API_KEY, env.DASHSCOPE_API_KEY])
    if (key) result = result.split(key).join("[隐藏]");
  return result.slice(0, 400);
}
export function makeCli(root, env) {
  const binary = cliPath(root, env);
  return async (args) => {
    try {
      const { stdout } = await execute(binary, args, {
        env: { ...process.env, ...env },
        shell: false,
        windowsHide: true,
        timeout: args[0] === "generate-video" ? 180000 : 90000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const result = JSON.parse(stdout.trim());
      // query-result may encode errors in JSON even when its exit code is zero.
      if (result.error_message && args[0] !== "query-result")
        throw new ApiError(safeXyqError(result.error_message, env), 502);
      return result;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error.code === "ENOENT")
        throw new ApiError(
          "小云雀 CLI 未安装，请运行 npm run xyq:install。",
          409,
        );
      throw new ApiError(
        `小云雀调用未成功：${safeXyqError(error.stderr || error.message, env)}。提交结果不明时先到平台核对，不要重复生成。`,
        502,
      );
    }
  };
}
export function validateXyqDraft(draft, model) {
  if (
    !draft ||
    typeof draft.prompt !== "string" ||
    !draft.prompt.trim() ||
    draft.prompt.length > 1200
  )
    throw new ApiError("请输入 1–1200 字创作需求。");
  if (
    !Array.isArray(draft.shots) ||
    !draft.shots.length ||
    draft.shots.length > 6 ||
    draft.shots.some(
      (s) => typeof s.description !== "string" || !s.description.trim(),
    )
  )
    throw new ApiError("请准备 1–6 个镜头描述。");
  if (typeof draft.modelId !== "string" || draft.modelId !== model.key)
    throw new ApiError("请选择当前账号模型目录中的视频模型。");
  if (draft.modelId === "Seedance_2.5_draft")
    throw new ApiError(
      "本 Demo 暂不支持分别计费的样片转成片流程，请选普通视频模型。",
    );
  if (
    !Number.isInteger(draft.duration) ||
    draft.duration < 1 ||
    draft.duration > 30
  )
    throw new ApiError("Demo 只接受 1–30 秒整数时长，具体范围以模型配置为准。");
  const duration = model.duration;
  if (duration?.options?.length && !duration.options.includes(draft.duration))
    throw new ApiError("时长不在当前模型选项中。");
  if (
    (duration?.min !== undefined && draft.duration < duration.min) ||
    (duration?.max !== undefined && draft.duration > duration.max)
  )
    throw new ApiError("时长超出当前模型范围。");
  if (
    duration?.step &&
    duration?.min !== undefined &&
    (draft.duration - duration.min) % duration.step !== 0
  )
    throw new ApiError("时长不符合当前模型步长。");
  if (
    !["16:9", "9:16"].includes(draft.ratio) ||
    (model.ratio?.options?.length && !model.ratio.options.includes(draft.ratio))
  )
    throw new ApiError("当前模型不支持所选比例。");
  if (
    model.resolution?.options?.length &&
    !model.resolution.options.includes(draft.xyqResolution)
  )
    throw new ApiError("请选择当前模型支持的分辨率。");
  const modes = model.creation_modes;
  const reference = modes?.find(
    (m) => m.key === "reference_generation" && m.enabled !== false,
  );
  if (modes?.length && !reference)
    throw new ApiError("当前模型未开放多素材参考生成，不能用于此流程。");
  if (
    model.material_limits?.image_total_limit !== undefined &&
    model.material_limits.image_total_limit < 3
  )
    throw new ApiError(
      "此模型不支持同时引用人物、商品、场景三张图，请换支持多图参考的模型。",
    );
  return { reference };
}
export async function installXiaoyunque(
  app,
  { root, env, dataDir, checkMediaUrl, fetchImpl = fetch, callCli },
) {
  const call = callCli || makeCli(root, env);
  const baseDir = path.join(dataDir, "xiaoyunque");
  await mkdir(baseDir, { recursive: true });
  const statePath = path.join(baseDir, "state.json");
  let records = {};
  try {
    records = JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (const r of Object.values(records))
    if (r.status === "in_progress" && !r.threadId) {
      r.status = "failed";
      r.error =
        "提交过程中本地服务曾中断，结果未确认。请先到小云雀核对，不会自动重新生成。";
    }
  let writes = Promise.resolve();
  function save() {
    const text = JSON.stringify(records);
    writes = writes
      .catch(() => {})
      .then(async () => {
        await writeFile(`${statePath}.tmp`, text);
        await rename(`${statePath}.tmp`, statePath);
      });
    return writes;
  }
  const handle = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (error) {
      next(error);
    }
  };
  function owned(req) {
    const record = UUID.test(req.params.id) && records[req.params.id];
    if (!record || record.owner !== req.demoOwner)
      throw new ApiError("此会话没有该小云雀任务的记录。", 404);
    return record;
  }
  const identity = (status) =>
    createHash("sha256")
      .update(
        String(status.uid || "") +
          ":" +
          String(env.XYQ_ACCESS_KEY || status.source || "browser"),
      )
      .digest("hex");
  const view = (r) => ({
    requestId: r.id,
    status: r.status,
    video: r.mediaFile ? `/api/xyq/requests/${r.id}/media` : undefined,
    canCancel: false,
    error: r.error,
    threadId: r.threadId,
    runId: r.runId,
  });
  async function loggedIn() {
    const status = await call(["status"]);
    if (status.logged_in !== true)
      throw new ApiError(
        "小云雀尚未授权，请运行 npm run xyq:login，在浏览器登录并授权，然后刷新连接。",
        409,
      );
    return status;
  }
  app.get(
    "/api/xyq/status",
    handle(async (req, res) => {
      if (!callCli) {
        try {
          await access(cliPath(root, env));
        } catch {
          return res.json({
            installed: false,
            loggedIn: false,
            enabled: false,
            models: [],
          });
        }
      }
      const status = await call(["status"]);
      if (!status.logged_in)
        return res.json({
          installed: true,
          loggedIn: false,
          enabled: env.XYQ_ENABLE_REAL === "true",
          models: [],
        });
      const [catalog, credits] = await Promise.all([
        call(["model", "list", "--type", "video", "--refresh"]),
        call(["get-credit-balance"]),
      ]);
      const balance =
        credits.total_remain_amount ?? credits.data?.total_remain_amount;
      res.json({
        installed: true,
        loggedIn: true,
        enabled: env.XYQ_ENABLE_REAL === "true",
        balance: balance == null ? null : String(balance),
        models: (catalog.models || [])
          .filter((m) => m.kind !== "image")
          .map((m) => ({ key: m.key, name: m.name || m.key })),
      });
    }),
  );
  app.get(
    "/api/xyq/model",
    handle(async (req, res) => {
      if (
        typeof req.query.key !== "string" ||
        !/^[\w.:-]{1,100}$/.test(req.query.key)
      )
        throw new ApiError("模型编号不合法。");
      await loggedIn();
      const model = await call([
        "model",
        "describe",
        req.query.key,
        "--type",
        "video",
      ]);
      res.json({
        key: model.key,
        name: model.name,
        duration: model.duration,
        ratio: model.ratio,
        resolution: model.resolution,
        creation_modes: model.creation_modes,
        material_limits: model.material_limits,
        warnings: model.warnings,
      });
    }),
  );
  async function referenceFile(source, target) {
    let bytes, type;
    if (typeof source !== "string") throw new ApiError("请选择图片参考。");
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
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new ApiError("参考图读取失败。", 502);
      type = response.headers.get("content-type")?.split(";")[0];
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 10 * 1024 * 1024) throw new ApiError("单图超过 10 MB。");
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks);
    } else throw new ApiError("只支持资产库图片和已核验的公开图片地址。");
    if (!bytes.length || bytes.length > 10 * 1024 * 1024)
      throw new ApiError("参考图必须小于 10 MB。");
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
    if (!valid) throw new ApiError("图片内容与格式不一致。");
    const file = `${target}.${type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp"}`;
    await writeFile(file, bytes);
    return file;
  }
  const submissions = new Map();
  app.post(
    "/api/xyq/videos",
    handle(async (req, res) => {
      if (env.XYQ_ENABLE_REAL !== "true")
        throw new ApiError(
          "小云雀真实调用未开启，请设置 XYQ_ENABLE_REAL=true 并重启服务。",
          409,
        );
      const { draft, assets, submissionId } = req.body;
      if (
        typeof submissionId !== "string" ||
        !UUID.test(submissionId) ||
        !Array.isArray(assets)
      )
        throw new ApiError("提交编号或资产格式不合法。");
      const fingerprint = createHash("sha256")
        .update(JSON.stringify({ draft, assets }))
        .digest("hex");
      if (records[submissionId]) {
        const r = records[submissionId];
        if (r.owner !== req.demoOwner || r.fingerprint !== fingerprint)
          throw new ApiError(
            "提交编号已被使用，请勿用同一编号提交不同配置。",
            409,
          );
        return res.json(view(r));
      }
      // Lock covers validation and upload as well as generation. No retries of a paid command.
      if (submissions.has(submissionId))
        throw new ApiError("同一提交正在处理，请稍后查询，不要重复生成。", 409);
      submissions.set(submissionId, true);
      try {
        const status = await loggedIn();
        if (
          typeof draft?.modelId !== "string" ||
          !/^[\w.:-]{1,100}$/.test(draft.modelId)
        )
          throw new ApiError("请先查询并选择视频模型。");
        const model = await call([
          "model",
          "describe",
          draft.modelId,
          "--type",
          "video",
        ]);
        const { reference } = validateXyqDraft(draft, model);
        const credit = await call(["get-credit-balance"]);
        const amount =
          credit.total_remain_amount ?? credit.data?.total_remain_amount;
        if (
          amount == null ||
          !Number.isFinite(Number(amount)) ||
          Number(amount) <= 0
        )
          throw new ApiError(
            "未查到有效积分余额或余额为零，请在小云雀账号中核对。不会自动充值。",
            409,
          );
        const selected = ["character", "product", "scene"].map((kind) =>
          assets.find((a) => a.kind === kind && a.id === draft[`${kind}Id`]),
        );
        if (selected.some((a) => !a))
          throw new ApiError("请选择人物、商品、场景三份资产。");
        const dir = path.join(baseDir, submissionId);
        await mkdir(dir, { recursive: true });
        const references = await Promise.all(
          selected.map((a, i) =>
            referenceFile(a.image, path.join(dir, `reference-${i + 1}`)),
          ),
        );
        const prompt = [
          draft.prompt,
          `情绪：${String(draft.mood || "自然").slice(0, 60)}`,
          "参考图依次为人物、帽子或配饰商品、场景。保持同人物身份和商品细节。",
          ...draft.shots.map(
            (s, i) =>
              `镜头${i + 1}：${s.description.slice(0, 1200)}。台词意图：${String(s.narration || "").slice(0, 500)}`,
          ),
        ].join("\n");
        const args = [
          "generate-video",
          "--model",
          draft.modelId,
          "--prompt",
          prompt,
          "--duration",
          String(draft.duration),
          "--ratio",
          draft.ratio,
        ];
        if (draft.xyqResolution) args.push("--resolution", draft.xyqResolution);
        if (reference?.task_type === "reference")
          args.push("--task-type", "reference");
        references.forEach((file) => args.push("--image", file));
        const record = {
          id: submissionId,
          owner: req.demoOwner,
          fingerprint,
          account: identity(status),
          status: "in_progress",
          submittedAt: Date.now(),
          nextPoll: 0,
        };
        records[submissionId] = record;
        await save();
        void (async () => {
          try {
            const remote = await call(args);
            if (!remote.thread_id || !remote.run_id)
              throw new Error("缺少真实 thread_id/run_id");
            record.threadId = String(remote.thread_id);
            record.runId = String(remote.run_id);
          } catch (error) {
            record.status = "failed";
            record.error = `提交结果未能确认。请到小云雀核对后再决定是否重做，不会自动再次扣费。${safeXyqError(error.message, env)}`;
          }
          await save();
        })().catch(() => {
          record.status = "failed";
          record.error = "本地任务保存失败，请到小云雀核对，不要重复生成。";
        });
        res.json(view(record));
      } finally {
        submissions.delete(submissionId);
      }
    }),
  );
  const polling = new Map();
  app.get(
    "/api/xyq/requests/:id",
    handle(async (req, res) => {
      const record = owned(req);
      if (
        record.status !== "in_progress" ||
        !record.threadId ||
        Date.now() < record.nextPoll
      )
        return res.json(view(record));
      if (!polling.has(record.id)) {
        const promise = (async () => {
          const status = await loggedIn();
          if (identity(status) !== record.account)
            throw new ApiError(
              "当前授权账号与提交时不一致，请切回原账号查询。",
              409,
            );
          const outputDir = path.join(
            baseDir,
            record.id,
            "downloads",
            randomUUID(),
          );
          await mkdir(outputDir, { recursive: true });
          let result;
          try {
            result = await call([
              "query-result",
              "--thread-id",
              record.threadId,
              "--run-id",
              record.runId,
              "--download-dir",
              outputDir,
            ]);
          } catch (error) {
            record.nextPoll = Date.now() + 15000;
            throw error;
          }
          record.nextPoll = Date.now() + 15000;
          if (
            (result.thread_id &&
              String(result.thread_id) !== record.threadId) ||
            (result.run_id && String(result.run_id) !== record.runId)
          )
            throw new ApiError("查询返回了不匹配的任务编号。", 502);
          if (result.error_message) {
            record.status = "failed";
            record.error = safeXyqError(result.error_message, env);
          } else if (result.completed === true) {
            const media = result.videos?.[0];
            if (!media?.output_path) {
              record.status = "failed";
              record.error = "任务已结束但没有返回视频文件，请到小云雀核对。";
            } else {
              const file = await realpath(path.resolve(media.output_path));
              const relative = path.relative(await realpath(outputDir), file);
              if (relative.startsWith("..") || path.isAbsolute(relative))
                throw new ApiError("平台返回了不安全的本地文件路径。", 502);
              const size = (await stat(file)).size;
              if (!size || size > 120 * 1024 * 1024)
                throw new ApiError("成片大小超出 Demo 限制。", 502);
              const bytes = await readFile(file);
              if (bytes.subarray(4, 8).toString() !== "ftyp")
                throw new ApiError("返回文件不是可播放的 MP4 成片。", 502);
              const final = path.join(baseDir, record.id, "result.mp4");
              await copyFile(file, `${final}.tmp`);
              await rename(`${final}.tmp`, final);
              record.mediaFile = final;
              record.status = "completed";
              record.error = undefined;
            }
          }
          await save();
          return view(record);
        })().finally(() => polling.delete(record.id));
        polling.set(record.id, promise);
      }
      res.json(await polling.get(record.id));
    }),
  );
  const media = (download) =>
    handle(async (req, res) => {
      const record = owned(req);
      if (record.status !== "completed" || !record.mediaFile)
        throw new ApiError("成片尚未保存。", 409);
      const file = await realpath(record.mediaFile);
      const relative = path.relative(await realpath(baseDir), file);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new ApiError("成片文件路径无效。", 502);
      if (download) res.attachment(`muse-xyq-${record.id}.mp4`);
      res.type("video/mp4").sendFile(file);
    });
  app.get("/api/xyq/requests/:id/media", media(false));
  app.get("/api/xyq/requests/:id/download", media(true));
}
