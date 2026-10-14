import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createApp } from "./app.mjs";
import { buildWanInput, wanBase, wanEstimate } from "./wan.mjs";
import {
  WAN_MODELS,
  wanModel,
  wanRate,
  normalizeWanDraft,
} from "../shared/wan-models.mjs";
const id = "11111111-1111-4111-8111-111111111111";
const remoteId = "22222222-2222-4222-8222-222222222222";
const key = "sk-isolated-wan-test-secret";
const pngBytes = Buffer.alloc(32);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(pngBytes);
pngBytes.writeUInt32BE(240, 16);
pngBytes.writeUInt32BE(320, 20);
pngBytes[25] = 2;
const png = `data:image/png;base64,${pngBytes.toString("base64")}`;
const draft = {
  title: "隔离接口测试",
  mode: "wan",
  modelId: "wan2.6-i2v-flash",
  prompt: "人物戴着帽子微笑",
  duration: 5,
  resolution: "720p",
  generateAudio: false,
  characterId: "p",
  wanFrameAssetId: "p",
  shots: [{ description: "保持首帧人物，微笑", narration: "" }],
};
const assets = [
  { id: "p", kind: "character", image: png },
  { id: "h", kind: "product", image: png },
  { id: "s", kind: "scene", image: png },
];
const body = { submissionId: id, draft, assets };
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
async function fixture(t, implementation, env = {}, dataDir) {
  const dir =
    dataDir || (await mkdtemp(path.join(os.tmpdir(), "muse-wan-test-")));
  let calls = 0,
    submits = 0;
  const requests = [];
  const fakeFetch = async (url, opts = {}) => {
    calls++;
    requests.push({ url, opts });
    if (opts.method === "POST") submits++;
    if (implementation) return implementation(url, opts);
    if (url.includes("video-synthesis"))
      return response({
        output: { task_id: remoteId, task_status: "PENDING" },
      });
    if (url.includes("/tasks/"))
      return response({
        output: {
          task_id: remoteId,
          task_status: "SUCCEEDED",
          video_url: "https://media.fixture/result.mp4",
        },
      });
    return new Response(
      Buffer.concat([
        Buffer.from([0, 0, 0, 24]),
        Buffer.from("ftypisom"),
        Buffer.alloc(20),
      ]),
      { headers: { "Content-Type": "video/mp4" } },
    );
  };
  const app = await createApp({
    env,
    dataDir: dir,
    fetchImpl: fakeFetch,
    checkMediaUrl: async (value) => value,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const request = async (url, value, headers = {}) => {
    const res = await fetch(base + url, {
      method: value === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Studio-Client": "1",
        Cookie: cookie,
        ...headers,
      },
      body: value === undefined ? undefined : JSON.stringify(value),
    });
    if (res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    return res;
  };
  const json = async (url, value, headers) => {
    const res = await request(url, value, headers);
    return { status: res.status, data: await res.json() };
  };
  return {
    dir,
    request,
    json,
    requests,
    calls: () => calls,
    submits: () => submits,
    cookie: () => cookie,
    configure: () =>
      json("/api/wan/config", {
        apiKey: key,
        workspaceId: "test-workspace",
        enabled: true,
      }),
    settle: async () => {
      for (let i = 0; i < 35; i++) {
        const r = await json(`/api/wan/requests/${id}`);
        if (
          r.data.status === "completed" ||
          r.data.status === "failed" ||
          r.status !== 200
        )
          return r;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error("isolated task timed out");
    },
  };
}
test("save, replace and clear page credentials without network calls, key echo or cross-session access", async (t) => {
  const f = await fixture(t);
  const saved = await f.configure();
  assert.equal(saved.status, 200);
  assert.equal(saved.data.configured, true);
  assert(!JSON.stringify(saved.data).includes(key));
  assert.equal(f.calls(), 0);
  const replaced = await f.json("/api/wan/config", {
    workspaceId: "next-workspace",
    enabled: false,
  });
  assert.equal(replaced.data.workspaceId, "next-workspace");
  assert.equal(replaced.data.configured, true);
  const stored = await readFile(path.join(f.dir, "wan/settings.json"), "utf8");
  assert(stored.includes(key));
  const stolen = await f.json("/api/wan/config", undefined, {
    Cookie: "muse_demo_session=33333333-3333-4333-8333-333333333333",
  });
  assert.equal(stolen.data.configured, false);
  // Restore the original browser cookie before clearing its configuration.
  const owner = Object.keys(JSON.parse(stored))[0];
  const cleared = await f.json(
    "/api/wan/config/clear",
    {},
    { Cookie: `muse_demo_session=${owner}` },
  );
  assert.equal(cleared.data.configured, false);
  assert.equal(cleared.data.enabled, false);
  assert.equal(f.calls(), 0);
});
test("page settings survive restart; clear disables environment fallback for current session", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const cookie = f.cookie();
  const restored = await fixture(t, undefined, {}, f.dir);
  const cfg = await restored.json("/api/wan/config", undefined, {
    Cookie: cookie,
  });
  assert.equal(cfg.data.configured, true);
  const env = await fixture(t, undefined, {
    WAN_API_KEY: key,
    WAN_ENABLE_REAL: "true",
  });
  assert.equal((await env.json("/api/wan/config")).data.source, "environment");
  await env.json("/api/wan/config/clear", {});
  assert.equal((await env.json("/api/wan/config")).data.configured, false);
});
test("unconfigured, disabled, invalid settings and cross-origin writes block before any paid call", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.json("/api/wan/videos", body)).status, 409);
  assert.equal(
    (
      await f.json("/api/wan/config", {
        apiKey: key,
        workspaceId: "https://evil.example",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.json(
        "/api/wan/config",
        { apiKey: key },
        { Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  await f.json("/api/wan/config", { apiKey: key, enabled: false });
  assert.equal((await f.json("/api/wan/videos", body)).status, 409);
  assert.equal(f.calls(), 0);
});
test("input contract sends one frame, explicit audio, duration, resolution and no invented ratio", () => {
  const payload = buildWanInput(draft, png);
  assert.equal(payload.input.img_url, png);
  assert.equal(payload.input.image_urls, undefined);
  assert.equal(payload.parameters.audio, false);
  assert.equal(payload.parameters.resolution, "720P");
  assert.equal(payload.parameters.duration, 5);
  assert.equal(payload.parameters.aspect_ratio, undefined);
  assert.equal(wanEstimate(draft), 0.75);
  assert.equal(wanEstimate({ ...draft, generateAudio: true }), 1.5);
  assert.throws(() => buildWanInput({ ...draft, duration: 24 }, png));
  assert.throws(() =>
    buildWanInput(
      { ...draft, shots: [{ description: "很".repeat(1600) }] },
      png,
    ),
  );
  assert.throws(() => wanBase("../evil"));
  assert.equal(wanBase(), "https://dashscope.aliyuncs.com/api/v1");
});
test("shared model registry normalizes only UI selection and quotes valid Beijing model rates", () => {
  assert.deepEqual(
    WAN_MODELS.map((model) => model.id),
    ["wan2.6-i2v-flash", "wan2.6-i2v", "wan2.2-i2v-flash"],
  );
  assert.equal(wanModel("unknown"), undefined);
  assert.throws(() => normalizeWanDraft(draft, "unknown"));
  const standard = normalizeWanDraft(draft, "wan2.6-i2v");
  assert.equal(standard.generateAudio, true);
  assert.equal(wanRate(standard), 0.6);
  assert.equal(wanEstimate(standard), 3);
  const old = normalizeWanDraft(
    { ...draft, duration: 15, generateAudio: true, wanShotType: "multi" },
    "wan2.2-i2v-flash",
  );
  assert.equal(old.duration, 5);
  assert.equal(old.generateAudio, false);
  assert.equal(old.wanShotType, "single");
  assert.equal(wanRate(old), 0.2);
  assert.equal(wanEstimate(old), 1);
  assert.equal(draft.modelId, "wan2.6-i2v-flash");
  assert.equal(wanEstimate({ ...draft, modelId: "unknown" }), null);
  assert.equal(wanEstimate({ ...draft, resolution: "480p" }), null);
  assert.equal(wanEstimate({ ...old, duration: 10 }), null);
  assert.equal(wanEstimate({ ...standard, generateAudio: false }), null);
  assert.equal(wanEstimate({ ...old, generateAudio: true }), null);
  assert.equal(wanEstimate({ ...old, resolution: "480p" }), 0.5);
  assert.equal(wanEstimate({ ...old, resolution: "1080p" }), 2.4);
  assert.equal(wanEstimate({ ...standard, resolution: "1080p" }), 5);
  const reset = normalizeWanDraft(
    { ...old, resolution: "480p" },
    "wan2.6-i2v-flash",
  );
  assert.equal(reset.resolution, "720p");
  assert.equal(reset.generateAudio, false);
});
test("each selected model uses its own supported parameter contract and combined prompt limit", () => {
  for (const model of WAN_MODELS) {
    const selected = normalizeWanDraft(draft, model.id);
    const payload = buildWanInput(selected, png);
    assert.equal(payload.model, model.id);
    assert.equal(payload.parameters.duration, 5);
    assert.equal(payload.input.img_url, png);
    assert.equal(payload.input.audio_url, undefined);
    assert.equal(payload.parameters.aspect_ratio, undefined);
    assert.equal(
      payload.parameters.shot_type,
      model.multiShot ? "single" : undefined,
    );
    assert.equal(
      payload.parameters.audio,
      model.audioMode === "toggle" ? false : undefined,
    );
    for (const resolution of model.resolutions)
      assert.equal(
        buildWanInput({ ...selected, resolution }, png).parameters.resolution,
        resolution.toUpperCase(),
      );
    const overhead =
      buildWanInput({ ...selected, prompt: "字" }, png).input.prompt.length - 1;
    const maxPrompt = "字".repeat(model.promptLimit - overhead);
    assert.equal(
      buildWanInput({ ...selected, prompt: maxPrompt }, png).input.prompt
        .length,
      model.promptLimit,
    );
    assert.throws(() =>
      buildWanInput({ ...selected, prompt: `${maxPrompt}字` }, png),
    );
  }
  assert.equal(
    buildWanInput({ ...draft, duration: 2, wanShotType: "multi" }, png)
      .parameters.shot_type,
    "multi",
  );
  assert.equal(
    buildWanInput({ ...draft, duration: 15, generateAudio: true }, png)
      .parameters.audio,
    true,
  );
});
test("all advertised choices reach the provider with the actual selected model, never a Flash fallback", async (t) => {
  for (const model of WAN_MODELS) {
    const f = await fixture(t);
    const config = await f.configure();
    assert.deepEqual(
      config.data.models.map((item) => item.id),
      WAN_MODELS.map((item) => item.id),
    );
    const selected = normalizeWanDraft(draft, model.id);
    const result = await f.json("/api/wan/videos", {
      ...body,
      draft: selected,
    });
    assert.equal(result.status, 200);
    assert.equal(result.data.estimatedCny, wanEstimate(selected));
    assert.equal((await f.settle()).data.status, "completed");
    const post = f.requests.find((request) => request.opts.method === "POST");
    assert(
      post.url.endsWith("/services/aigc/video-generation/video-synthesis"),
    );
    const payload = JSON.parse(post.opts.body);
    assert.equal(payload.model, model.id);
    assert.deepEqual(payload, buildWanInput(selected, png));
    assert.equal(f.submits(), 1);
    const stored = JSON.parse(
      await readFile(path.join(f.dir, "wan/state.json"), "utf8"),
    );
    assert.equal(stored[id].modelId, model.id);
  }
});
test("unsupported model settings are rejected before fetching media or any paid submission", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const invalid = [
    { modelId: "wan2.7-i2v" },
    { resolution: "480p" },
    { duration: 1 },
    { duration: 16 },
    { duration: 2.5 },
    { generateAudio: "false" },
    { wanShotType: "invented" },
    { modelId: "wan2.6-i2v", generateAudio: false },
    { modelId: "wan2.2-i2v-flash", generateAudio: true },
    { modelId: "wan2.2-i2v-flash", duration: 10 },
    { modelId: "wan2.2-i2v-flash", wanShotType: "multi" },
    { modelId: "wan2.2-i2v-flash", prompt: "字".repeat(800) },
  ];
  for (const change of invalid) {
    const result = await f.json("/api/wan/videos", {
      ...body,
      draft: { ...draft, ...change },
    });
    assert.equal(result.status, 400, JSON.stringify(change));
  }
  assert.equal(f.calls(), 0);
  assert.equal(f.submits(), 0);
});
test("submit once, poll real status, archive MP4 and serve ranged download without media credentials", async (t) => {
  const f = await fixture(t);
  await f.configure();
  const first = await f.json("/api/wan/videos", body);
  assert.equal(first.status, 200);
  assert.equal(first.data.canCancel, false);
  const result = await f.settle();
  assert.equal(result.data.status, "completed");
  assert.equal(result.data.providerStatus, "SUCCEEDED");
  await f.json("/api/wan/videos", body);
  assert.equal(f.submits(), 1);
  assert.equal(
    (
      await f.json("/api/wan/videos", {
        ...body,
        draft: { ...draft, duration: 6 },
      })
    ).status,
    409,
  );
  const submit = f.requests.find((r) => r.opts.method === "POST");
  assert.equal(submit.opts.headers.Authorization, `Bearer ${key}`);
  assert.equal(submit.opts.headers["X-DashScope-Async"], "enable");
  assert.equal(JSON.parse(submit.opts.body).input.img_url, png);
  const download = f.requests.find((r) => r.url.includes("media.fixture"));
  assert.equal(download.opts.headers?.Authorization, undefined);
  const range = await f.request(result.data.video, undefined, {
    Range: "bytes=0-11",
  });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 12);
  const file = await f.request(`/api/wan/requests/${id}/download`);
  assert(file.headers.get("content-disposition").includes("attachment"));
  const stolen = await f.request(result.data.video, undefined, {
    Cookie: "muse_demo_session=33333333-3333-4333-8333-333333333333",
  });
  assert.equal(stolen.status, 404);
  assert(
    (await readFile(path.join(f.dir, "wan", id, "result.mp4"))).length > 12,
  );
});
test("bad input, transparent or tiny PNG fail before generation", async (t) => {
  const f = await fixture(t);
  await f.configure();
  assert.equal(
    (
      await f.json("/api/wan/videos", {
        ...body,
        draft: { ...draft, duration: 30 },
      })
    ).status,
    400,
  );
  const tiny = Buffer.from(pngBytes);
  tiny.writeUInt32BE(1, 16);
  const transparent = Buffer.from(pngBytes);
  transparent[25] = 6;
  for (const bytes of [tiny, transparent])
    assert.equal(
      (
        await f.json("/api/wan/videos", {
          ...body,
          assets: [
            {
              ...assets[0],
              image: `data:image/png;base64,${bytes.toString("base64")}`,
            },
          ],
        })
      ).status,
      400,
    );
  assert.equal(f.submits(), 0);
});
test("platform failure and UNKNOWN are failures; no mock video or automatic regeneration", async (t) => {
  for (const state of ["FAILED", "UNKNOWN"]) {
    const f = await fixture(t, async (url) =>
      url.includes("video-synthesis")
        ? response({ output: { task_id: remoteId, task_status: "PENDING" } })
        : response({
            output: {
              task_id: remoteId,
              task_status: state,
              message: `failure ${key}`,
            },
          }),
    );
    await f.configure();
    await f.json("/api/wan/videos", body);
    const result = await f.settle();
    assert.equal(result.data.status, "failed");
    assert.equal(result.data.video, undefined);
    assert(!result.data.error.includes(key));
    await f.json("/api/wan/videos", body);
    assert.equal(f.submits(), 1);
  }
});
test("ambiguous submission is retained locally and cannot repeat its paid request", async (t) => {
  const f = await fixture(t, async () => {
    throw new Error("network timeout");
  });
  await f.configure();
  await f.json("/api/wan/videos", body);
  const result = await f.settle();
  assert.equal(result.data.status, "failed");
  assert(result.data.error.includes("未确认"));
  await f.json("/api/wan/videos", body);
  assert.equal(f.submits(), 1);
});
test("download retry resumes the existing result without querying or generating a second video", async (t) => {
  let downloads = 0,
    queries = 0;
  const f = await fixture(t, async (url) => {
    if (url.includes("video-synthesis"))
      return response({
        output: { task_id: remoteId, task_status: "PENDING" },
      });
    if (url.includes("/tasks/")) {
      queries++;
      return response({
        output: {
          task_id: remoteId,
          task_status: "SUCCEEDED",
          video_url: "https://media.fixture/result.mp4",
        },
      });
    }
    if (++downloads === 1)
      return new Response("temporary failure", { status: 503 });
    return new Response(
      Buffer.concat([
        Buffer.from([0, 0, 0, 24]),
        Buffer.from("ftypisom"),
        Buffer.alloc(20),
      ]),
    );
  });
  await f.configure();
  await f.json("/api/wan/videos", body);
  assert.equal((await f.settle()).status, 502);
  const persisted = JSON.parse(
    await readFile(path.join(f.dir, "wan/state.json"), "utf8"),
  );
  assert.equal(persisted[id].status, "in_progress");
  assert.equal(persisted[id].videoUrl, "https://media.fixture/result.mp4");
  await new Promise((resolve) => setTimeout(resolve, 15020));
  const retried = await f.json(`/api/wan/requests/${id}`);
  assert.equal(retried.data.status, "completed");
  assert.equal(f.submits(), 1);
  assert.equal(queries, 1);
  assert.equal(downloads, 2);
});
