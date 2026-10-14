import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename, realpath } from "node:fs/promises";
import path from "node:path";
import { parseBuffer } from "music-metadata";
import { ApiError } from "./provider.mjs";
import { wanError } from "./wan.mjs";

export const TTS_MODEL = "qwen-audio-3.0-tts-flash";
export const LIP_MODEL = "wan2.2-s2v";
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const CHARACTER = /^[\w-]{1,100}$/;
const final = new Set(["completed", "failed", "canceled"]);
export async function inspectAudio(bytes, kind) {
  const wav =
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WAVE";
  const mp3 =
    bytes.subarray(0, 3).toString() === "ID3" ||
    (bytes[0] === 255 && (bytes[1] & 224) === 224);
  if (!wav && !mp3) throw new ApiError("只接受内容有效的 WAV 或 MP3 录音。");
  let format;
  try {
    format = (
      await parseBuffer(
        bytes,
        { mimeType: wav ? "audio/wav" : "audio/mpeg", size: bytes.length },
        { duration: true },
      )
    ).format;
  } catch {
    throw new ApiError("录音无法解析，请重新导出 WAV 或 MP3。");
  }
  const duration = format.duration;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new ApiError("无法确定音频时长。");
  if (bytes.length > (kind === "sample" ? 10 : 15) * 1024 * 1024)
    throw new ApiError("音频文件超出大小限制。");
  if (kind === "sample") {
    if (duration < 10 || duration > 20)
      throw new ApiError("Demo 的复刻录音需为 10–20 秒。");
    if (
      (format.sampleRate || 0) < 16000 ||
      (format.numberOfChannels || 0) > 2 ||
      (wav && format.bitsPerSample !== 16)
    )
      throw new ApiError("录音需至少 16kHz、单声道或双声道；WAV 需 16bit。");
  }
  return {
    duration,
    type: wav ? "audio/wav" : "audio/mpeg",
    extension: wav ? "wav" : "mp3",
    sampleRate: format.sampleRate,
  };
}
export async function installSpeech(
  app,
  {
    root,
    dataDir,
    fetchImpl,
    checkMediaUrl,
    requireConfig,
    request,
    bytesFrom,
    imageData,
  },
) {
  const directory = path.join(dataDir, "speech");
  await mkdir(directory, { recursive: true });
  const stateFile = path.join(directory, "state.json");
  let db = {
    samples: {},
    voices: {},
    utterances: {},
    bindings: {},
    videos: {},
  };
  try {
    db = { ...db, ...JSON.parse(await readFile(stateFile, "utf8")) };
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  for (const table of [db.voices, db.utterances, db.videos])
    for (const r of Object.values(table)) {
      if (
        r.status === "processing" ||
        (r.status === "in_progress" && !r.remoteId)
      ) {
        r.status = "failed";
        r.error =
          "本地服务在操作过程中中断，结果未确认。请先核对百炼记录，不会自动重复生成。";
      }
    }
  let writes = Promise.resolve();
  function save() {
    const snapshot = JSON.stringify(db);
    writes = writes
      .catch(() => {})
      .then(async () => {
        await writeFile(`${stateFile}.tmp`, snapshot, { mode: 0o600 });
        await rename(`${stateFile}.tmp`, stateFile);
      });
    return writes;
  }
  const handle = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
  function owned(table, id, owner) {
    const r = typeof id === "string" && UUID.test(id) && table[id];
    if (!r || r.owner !== owner)
      throw new ApiError("当前会话没有该声音或视频记录。", 404);
    return r;
  }
  function safeCharacter(id) {
    if (typeof id !== "string" || !CHARACTER.test(id))
      throw new ApiError("请选择有效人物资产。");
    return id;
  }
  const bindingKey = (owner, characterId) => `${owner}:${characterId}`;
  const sampleView = (r) => ({
    id: r.id,
    name: r.name,
    duration: r.duration,
    size: r.size,
    createdAt: r.createdAt,
    audioUrl: `/api/speech/samples/${r.id}/media`,
  });
  const voiceView = (r) => ({
    id: r.id,
    name: r.name,
    characterId: r.characterId,
    sampleId: r.sampleId,
    status: r.status,
    remoteVoiceId: r.remoteVoiceId,
    model: TTS_MODEL,
    error: r.error,
    createdAt: r.createdAt,
  });
  const utteranceView = (r) => ({
    id: r.id,
    voiceId: r.voiceId,
    characterId: r.characterId,
    text: r.text,
    status: r.status,
    duration: r.duration,
    error: r.error,
    createdAt: r.createdAt,
    audioUrl: r.file ? `/api/speech/utterances/${r.id}/media` : undefined,
    canLipSync: r.status === "completed" && r.duration > 0 && r.duration < 20,
    canRecover: r.status === "failed" && !!r.remoteUrl && !r.file,
  });
  const videoView = (r) => ({
    requestId: r.id,
    status: r.status,
    video: r.file ? `/api/speech/requests/${r.id}/media` : undefined,
    canCancel: false,
    error: r.error,
    providerStatus: r.providerStatus,
    duration: r.duration,
  });
  app.get("/api/speech/library", (req, res) =>
    res.json({
      samples: Object.values(db.samples)
        .filter((r) => r.owner === req.demoOwner)
        .map(sampleView),
      voices: Object.values(db.voices)
        .filter((r) => r.owner === req.demoOwner)
        .map(voiceView),
      utterances: Object.values(db.utterances)
        .filter((r) => r.owner === req.demoOwner)
        .map(utteranceView),
      bindings: Object.fromEntries(
        Object.entries(db.bindings)
          .filter(([k]) => k.startsWith(`${req.demoOwner}:`))
          .map(([k, v]) => [k.slice(req.demoOwner.length + 1), v]),
      ),
    }),
  );
  app.post(
    "/api/speech/samples",
    handle(async (req, res) => {
      const { name, audio } = req.body || {};
      if (
        typeof name !== "string" ||
        !name.trim() ||
        name.length > 100 ||
        typeof audio !== "string"
      )
        throw new ApiError("请选择录音文件。");
      const data = audio.match(
        /^data:audio\/(?:wav|x-wav|wave|mpeg|mp3);base64,([\w+/=]+)$/,
      );
      if (!data) throw new ApiError("请选择 WAV 或 MP3 录音。");
      const bytes = Buffer.from(data[1], "base64");
      const format = await inspectAudio(bytes, "sample");
      const id = randomUUID(),
        folder = path.join(directory, id);
      await mkdir(folder, { recursive: true });
      const file = path.join(folder, `sample.${format.extension}`);
      await writeFile(file, bytes);
      const r = {
        id,
        owner: req.demoOwner,
        name: name.trim(),
        file,
        size: bytes.length,
        createdAt: Date.now(),
        ...format,
      };
      db.samples[id] = r;
      await save();
      res.json(sampleView(r));
    }),
  );
  async function mediaUrl(value) {
    const url = new URL(value);
    // Official TTS examples return HTTP OSS links; upgrade only official OSS hosts.
    if (
      url.protocol === "http:" &&
      /\.oss-[\w-]+\.aliyuncs\.com$/.test(url.hostname)
    )
      url.protocol = "https:";
    return checkMediaUrl(url.toString());
  }
  async function upload(c, model, bytes, type, extension) {
    // Temporary URLs are bound to the account AND model; never reuse across models.
    const policyResult = await request(
      { ...c, workspaceId: "" },
      `/uploads?action=getPolicy&model=${encodeURIComponent(model)}`,
    );
    const policy = policyResult.data;
    if (
      !policy ||
      typeof policy.upload_dir !== "string" ||
      !/^dashscope-instant\/[\w/-]+$/.test(policy.upload_dir)
    )
      throw new ApiError("文件上传凭证不符合官方临时存储格式。", 502);
    const host = await mediaUrl(policy.upload_host);
    if (!/\.oss-[\w-]+\.aliyuncs\.com$/.test(new URL(host).hostname))
      throw new ApiError("拒绝向非阿里云存储地址上传声音素材。", 502);
    const filename = `${randomUUID()}.${extension}`,
      objectKey = `${policy.upload_dir}/${filename}`;
    const form = new FormData();
    for (const [name, field] of Object.entries({
      OSSAccessKeyId: "oss_access_key_id",
      Signature: "signature",
      policy: "policy",
      "x-oss-object-acl": "x_oss_object_acl",
      "x-oss-forbid-overwrite": "x_oss_forbid_overwrite",
    })) {
      if (typeof policy[field] !== "string")
        throw new ApiError("上传凭证字段缺失。", 502);
      form.set(name, policy[field]);
    }
    form.set("key", objectKey);
    form.set("success_action_status", "200");
    form.set("file", new Blob([bytes], { type }), filename);
    const uploaded = await fetchImpl(host, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60000),
      redirect: "error",
    });
    if (!uploaded.ok)
      throw new ApiError(
        "声音或图片临时上传失败，请核对账号的文件上传权限。",
        502,
      );
    return `oss://${objectKey}`;
  }
  const locks = new Set();
  function existing(table, id, owner, body) {
    if (typeof id !== "string" || !UUID.test(id))
      throw new ApiError("请保留有效操作编号。");
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex");
    const r = table[id];
    if (r) {
      if (r.owner !== owner || r.fingerprint !== fingerprint)
        throw new ApiError("操作编号已被使用，不能提交不同内容。", 409);
      return { r, fingerprint };
    }
    if (locks.has(id))
      throw new ApiError("操作正在提交，请等待，不要重复点击。", 409);
    return { fingerprint };
  }
  function sameWorkspace(c, r) {
    if (c.workspaceId !== r.workspaceId)
      throw new ApiError(
        "声音资产与当前业务空间不同，请切回创建时的配置。",
        409,
      );
  }
  async function checkVoice(r, c) {
    const result = await request(
      c,
      "/services/audio/tts/customization",
      {
        model: "voice-enrollment",
        input: { action: "query_voice", voice_id: r.remoteVoiceId },
      },
      {},
      false,
    );
    if (result.output?.target_model !== TTS_MODEL)
      throw new ApiError("声线对应模型与本 Demo 的 TTS 模型不一致。", 502);
    if (result.output.status !== "OK") {
      r.status = "pending";
      r.error = `平台声线状态：${String(result.output.status || "未知")}。请稍后检查声线状态。`;
      return;
    }
    r.status = "completed";
    r.error = undefined;
    const previous = db.voices[db.bindings[bindingKey(r.owner, r.characterId)]];
    if (!previous || previous.createdAt <= r.createdAt)
      db.bindings[bindingKey(r.owner, r.characterId)] = r.id;
  }
  app.post(
    "/api/speech/voices",
    handle(async (req, res) => {
      const { submissionId, sampleId, characterId, name } = req.body || {};
      safeCharacter(characterId);
      if (typeof name !== "string" || !name.trim() || name.length > 80)
        throw new ApiError("请填写声线名称。");
      const body = { sampleId, characterId, name: name.trim() },
        dedup = existing(db.voices, submissionId, req.demoOwner, body);
      if (dedup.r) return res.json(voiceView(dedup.r));
      const c = requireConfig(req.demoOwner),
        sample = owned(db.samples, sampleId, req.demoOwner);
      const r = {
        id: submissionId,
        owner: req.demoOwner,
        workspaceId: c.workspaceId,
        sampleId,
        characterId,
        name: name.trim(),
        status: "processing",
        createdAt: Date.now(),
        fingerprint: dedup.fingerprint,
      };
      locks.add(submissionId);
      db.voices[submissionId] = r;
      await save();
      void (async () => {
        try {
          const url = await upload(
            c,
            "voice-enrollment",
            await readFile(sample.file),
            sample.type,
            sample.extension,
          );
          const result = await request(
            c,
            "/services/audio/tts/customization",
            {
              model: "voice-enrollment",
              input: {
                action: "create_voice",
                target_model: TTS_MODEL,
                prefix: `muse${submissionId.replaceAll("-", "").slice(0, 6)}`,
                url,
                language_hints: ["zh"],
              },
            },
            { "X-DashScope-OssResourceResolve": "enable" },
            false,
          );
          const remote = result.output?.voice_id;
          if (typeof remote !== "string" || !/^[-\w.]{1,256}$/.test(remote))
            throw new ApiError("声音复刻未返回真实音色 ID。", 502);
          r.remoteVoiceId = remote;
          await save();
          await checkVoice(r, c);
        } catch (e) {
          r.status = r.remoteVoiceId ? "pending" : "failed";
          r.error =
            wanError(e.message, c.apiKey) +
            " 请核对百炼记录，不会自动再次复刻。";
        } finally {
          locks.delete(submissionId);
          await save();
        }
      })().catch(() => {
        r.status = "failed";
        r.error = "本地状态保存失败，请到百炼核对。";
      });
      res.json(voiceView(r));
    }),
  );
  app.post(
    "/api/speech/voices/:id/check",
    handle(async (req, res) => {
      const r = owned(db.voices, req.params.id, req.demoOwner),
        c = requireConfig(req.demoOwner);
      sameWorkspace(c, r);
      if (!r.remoteVoiceId)
        throw new ApiError("尚未取得音色 ID，请先核对复刻任务。");
      await checkVoice(r, c);
      await save();
      res.json(voiceView(r));
    }),
  );
  app.post(
    "/api/speech/bind",
    handle(async (req, res) => {
      const { voiceId, characterId } = req.body || {};
      safeCharacter(characterId);
      const r = owned(db.voices, voiceId, req.demoOwner);
      if (r.status !== "completed") throw new ApiError("只可绑定已就绪声线。");
      db.bindings[bindingKey(req.demoOwner, characterId)] = voiceId;
      await save();
      res.json({ voiceId, characterId });
    }),
  );
  app.post(
    "/api/speech/utterances",
    handle(async (req, res) => {
      const { submissionId, characterId, text } = req.body || {};
      safeCharacter(characterId);
      if (typeof text !== "string" || !text.trim() || text.length > 240)
        throw new ApiError("请输入 1–240 字新台词，建议先用一句短台词。");
      const c = requireConfig(req.demoOwner),
        voiceId = db.bindings[bindingKey(req.demoOwner, characterId)],
        v = owned(db.voices, voiceId, req.demoOwner);
      sameWorkspace(c, v);
      if (v.status !== "completed" || !v.remoteVoiceId)
        throw new ApiError("请先绑定已就绪的复刻声线。");
      const body = { characterId, text: text.trim(), voiceId },
        dedup = existing(db.utterances, submissionId, req.demoOwner, body);
      if (dedup.r) return res.json(utteranceView(dedup.r));
      const r = {
        id: submissionId,
        owner: req.demoOwner,
        workspaceId: c.workspaceId,
        voiceId,
        characterId,
        text: text.trim(),
        status: "processing",
        createdAt: Date.now(),
        fingerprint: dedup.fingerprint,
      };
      db.utterances[r.id] = r;
      await save();
      void (async () => {
        try {
          const result = await request(
            c,
            "/services/audio/tts/SpeechSynthesizer",
            {
              model: TTS_MODEL,
              input: {
                text: r.text,
                voice: v.remoteVoiceId,
                format: "wav",
                sample_rate: 24000,
              },
            },
            {},
            false,
          );
          const audio = result.output?.audio;
          if (!audio) throw new ApiError("语音合成未返回音频。", 502);
          let bytes;
          if (audio.data) bytes = Buffer.from(audio.data, "base64");
          else if (audio.url) {
            r.remoteUrl = await mediaUrl(audio.url);
            await save();
            bytes = await bytesFrom(
              await fetchImpl(r.remoteUrl, {
                signal: AbortSignal.timeout(60000),
                redirect: "error",
              }),
              15 * 1024 * 1024,
            );
          } else throw new ApiError("语音合成未返回音频内容或地址。", 502);
          await archiveAudio(r, bytes);
        } catch (e) {
          r.status = "failed";
          r.error = wanError(e.message, c.apiKey) + " 不会自动再次合成。";
        }
        await save();
      })().catch(() => {
        r.status = "failed";
        r.error = "本地语音归档失败，请先核对百炼结果。";
      });
      res.json(utteranceView(r));
    }),
  );
  async function archiveAudio(r, bytes) {
    const format = await inspectAudio(bytes, "utterance");
    const folder = path.join(directory, r.id);
    await mkdir(folder, { recursive: true });
    const file = path.join(folder, `speech.${format.extension}`);
    await writeFile(`${file}.tmp`, bytes);
    await rename(`${file}.tmp`, file);
    Object.assign(r, format, { file, status: "completed", error: undefined });
  }
  app.post(
    "/api/speech/utterances/:id/recover",
    handle(async (req, res) => {
      const r = owned(db.utterances, req.params.id, req.demoOwner);
      if (r.file || r.status === "processing")
        return res.json(utteranceView(r));
      if (!r.remoteUrl)
        throw new ApiError("没有可取回的语音地址，请先核对百炼记录。");
      r.status = "processing";
      r.error = undefined;
      await save();
      void (async () => {
        try {
          const bytes = await bytesFrom(
            await fetchImpl(await mediaUrl(r.remoteUrl), {
              signal: AbortSignal.timeout(60000),
              redirect: "error",
            }),
            15 * 1024 * 1024,
          );
          await archiveAudio(r, bytes);
        } catch (e) {
          r.status = "failed";
          r.error =
            wanError(e.message) +
            " 取回原结果失败，未重新合成；临时地址可能已过期。";
        }
        await save();
      })().catch(() => {
        r.status = "failed";
        r.error = "本地语音归档失败。";
      });
      res.json(utteranceView(r));
    }),
  );
  app.post(
    "/api/speech/videos",
    handle(async (req, res) => {
      const { submissionId, draft, assets } = req.body || {};
      if (
        !draft ||
        !Array.isArray(assets) ||
        draft.modelId !== LIP_MODEL ||
        !["480p", "720p"].includes(draft.resolution)
      )
        throw new ApiError("请选择万相对口型模型和 480P/720P。");
      const a = owned(db.utterances, draft.speechAudioId, req.demoOwner),
        c = requireConfig(req.demoOwner);
      sameWorkspace(c, a);
      if (
        a.status !== "completed" ||
        !a.file ||
        a.duration <= 0 ||
        a.duration >= 20
      )
        throw new ApiError(
          "对口型语音需已生成，且时长小于 20 秒，请缩短台词后手动重新合成。",
        );
      if (
        a.characterId !== draft.characterId ||
        a.text !== draft.speechText?.trim() ||
        a.voiceId !== db.bindings[bindingKey(req.demoOwner, draft.characterId)]
      )
        throw new ApiError(
          "语音与当前人物、台词或绑定声线不一致，请重新选择匹配的语音。",
        );
      const character = assets.find(
        (v) => v.id === draft.characterId && v.kind === "character",
      );
      if (!character) throw new ApiError("请选择人物图片。");
      const body = { draft, assets },
        dedup = existing(db.videos, submissionId, req.demoOwner, body);
      if (dedup.r) return res.json(videoView(dedup.r));
      locks.add(submissionId);
      try {
        const image = await imageData(character.image);
        const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
        const imageBytes = Buffer.from(match[2], "base64");
        if (
          match[1] === "image/png" &&
          (imageBytes.readUInt32BE(16) < 400 ||
            imageBytes.readUInt32BE(20) < 400 ||
            imageBytes.readUInt32BE(16) > 7000 ||
            imageBytes.readUInt32BE(20) > 7000)
        )
          throw new ApiError("对口型人物图宽高需 400–7000 像素。");
        const r = {
          id: submissionId,
          owner: req.demoOwner,
          workspaceId: c.workspaceId,
          utteranceId: a.id,
          duration: a.duration,
          status: "in_progress",
          providerStatus: "SUBMITTING",
          createdAt: Date.now(),
          fingerprint: dedup.fingerprint,
          nextPoll: 0,
        };
        db.videos[r.id] = r;
        await save();
        void (async () => {
          try {
            const [imageUrl, audioUrl] = await Promise.all([
              upload(
                c,
                LIP_MODEL,
                imageBytes,
                match[1],
                match[1] === "image/jpeg"
                  ? "jpg"
                  : match[1] === "image/webp"
                    ? "webp"
                    : "png",
              ),
              upload(c, LIP_MODEL, await readFile(a.file), a.type, a.extension),
            ]);
            const result = await request(
              c,
              "/services/aigc/image2video/video-synthesis",
              {
                model: LIP_MODEL,
                input: { image_url: imageUrl, audio_url: audioUrl },
                parameters: { resolution: draft.resolution.toUpperCase() },
              },
              { "X-DashScope-OssResourceResolve": "enable" },
            );
            if (!result.output?.task_id || !UUID.test(result.output.task_id))
              throw new ApiError("对口型未返回真实任务 ID。", 502);
            r.remoteId = result.output.task_id;
            r.providerStatus = result.output.task_status || "PENDING";
            r.status = "queued";
          } catch (e) {
            r.status = "failed";
            r.error =
              wanError(e.message, c.apiKey) +
              " 提交结果不明时先核对百炼，不自动重复生成。";
          }
          await save();
        })().catch(() => {
          r.status = "failed";
          r.error = "本地任务保存失败，请核对百炼。";
        });
        res.json(videoView(r));
      } finally {
        locks.delete(submissionId);
      }
    }),
  );
  const polls = new Map();
  app.get(
    "/api/speech/requests/:id",
    handle(async (req, res) => {
      const r = owned(db.videos, req.params.id, req.demoOwner);
      if (final.has(r.status) || !r.remoteId || Date.now() < r.nextPoll)
        return res.json(videoView(r));
      if (!polls.has(r.id))
        polls.set(
          r.id,
          (async () => {
            const c = requireConfig(req.demoOwner);
            sameWorkspace(c, r);
            r.nextPoll = Date.now() + 15000;
            if (!r.remoteUrl) {
              const result = await request(c, `/tasks/${r.remoteId}`),
                o = result.output;
              if (!o || (o.task_id && o.task_id !== r.remoteId))
                throw new ApiError("返回了不匹配的对口型任务。", 502);
              r.providerStatus = o.task_status;
              if (o.task_status === "PENDING") r.status = "queued";
              else if (o.task_status === "RUNNING") r.status = "in_progress";
              else if (o.task_status === "SUCCEEDED") {
                const url = o.results?.video_url || o.video_url;
                if (!url) throw new ApiError("任务成功但未返回视频。", 502);
                r.remoteUrl = await mediaUrl(url);
                r.status = "in_progress";
              } else if (
                ["FAILED", "CANCELED", "UNKNOWN"].includes(o.task_status)
              ) {
                r.status = o.task_status === "CANCELED" ? "canceled" : "failed";
                r.error = wanError(
                  o.message || "对口型任务失败或已过期，请到百炼核对。",
                  c.apiKey,
                );
              } else throw new ApiError("未知对口型状态，请稍后查询。", 502);
              await save();
            }
            if (r.remoteUrl && !r.file) {
              const bytes = await bytesFrom(
                await fetchImpl(await mediaUrl(r.remoteUrl), {
                  signal: AbortSignal.timeout(60000),
                  redirect: "error",
                }),
                120 * 1024 * 1024,
              );
              if (bytes.subarray(4, 8).toString() !== "ftyp")
                throw new ApiError("对口型返回文件不是 MP4。", 502);
              const folder = path.join(directory, r.id);
              await mkdir(folder, { recursive: true });
              const file = path.join(folder, "result.mp4");
              await writeFile(`${file}.tmp`, bytes);
              await rename(`${file}.tmp`, file);
              r.file = file;
              r.status = "completed";
              r.error = undefined;
              await save();
            }
            return videoView(r);
          })().finally(() => polls.delete(r.id)),
        );
      res.json(await polls.get(r.id));
    }),
  );
  function serve(table, download = false) {
    return handle(async (req, res) => {
      const r = owned(table, req.params.id, req.demoOwner);
      if (!r.file) throw new ApiError("音频或视频尚未保存。", 409);
      const file = await realpath(r.file),
        relative = path.relative(await realpath(directory), file);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new ApiError("媒体路径无效。", 502);
      if (download) res.attachment(path.basename(file));
      res.type(table === db.videos ? "video/mp4" : r.type).sendFile(file);
    });
  }
  app.get("/api/speech/samples/:id/media", serve(db.samples));
  app.get("/api/speech/utterances/:id/media", serve(db.utterances));
  app.get("/api/speech/utterances/:id/download", serve(db.utterances, true));
  app.get("/api/speech/requests/:id/media", serve(db.videos));
  app.get("/api/speech/requests/:id/download", serve(db.videos, true));
}
