import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultCli = join(
  project,
  ".local/xyq-cli/node_modules/@pippit-dev/cli/bin/pippit-tool-cli",
);
export function redact(value) {
  if (typeof value === "string")
    return value
      .replace(/(Bearer\s+)\S+/gi, "$1[redacted]")
      .replace(
        /((?:access_key|access_token|token|random_secret_key|state|signature)=)[^\s&]+/gi,
        "$1[redacted]",
      )
      .replace(
        /("(?:access_key|access_token|random_secret_key)"\s*:\s*")[^"]*/gi,
        "$1[redacted]",
      );
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /^(access_key|access_token|authorization|secret|random_secret_key)$/i.test(
          k,
        )
          ? "[redacted]"
          : redact(v),
      ]),
    );
  return value;
}
export async function cli(
  args,
  binary = process.env.XYQ_CLI_PATH || defaultCli,
) {
  try {
    const { stdout } = await exec(binary, args, {
      timeout: 90000,
      maxBuffer: 8 * 1024 * 1024,
    });
    let body;
    try {
      body = JSON.parse(stdout.trim());
    } catch {
      throw new Error("CLI 未返回有效 JSON，操作结果需要人工核对。");
    }
    if (body.error_message) throw new Error(body.error_message);
    return body;
  } catch (error) {
    const message = error.stderr || error.message || "CLI 调用失败";
    throw new Error(redact(message));
  }
}
export async function preflight(call = cli) {
  const status = await call(["status"]);
  if (status.logged_in !== true)
    return {
      ready: false,
      reason: "CLI 未登录；先完成小云雀官方网页授权。",
      loggedIn: false,
      modelAccessVerified: false,
    };
  const [catalog, credits] = await Promise.all([
    call(["model", "list", "--type", "video", "--refresh"]),
    call(["get-credit-balance"]),
  ]);
  return {
    ready: true,
    loggedIn: true,
    credentialSource: status.source,
    accountFingerprint: status.uid
      ? createHash("sha256")
          .update(String(status.uid))
          .digest("hex")
          .slice(0, 16)
      : null,
    modelAccessVerified: true,
    models: catalog.models,
    credits:
      credits.total_remain_amount ?? credits.data?.total_remain_amount ?? null,
  };
}
export function videoArgs(config) {
  if (!config.prompt?.trim()) throw new Error("请提供真实生成指令。");
  if (!config.model?.trim())
    throw new Error("请从当前账号的 model list 中选定模型。");
  if (!Number.isInteger(config.duration) || config.duration < 1)
    throw new Error("请提供明确的整数时长。");
  if (!config.ratio?.trim()) throw new Error("请提供画幅。");
  const args = [
    "generate-video",
    "--prompt",
    config.prompt,
    "--model",
    config.model,
    "--duration",
    String(config.duration),
    "--ratio",
    config.ratio,
    "--source",
    "codex",
  ];
  if (config.resolution) args.push("--resolution", config.resolution);
  if (config.taskType) args.push("--task-type", config.taskType);
  for (const path of config.images || [])
    args.push("--image", resolve(project, path));
  for (const path of config.audios || [])
    args.push("--audio", resolve(project, path));
  return args;
}
export function submittedTask(body) {
  if (!body.thread_id || !body.run_id)
    throw new Error(
      "提交结果缺少 thread_id/run_id，结果不确定，禁止自动重新提交。",
    );
  return {
    threadId: String(body.thread_id),
    runId: String(body.run_id),
    webThreadLink: body.web_thread_link || null,
  };
}
export async function verifyVideoResult(body) {
  if (body.error_message) throw new Error(body.error_message);
  if (body.completed !== true) return { completed: false, verifiedVideos: [] };
  if (!body.videos?.length) throw new Error("任务结束，但未返回视频文件。");
  const files = [];
  for (const video of body.videos) {
    if (!video.output_path) throw new Error("视频缺少本地 output_path。");
    const path = resolve(video.output_path),
      info = await stat(path);
    if (!info.isFile() || !info.size)
      throw new Error("视频文件为空或不是普通文件。");
    const first = await readFile(path);
    if (first.length < 12 || first.subarray(4, 8).toString("ascii") !== "ftyp")
      throw new Error("文件不是可识别的 MP4/ISO 媒体，不能把错误页当作成片。");
    files.push({
      path,
      bytes: info.size,
      sha256: createHash("sha256").update(first).digest("hex"),
      durationVerified: false,
      qualityAccepted: false,
    });
  }
  return { completed: true, verifiedVideos: files };
}
async function record(dir, filename, body) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(join(dir, filename), JSON.stringify(redact(body), null, 2), {
    mode: 0o600,
  });
}
export async function generate(config, dir, call = cli) {
  const args = videoArgs(config);
  const gate = await preflight(call);
  await record(dir, "preflight.json", gate);
  if (!gate.ready) throw new Error(gate.reason);
  if (!gate.models?.some((m) => m.key === config.model))
    throw new Error("指定模型不在当前账号的可见列表中。");
  const model = await call([
    "model",
    "describe",
    config.model,
    "--type",
    "video",
    "--refresh",
  ]);
  await record(dir, "model-config.json", model);
  for (const media of [...(config.images || []), ...(config.audios || [])]) {
    const info = await stat(resolve(project, media));
    if (!info.isFile() || info.size === 0 || info.size >= 500000000)
      throw new Error("参考素材必须是非空、少于 500MB 的普通文件。");
  }
  // Persist before the write. Unknown responses must be reconciled, never resubmitted.
  await mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    await writeFile(
      join(dir, "submission-intent.json"),
      JSON.stringify(
        redact({
          at: new Date().toISOString(),
          provider: "xiaoyunque-cli",
          config,
        }),
        null,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    );
  } catch (e) {
    if (e.code === "EEXIST")
      throw new Error(
        "此运行目录已发起过提交，禁止重复生成；已有任务请继续查询。",
      );
    throw e;
  }
  try {
    const response = await call(args),
      task = submittedTask(response);
    await record(dir, "submission.json", response);
    await record(dir, "task.json", task);
    return task;
  } catch (e) {
    await record(dir, "submission-uncertain.json", {
      at: new Date().toISOString(),
      error: e.message,
      automaticRetry: false,
    });
    throw e;
  }
}
async function main() {
  const [action = "preflight", ...args] = process.argv.slice(2);
  const dir = resolve(project, args[1] || "poc/runs/current");
  if (action === "preflight") {
    const result = await preflight();
    await record(dir, "preflight.json", result);
    console.log(JSON.stringify(result));
    return;
  }
  if (action === "generate") {
    if (!args[0]) throw new Error("用法：generate CONFIG_JSON RUN_DIRECTORY");
    const config = JSON.parse(await readFile(resolve(args[0]), "utf8"));
    console.log(JSON.stringify(await generate(config, dir)));
    return;
  }
  if (action === "query") {
    const runDir = resolve(project, args[0] || "poc/runs/current"),
      task = JSON.parse(await readFile(join(runDir, "task.json"), "utf8"));
    const result = await cli([
      "query-result",
      "--thread-id",
      task.threadId,
      "--run-id",
      task.runId,
      "--download-dir",
      join(runDir, "media"),
    ]);
    await record(runDir, "query.json", result);
    const verification = await verifyVideoResult(result);
    await record(runDir, "media-verification.json", verification);
    console.log(JSON.stringify(verification));
    return;
  }
  if (action === "readback") {
    if (!args[0]) throw new Error("请提供实际 asset_id。");
    const response = await cli(["canvas", "get", "--asset-id", args[0]]);
    await record(dir, "asset-readback.json", response);
    console.log(
      JSON.stringify({
        requestedAssetId: args[0],
        response: redact(response),
        retentionVerified: false,
      }),
    );
    return;
  }
  if (action === "upload") {
    if (!args[0]) throw new Error("请提供已授权测试素材。");
    const path = resolve(args[0]);
    if (
      ![".png", ".jpg", ".jpeg", ".webp", ".wav", ".mp3"].includes(
        extname(path).toLowerCase(),
      )
    )
      throw new Error("POC 仅登记图片和 WAV/MP3 参考音频。");
    const status = await cli(["status"]);
    if (!status.logged_in) throw new Error("CLI 未登录。");
    const data = await readFile(path),
      response = await cli(["upload-file", "--path", path]);
    if (!response.asset_id)
      throw new Error("上传结果缺少真实 asset_id，不可建立映射。");
    const mapping = {
      assetId: String(response.asset_id),
      sourceHash: createHash("sha256").update(data).digest("hex"),
      uploadedAt: new Date().toISOString(),
      expiresAt: null,
      retentionVerified: false,
      scope: "current CLI account",
      voiceCloneVerified: false,
    };
    await record(dir, "asset-mapping.json", mapping);
    console.log(JSON.stringify(mapping));
    return;
  }
  throw new Error(
    "支持 preflight / upload / readback / generate / query。授权使用官方 CLI login。",
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((e) => {
    console.error(
      JSON.stringify({ error: redact(e.message), completed: false }),
    );
    process.exitCode = 1;
  });
