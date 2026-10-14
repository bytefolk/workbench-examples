import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createApp } from "./app.mjs";
import { inspectAudio, TTS_MODEL, LIP_MODEL } from "./speech.mjs";

// Valid PCM tones verify file handling, never voice similarity or actual model output.
function wav(seconds, rate = 24000, bits = 16) {
  const size = Math.round(seconds * rate) * (bits / 8),
    b = Buffer.alloc(44 + size);
  b.write("RIFF");
  b.writeUInt32LE(36 + size, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE((rate * bits) / 8, 28);
  b.writeUInt16LE(bits / 8, 32);
  b.writeUInt16LE(bits, 34);
  b.write("data", 36);
  b.writeUInt32LE(size, 40);
  return b;
}
const key = "sk-isolated-speech-test-secret";
const remoteId = "22222222-2222-4222-8222-222222222222";
const foreignCookie = "muse_demo_session=33333333-3333-4333-8333-333333333333";
const picture = await readFile(
  new URL("../public/media/portrait.png", import.meta.url),
);
const image = `data:image/png;base64,${picture.toString("base64")}`;
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function fixture(t, options = {}, dataDir) {
  const dir =
    dataDir || (await mkdtemp(path.join(os.tmpdir(), "muse-speech-test-")));
  const calls = [],
    counts = { clone: 0, tts: 0, video: 0, audioDownload: 0 };
  const fakeFetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    if (url.includes("getPolicy"))
      return response({
        data: {
          upload_dir: "dashscope-instant/test",
          upload_host: "https://fixture.oss-cn-beijing.aliyuncs.com",
          oss_access_key_id: "scoped-id",
          signature: "scoped-signature",
          policy: "scoped-policy",
          x_oss_object_acl: "private",
          x_oss_forbid_overwrite: "true",
        },
      });
    if (opts.body instanceof FormData)
      return new Response(null, { status: 200 });
    if (url.includes("customization")) {
      const body = JSON.parse(opts.body);
      if (body.input.action === "create_voice") {
        counts.clone++;
        if (options.cloneError) throw new Error(`unknown submission ${key}`);
        return response({
          output: { voice_id: `qwen-tts-vc-fixture-${counts.clone}` },
        });
      }
      return response({
        output: {
          voice_id: body.input.voice_id,
          target_model: options.targetModel || TTS_MODEL,
          status: options.voiceStatus || "OK",
        },
      });
    }
    if (url.includes("SpeechSynthesizer")) {
      counts.tts++;
      if (options.ttsError) return response({ message: `failure ${key}` }, 403);
      return response({
        output: {
          audio: options.audioByUrl
            ? {
                url: "http://audio.oss-cn-beijing.aliyuncs.com/result.wav?signature=private",
              }
            : { data: wav(options.seconds || 5).toString("base64") },
        },
      });
    }
    if (url.includes("video-synthesis")) {
      counts.video++;
      return response({
        output: { task_id: remoteId, task_status: "PENDING" },
      });
    }
    if (url.includes("/tasks/"))
      return response({
        output: {
          task_id: remoteId,
          task_status: options.videoStatus || "SUCCEEDED",
          results: { video_url: "https://media.fixture/result.mp4" },
          message: `failure ${key}`,
        },
      });
    if (url.includes("result.wav")) {
      counts.audioDownload++;
      if (options.failDownload && counts.audioDownload === 1)
        return new Response("fail", { status: 503 });
      return new Response(wav(options.seconds || 5));
    }
    if (url.includes("media.fixture"))
      return new Response(
        Buffer.concat([
          Buffer.from([0, 0, 0, 24]),
          Buffer.from("ftypisom"),
          Buffer.alloc(20),
        ]),
      );
    throw new Error("Unexpected network call in isolated test");
  };
  const app = await createApp({
    env: {},
    dataDir: dir,
    fetchImpl: fakeFetch,
    checkMediaUrl: async (url) => url,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const request = async (url, data, headers = {}) => {
    const res = await fetch(base + url, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Studio-Client": "1",
        Cookie: cookie,
        ...headers,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (!headers.Cookie && res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    return res;
  };
  const json = async (url, data, headers) => {
    const res = await request(url, data, headers);
    return { status: res.status, data: await res.json() };
  };
  const library = async () => (await json("/api/speech/library")).data;
  async function settle(table, id) {
    for (let i = 0; i < 60; i++) {
      const r = (await library())[table].find((r) => r.id === id);
      if (r && r.status !== "processing") return r;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("Isolated speech operation timed out");
  }
  const configure = () =>
    json("/api/wan/config", { apiKey: key, enabled: true, workspaceId: "" });
  const upload = async (seconds = 10) =>
    (
      await json("/api/speech/samples", {
        name: "测试录音.wav",
        audio: `data:audio/wav;base64,${wav(seconds).toString("base64")}`,
      })
    ).data;
  const clone = async (sampleId, characterId = "p") => {
    const body = {
      submissionId: randomUUID(),
      sampleId,
      characterId,
      name: "隔离测试声线",
    };
    const initial = await json("/api/speech/voices", body);
    assert.equal(initial.status, 200);
    return { body, voice: await settle("voices", body.submissionId) };
  };
  const synth = async (characterId = "p", text = "这是一段新台词。") => {
    const body = { submissionId: randomUUID(), characterId, text };
    const initial = await json("/api/speech/utterances", body);
    assert.equal(initial.status, 200);
    return { body, audio: await settle("utterances", body.submissionId) };
  };
  const videoBody = (audio) => ({
    submissionId: randomUUID(),
    draft: {
      mode: "speech",
      title: "测试口型",
      modelId: LIP_MODEL,
      resolution: "480p",
      characterId: "p",
      speechAudioId: audio.id,
      speechText: audio.text,
    },
    assets: [{ id: "p", kind: "character", image }],
  });
  const settleVideo = async (id) => {
    for (let i = 0; i < 60; i++) {
      const r = await json(`/api/speech/requests/${id}`);
      if (["completed", "failed", "canceled"].includes(r.data.status)) return r;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("Isolated video timed out");
  };
  return {
    dir,
    options,
    counts,
    calls,
    cookie: () => cookie,
    request,
    json,
    library,
    settle,
    configure,
    upload,
    clone,
    synth,
    videoBody,
    settleVideo,
  };
}

test("recording validation measures real duration, sample rate and PCM depth", async () => {
  assert.equal((await inspectAudio(wav(10), "sample")).duration, 10);
  for (const bytes of [
    Buffer.from("not a recording"),
    wav(9),
    wav(21),
    wav(10, 8000),
    wav(10, 24000, 8),
  ])
    await assert.rejects(() => inspectAudio(bytes, "sample"));
  assert.equal((await inspectAudio(wav(21), "utterance")).duration, 21);
});

test("upload stays local without credentials, original audio is private, no automatic generation", async (t) => {
  const f = await fixture(t),
    s = await f.upload();
  assert.equal(s.duration, 10);
  assert.equal((await f.library()).samples.length, 1);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.request(s.audioUrl)).status, 200);
  assert.equal(
    (await f.request(s.audioUrl, undefined, { Cookie: foreignCookie })).status,
    404,
  );
  assert.equal(
    (await f.json("/api/speech/library", undefined, { Cookie: foreignCookie }))
      .data.samples.length,
    0,
  );
  assert.equal(
    (
      await f.json("/api/speech/voices", {
        submissionId: randomUUID(),
        sampleId: s.id,
        characterId: "p",
        name: "test",
      })
    ).status,
    409,
  );
  assert.equal(f.calls.length, 0);
});

test("voice clone uses official model, upload policy and voice_id; ready voice binds once with no TTS/video", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const s = await f.upload(),
    { voice, body } = await f.clone(s.id);
  assert.equal(voice.status, "completed");
  assert.equal(voice.model, TTS_MODEL);
  assert.equal((await f.library()).bindings.p, voice.id);
  await f.json("/api/speech/voices", body);
  assert.equal(f.counts.clone, 1);
  assert.equal(f.counts.tts, 0);
  assert.equal(f.counts.video, 0);
  const policy = f.calls.find((c) => c.url.includes("getPolicy"));
  assert(policy.url.includes("model=voice-enrollment"));
  assert.equal(policy.opts.headers.Authorization, `Bearer ${key}`);
  const storage = f.calls.find((c) => c.opts.body instanceof FormData);
  assert.equal(storage.opts.headers?.Authorization, undefined);
  assert.equal(storage.opts.body.get("OSSAccessKeyId"), "scoped-id");
  assert(storage.opts.body.get("key").endsWith(".wav"));
  const submit = f.calls.find(
    (c) =>
      c.url.includes("customization") &&
      JSON.parse(c.opts.body).input.action === "create_voice",
  );
  const payload = JSON.parse(submit.opts.body);
  assert.equal(payload.model, "voice-enrollment");
  assert.equal(payload.input.target_model, TTS_MODEL);
  assert(payload.input.url.startsWith("oss://dashscope-instant/test/"));
  assert.equal(submit.opts.headers["X-DashScope-OssResourceResolve"], "enable");
  assert.equal(submit.opts.headers["X-DashScope-Async"], undefined);
  assert(!JSON.stringify(await f.library()).includes(key));
});

test("pending or incompatible voice cannot synthesize, manual check does not repeat cloning", async (t) => {
  const f = await fixture(t, { voiceStatus: "PROCESSING" });
  await f.configure();
  const { voice } = await f.clone((await f.upload()).id);
  assert.equal(voice.status, "pending");
  assert.equal((await f.library()).bindings.p, undefined);
  assert.equal(
    (
      await f.json("/api/speech/utterances", {
        submissionId: randomUUID(),
        characterId: "p",
        text: "新台词",
      })
    ).status,
    404,
  );
  f.options.targetModel = "other-model";
  assert.equal(
    (await f.json(`/api/speech/voices/${voice.id}/check`, {})).status,
    502,
  );
  f.options.targetModel = TTS_MODEL;
  f.options.voiceStatus = "OK";
  assert.equal(
    (await f.json(`/api/speech/voices/${voice.id}/check`, {})).data.status,
    "completed",
  );
  assert.equal(f.counts.clone, 1);
  assert.equal(f.counts.tts, 0);
});

test("new text uses bound voice, archives playable WAV, duplicate submission stays single and changed text conflicts", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const { voice } = await f.clone((await f.upload()).id),
    { audio, body } = await f.synth();
  assert.equal(audio.status, "completed");
  assert.equal(audio.duration, 5);
  assert.equal(audio.canLipSync, true);
  const submit = f.calls.find((c) => c.url.includes("SpeechSynthesizer"));
  const payload = JSON.parse(submit.opts.body);
  assert.equal(payload.model, TTS_MODEL);
  assert.equal(payload.input.voice, voice.remoteVoiceId);
  assert.equal(payload.input.text, body.text);
  assert.equal(submit.opts.headers["X-DashScope-Async"], undefined);
  await f.json("/api/speech/utterances", body);
  assert.equal(
    (await f.json("/api/speech/utterances", { ...body, text: "另一句话" }))
      .status,
    409,
  );
  assert.equal(f.counts.tts, 1);
  assert.equal(f.counts.video, 0);
  const ranged = await f.request(audio.audioUrl, undefined, {
    Range: "bytes=0-43",
  });
  assert.equal(ranged.status, 206);
  assert.equal((await ranged.arrayBuffer()).byteLength, 44);
  const download = await f.request(
    `/api/speech/utterances/${audio.id}/download`,
  );
  assert(download.headers.get("content-disposition").includes("attachment"));
  assert.equal(
    (await f.request(audio.audioUrl, undefined, { Cookie: foreignCookie }))
      .status,
    404,
  );
});

test("download failure recovers the original audio without calling TTS again or returning signed URLs", async (t) => {
  const f = await fixture(t, { audioByUrl: true, failDownload: true });
  await f.configure();
  await f.clone((await f.upload()).id);
  const { audio } = await f.synth();
  assert.equal(audio.status, "failed");
  assert.equal(audio.canRecover, true);
  assert(!JSON.stringify(audio).includes("signature=private"));
  assert(
    f.calls.some((c) =>
      c.url.startsWith("https://audio.oss-cn-beijing.aliyuncs.com"),
    ),
  );
  await f.json(`/api/speech/utterances/${audio.id}/recover`, {});
  assert.equal((await f.settle("utterances", audio.id)).status, "completed");
  assert.equal(f.counts.tts, 1);
  assert.equal(f.counts.audioDownload, 2);
  assert.equal(f.counts.video, 0);
});

test("long audio, edited text, different person and changed bound voice block paid lip-sync submission", async (t) => {
  const f = await fixture(t, { seconds: 21 });
  await f.configure();
  const s = await f.upload(),
    first = await f.clone(s.id);
  const { audio: long } = await f.synth();
  assert.equal(long.canLipSync, false);
  assert.equal(
    (await f.json("/api/speech/videos", f.videoBody(long))).status,
    400,
  );
  f.options.seconds = 5;
  const { audio } = await f.synth("p", "短台词");
  for (const change of [
    { speechText: "修改后台词" },
    { characterId: "another" },
  ]) {
    const body = f.videoBody(audio);
    Object.assign(body.draft, change);
    assert.equal((await f.json("/api/speech/videos", body)).status, 400);
  }
  await f.clone(s.id); // A newer voice becomes the current binding.
  assert.equal(
    (await f.json("/api/speech/videos", f.videoBody(audio))).status,
    400,
  );
  await f.json("/api/speech/bind", {
    voiceId: first.voice.id,
    characterId: "p",
  });
  const foreign = await f.json("/api/speech/videos", f.videoBody(audio), {
    Cookie: foreignCookie,
  });
  assert.equal(foreign.status, 404);
  assert.equal(f.counts.video, 0);
});

test("lip sync uploads separate model-bound image/audio, sends only official inputs, archives nested MP4 and deduplicates", async (t) => {
  const f = await fixture(t);
  await f.configure();
  await f.clone((await f.upload()).id);
  const { audio } = await f.synth(),
    body = f.videoBody(audio);
  assert.equal((await f.json("/api/speech/videos", body)).status, 200);
  const result = await f.settleVideo(body.submissionId);
  assert.equal(result.data.status, "completed");
  assert.equal(result.data.duration, 5);
  await f.json("/api/speech/videos", body);
  assert.equal(f.counts.video, 1);
  const submit = f.calls.find((c) => c.url.includes("video-synthesis")),
    payload = JSON.parse(submit.opts.body);
  assert.deepEqual(Object.keys(payload.input).sort(), [
    "audio_url",
    "image_url",
  ]);
  assert(payload.input.audio_url.endsWith(".wav"));
  assert(payload.input.image_url.endsWith(".png"));
  assert.equal(payload.model, LIP_MODEL);
  assert.deepEqual(payload.parameters, { resolution: "480P" });
  assert.equal(submit.opts.headers["X-DashScope-Async"], "enable");
  assert.equal(submit.opts.headers["X-DashScope-OssResourceResolve"], "enable");
  assert.equal(
    f.calls.filter(
      (c) =>
        c.url.includes("getPolicy") && c.url.includes(`model=${LIP_MODEL}`),
    ).length,
    2,
  );
  const media = await f.request(result.data.video, undefined, {
    Range: "bytes=0-11",
  });
  assert.equal(media.status, 206);
  assert.equal(
    (await f.request(result.data.video, undefined, { Cookie: foreignCookie }))
      .status,
    404,
  );
  assert.equal(
    f.calls.find((c) => c.url.includes("media.fixture")).opts.headers
      ?.Authorization,
    undefined,
  );
  assert(
    (
      await readFile(
        path.join(f.dir, "speech", body.submissionId, "result.mp4"),
      )
    ).length > 12,
  );
});

test("failures are redacted and retained without mock fallback or automatic paid retries", async (t) => {
  const failed = await fixture(t, { cloneError: true });
  await failed.configure();
  const { voice, body } = await failed.clone((await failed.upload()).id);
  assert.equal(voice.status, "failed");
  assert(!voice.error.includes(key));
  await failed.json("/api/speech/voices", body);
  assert.equal(failed.counts.clone, 1);
  const f = await fixture(t, { videoStatus: "UNKNOWN" });
  await f.configure();
  await f.clone((await f.upload()).id);
  const { audio } = await f.synth(),
    video = f.videoBody(audio);
  await f.json("/api/speech/videos", video);
  const result = await f.settleVideo(video.submissionId);
  assert.equal(result.data.status, "failed");
  assert.equal(result.data.video, undefined);
  assert(!result.data.error.includes(key));
  await f.json("/api/speech/videos", video);
  assert.equal(f.counts.video, 1);
});

test("voice assets, bindings and audio survive restart without new supplier requests", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const { voice } = await f.clone((await f.upload()).id),
    { audio } = await f.synth();
  await new Promise((r) => setTimeout(r, 30));
  const restored = await fixture(t, {}, f.dir);
  const lib = (
    await restored.json("/api/speech/library", undefined, {
      Cookie: f.cookie(),
    })
  ).data;
  assert.equal(lib.bindings.p, voice.id);
  assert.equal(lib.utterances[0].status, "completed");
  assert.equal(
    (await restored.request(audio.audioUrl, undefined, { Cookie: f.cookie() }))
      .status,
    200,
  );
  assert.equal(restored.calls.length, 0);
});
